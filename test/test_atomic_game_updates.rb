require_relative 'test_helper'

class TestAtomicGameUpdates < TestHelper
  JSON_HEADERS = { 'CONTENT_TYPE' => 'application/json' }.freeze

  def setup
    super
    create_game_with_custom_state do |state|
      state.players[0].instance_variable_set(:@role, :scientist)
      state.players[0].location = 'London'
    end
  end

  # Request A loads the game, then waits while request B completes. Both started
  # from the same snapshot, so only one may be acknowledged.
  def test_interleaved_moves_from_same_snapshot_never_lose_an_acknowledged_update
    stale, fresh = interleave_requests(
      stale: -> { post_json('/move', player_index: 0, destination: 'Paris') },
      fresh: -> { post_json('/move', player_index: 0, destination: 'Stockholm') }
    )

    assert_equal 200, fresh.status, fresh.body
    assert_equal 409, stale.status, stale.body
    stale_body = JSON.parse(stale.body)
    assert_equal 'conflict', stale_body['status']
    assert_equal false, stale_body['success']
    assert_equal 'Stockholm', stale_body.dig('game_state', 'players', 0, 'location')

    saved = GameState.load_from_redis(@test_redis_key)
    assert_equal 'Stockholm', saved.players[0].location
    assert_equal 3, saved.actions_remaining

    # The rejected client retries against the current state; both moves count.
    retried = post_json('/move', player_index: 0, destination: 'London')
    assert_equal 200, retried.status, retried.body
    saved = GameState.load_from_redis(@test_redis_key)
    assert_equal 'London', saved.players[0].location
    assert_equal 2, saved.actions_remaining
  end

  def test_stale_restart_is_rejected_without_writing
    stale, fresh = interleave_requests(
      stale: -> { post_json('/restart_game', {}) },
      fresh: -> { post_json('/move', player_index: 0, destination: 'Paris') }
    )

    assert_equal 200, fresh.status, fresh.body
    assert_equal 409, stale.status, stale.body
    saved = GameState.load_from_redis(@test_redis_key)
    assert_equal 'Paris', saved.players[0].location
    assert_equal 3, saved.actions_remaining
  end

  def test_concurrent_draw_cards_progresses_the_turn_only_once
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@actions_remaining, 0)
      state.instance_variable_set(:@phase, 'draw_cards')
    end
    deck_size = GameState.load_from_redis(@test_redis_key).player_deck.size

    stale, fresh = interleave_requests(
      stale: -> { post_json('/draw_cards', {}) },
      fresh: -> { post_json('/draw_cards', {}) }
    )

    assert_equal 200, fresh.status, fresh.body
    assert_equal 409, stale.status, stale.body
    saved = GameState.load_from_redis(@test_redis_key)
    assert_equal deck_size - 2, saved.player_deck.size
    assert_includes %w[infect_cities pending_discard], saved.phase
  end

  def test_read_only_request_does_not_conflict_with_concurrent_update
    stale, fresh = interleave_requests(
      stale: -> { get_request('/game_state.json') },
      fresh: -> { post_json('/move', player_index: 0, destination: 'Paris') }
    )

    assert_equal 200, fresh.status, fresh.body
    assert_equal 200, stale.status, stale.body
    assert_equal 'Paris', GameState.load_from_redis(@test_redis_key).players[0].location
  end

  def test_saves_are_deferred_until_the_update_commits
    before = @redis.get(@test_redis_key)

    GameState.atomic_update do
      game = GameState.load_from_redis
      game.move(0, 'Paris', nil)
      game.move(0, 'London', nil)
      assert_equal before, @redis.get(@test_redis_key)
    end

    saved = GameState.load_from_redis(@test_redis_key)
    assert_equal 'London', saved.players[0].location
    assert_equal 2, saved.actions_remaining
  end

  def test_exception_inside_update_discards_pending_saves
    before = @redis.get(@test_redis_key)

    assert_raises(RuntimeError) do
      GameState.atomic_update do
        GameState.load_from_redis.move(0, 'Paris', nil)
        raise 'boom'
      end
    end

    assert_equal before, @redis.get(@test_redis_key)
    assert_nil GameStateAtomicUpdate.current
  end

  def test_stale_update_raises_conflict_and_writes_nothing
    GameState.atomic_update do
      GameState.load_from_redis.move(0, 'Paris', nil)
      redis_key = @test_redis_key
      Thread.new do
        Thread.current[:game_redis_key] = redis_key
        GameState.atomic_update { GameState.load_from_redis.move(0, 'Stockholm', nil) }
      end.join
    end
    flunk 'Expected a conflict'
  rescue GameState::ConflictError
    saved = GameState.load_from_redis(@test_redis_key)
    assert_equal 'Stockholm', saved.players[0].location
    assert_equal 3, saved.actions_remaining
  end

  def test_new_game_is_not_committed_over_a_game_created_concurrently
    @redis.del(@test_redis_key)

    assert_raises(GameState::ConflictError) do
      GameState.atomic_update do
        assert_nil GameState.load_from_redis
        GameState.new(4, :heroic)
        @redis.set(@test_redis_key, 'created elsewhere')
      end
    end

    assert_equal 'created elsewhere', @redis.get(@test_redis_key)
  end

  def test_save_without_loaded_baseline_is_rejected
    before = @redis.get(@test_redis_key)

    assert_raises(GameState::ConflictError) do
      GameState.atomic_update { GameState.new(4, :heroic) }
    end

    assert_equal before, @redis.get(@test_redis_key)
  end

  def test_watch_abort_is_reported_as_conflict
    snapshot = @redis.get(@test_redis_key)
    game = GameState.load_from_redis(@test_redis_key)
    fake_redis = Object.new
    fake_redis.define_singleton_method(:get) { |_key| snapshot }
    fake_redis.define_singleton_method(:watch) { |_key, &block| block.call }
    # EXEC returns nil when a watched key changed between GET and EXEC.
    fake_redis.define_singleton_method(:multi) { |&_block| nil }

    update = GameStateAtomicUpdate.new(@test_redis_key)
    update.record_snapshot(snapshot)
    update.defer_save(game)

    replacing_singleton_method(GameRedisPool, :with, ->(&block) { block.call(fake_redis) }) do
      assert_raises(GameState::ConflictError) { update.commit! }
    end
    assert update.dirty?
  end

  def test_nested_updates_are_rejected
    GameState.atomic_update do
      assert_raises(ArgumentError) { GameState.atomic_update { nil } }
    end
  end

  def test_save_outside_an_update_writes_immediately
    game = GameState.load_from_redis(@test_redis_key)
    game.move(0, 'Paris', nil)

    assert_equal 'Paris', GameState.load_from_redis(@test_redis_key).players[0].location
  end

  private

  def replacing_singleton_method(target, name, implementation)
    original = target.method(name)
    target.define_singleton_method(name, &implementation)
    yield
  ensure
    target.define_singleton_method(name, original)
  end

  def post_json(path, body)
    Rack::MockRequest.new(app).post(path, input: body.to_json, **JSON_HEADERS)
  end

  def get_request(path)
    Rack::MockRequest.new(app).get(path)
  end

  # Runs `stale` in a thread that is paused right after loading the game, runs
  # `fresh` to completion, then lets `stale` finish. Returns both responses.
  def interleave_requests(stale:, fresh:)
    loaded = Queue.new
    resume = Queue.new
    original_load = GameState.method(:load_from_redis)
    pausing_load = lambda do |*args|
      result = original_load.call(*args)
      if Thread.current[:pause_after_game_load]
        Thread.current[:pause_after_game_load] = false
        loaded << true
        resume.pop
      end
      result
    end

    replacing_singleton_method(GameState, :load_from_redis, pausing_load) do
      redis_key = @test_redis_key
      stale_thread = Thread.new do
        Thread.current[:game_redis_key] = redis_key
        Thread.current[:pause_after_game_load] = true
        stale.call
      end
      loaded.pop
      fresh_response = fresh.call
      resume << true
      [stale_thread.value, fresh_response]
    end
  end
end
