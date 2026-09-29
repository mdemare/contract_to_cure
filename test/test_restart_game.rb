require_relative 'test_helper'

class TestRestartGame < Minitest::Test
  include Rack::Test::Methods

  def app
    Rails.application
  end

  def test_restart_game_returns_success_true
    # Create initial game state
    create_test_game_state

    # Call restart game
    post '/restart_game', {}.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert last_response.ok?
    data = JSON.parse(last_response.body)

    # Check that success: true is returned
    assert_equal true, data['success'], "Expected success: true in response"
    assert_equal 'success', data['status']
    assert_equal 'Game restarted successfully', data['message']
  end

  def test_restart_game_with_difficulty
    create_test_game_state

    post '/restart_game', {
      difficulty_level: 'heroic'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert last_response.ok?
    data = JSON.parse(last_response.body)

    assert_equal true, data['success']
    assert_equal 'success', data['status']

    # Verify game state was reset
    get '/game_state.json'
    assert last_response.ok?

    state = JSON.parse(last_response.body)
    # NOTE: The API returns camelCase keys
    assert_equal 1, state['gameStatus']['turn']
    assert_equal 4, state['gameStatus']['actions_remaining']
    assert_equal false, state['gameStatus']['gameOver']
    # Difficulty level is not included in the game status response
  end

  def test_restart_game_basic_functionality
    # Create initial game
    create_test_game_state

    # Call restart game
    post '/restart_game', {}.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert last_response.ok?
    data = JSON.parse(last_response.body)
    assert_equal true, data['success']

    # Verify game state after restart
    get '/game_state.json'
    state = JSON.parse(last_response.body)

    # Check initial game state values
    assert_equal 1, state['gameStatus']['turn']
    assert_equal 4, state['gameStatus']['actions_remaining']
    assert_equal 0, state['gameStatus']['outbreaks']
    assert_equal 0, state['gameStatus']['infectionRatePosition']
    assert_equal false, state['gameStatus']['gameOver']
    assert_equal 'player_actions', state['gameStatus']['phase']
  end

  def test_restart_after_yaml_reload_keeps_heroic_difficulty
    GameState.new(2, :heroic).save_game_state

    reloaded = GameState.load_from_redis
    assert_equal :heroic, reloaded.difficulty_level

    post '/restart_game', {}.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert last_response.ok?

    restarted = GameState.load_from_redis
    assert_equal :heroic, restarted.difficulty_level
    assert_equal 6, epidemic_count(restarted)
  end

  def test_restart_after_yaml_reload_keeps_introductory_difficulty
    GameState.new(2, :introductory).save_game_state

    post '/restart_game', {}.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert last_response.ok?

    restarted = GameState.load_from_redis
    assert_equal :introductory, restarted.difficulty_level
    assert_equal 4, epidemic_count(restarted)
  end

  def test_older_save_without_difficulty_defaults_to_configured_difficulty
    game_state = GameState.new(2, :normal)
    state = YAML.load(game_state.serialized_state, permitted_classes: [Symbol])
    state[:game_status].delete(:difficulty_level)
    GameRedisPool.with { |redis| redis.set(GameState.current_redis_key, state.to_yaml) }

    assert_equal Rails.application.config.default_difficulty, GameState.load_from_redis.difficulty_level
  end

  def test_restart_with_unknown_difficulty_is_validation_error
    create_test_game_state
    before = GameRedisPool.with { |redis| redis.get(GameState.current_redis_key) }

    post '/restart_game', { difficulty_level: 'nightmare' }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_equal 422, last_response.status
    data = JSON.parse(last_response.body)
    assert_equal 'error', data['status']
    assert_equal 'Invalid parameters', data['message']
    assert_equal before, GameRedisPool.with { |redis| redis.get(GameState.current_redis_key) }
  end

  private

  def epidemic_count(game_state)
    game_state.player_deck.count { |card| card.type == :epidemic }
  end

  def create_test_game_state
    game_state = GameState.new(2, :normal)
    game_state.save_game_state
  end
end
