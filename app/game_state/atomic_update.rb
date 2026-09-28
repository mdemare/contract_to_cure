require_relative '../services/game_redis_pool'

# Optimistic unit of work for one read-modify-write of the shared game.
#
# While an update is active on the current thread, GameState#save_game_state
# only records the game as dirty. The update remembers the raw value it loaded
# and, when the block finishes, writes the dirty game once with WATCH/MULTI,
# provided the stored value still matches what was loaded. Otherwise nothing is
# written and GameState::ConflictError is raised. An exception inside the block
# also discards every pending save, so a failed request never persists partially.
class GameStateAtomicUpdate
  THREAD_KEY = :game_state_atomic_update

  attr_reader :redis_key, :game_state

  def self.current
    Thread.current[THREAD_KEY]
  end

  def self.run(redis_key)
    raise ArgumentError, 'Nested game state updates are not supported' if current

    update = new(redis_key)
    Thread.current[THREAD_KEY] = update
    result = yield update
    update.commit!
    result
  ensure
    Thread.current[THREAD_KEY] = nil if update
  end

  def initialize(redis_key)
    @redis_key = redis_key
    @snapshot_loaded = false
    @game_state = nil
  end

  def covers?(redis_key)
    redis_key == @redis_key
  end

  # Records the value this update's changes are based on. Only the first read
  # counts; later reads within the same request cannot move the baseline.
  def record_snapshot(raw_value)
    return if @snapshot_loaded

    @snapshot = raw_value
    @snapshot_loaded = true
  end

  def defer_save(game_state)
    @game_state = game_state
  end

  def dirty?
    !@game_state.nil?
  end

  def commit!
    return unless dirty?
    raise GameState::ConflictError, 'Game update has no loaded baseline' unless @snapshot_loaded

    payload = @game_state.serialized_state
    GameRedisPool.with do |redis|
      committed = redis.watch(@redis_key) do
        raise GameState::ConflictError unless redis.get(@redis_key) == @snapshot

        redis.multi { |transaction| transaction.set(@redis_key, payload) }
      end
      # EXEC returns nil when another client changed the key after WATCH.
      raise GameState::ConflictError if committed.nil?
    end
    @snapshot = payload
    @game_state = nil
  end
end
