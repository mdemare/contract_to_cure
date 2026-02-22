require 'connection_pool'
require 'redis'

module GameRedisPool
  DEFAULT_URL = 'redis://localhost:6379'
  DEFAULT_POOL_SIZE = 5
  DEFAULT_POOL_TIMEOUT = 5

  class << self
    def with
      pool.with { |redis| yield(redis) }
    end

    def pool
      @pool ||= ConnectionPool.new(size: pool_size, timeout: pool_timeout) do
        Redis.new(url: redis_url)
      end
    end

    def reset_pool!
      @pool = nil
    end

    private

    def redis_url
      ENV['REDIS_URL'] || DEFAULT_URL
    end

    def pool_size
      parse_integer_env('REDIS_POOL_SIZE', DEFAULT_POOL_SIZE)
    end

    def pool_timeout
      parse_integer_env('REDIS_POOL_TIMEOUT', DEFAULT_POOL_TIMEOUT)
    end

    def parse_integer_env(key, default_value)
      value = ENV[key]
      return default_value if value.nil? || value.strip.empty?

      Integer(value)
    rescue ArgumentError
      default_value
    end
  end
end
