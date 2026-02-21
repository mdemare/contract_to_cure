require_relative 'test_helper'

class TestGameRedisPool < TestHelper
  def test_pool_is_memoized
    first_pool = GameRedisPool.pool
    second_pool = GameRedisPool.pool

    assert_same first_pool, second_pool
  end

  def test_reset_pool_rebuilds_connection_pool
    first_pool = GameRedisPool.pool
    GameRedisPool.reset_pool!
    second_pool = GameRedisPool.pool

    refute_same first_pool, second_pool
  end

  def test_invalid_pool_env_values_fallback_to_defaults
    ENV['REDIS_POOL_SIZE'] = 'invalid'
    ENV['REDIS_POOL_TIMEOUT'] = 'invalid'
    GameRedisPool.reset_pool!

    pool = GameRedisPool.pool

    assert_equal GameRedisPool::DEFAULT_POOL_SIZE, pool.size
    assert_equal GameRedisPool::DEFAULT_POOL_TIMEOUT, pool.instance_variable_get(:@timeout)
  ensure
    ENV.delete('REDIS_POOL_SIZE')
    ENV.delete('REDIS_POOL_TIMEOUT')
    GameRedisPool.reset_pool!
  end
end
