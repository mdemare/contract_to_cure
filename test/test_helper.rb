ENV['RACK_ENV'] = 'test'

require 'minitest/autorun'
require 'minitest/pride'
require 'rack/test'
require 'json'
require 'redis'
require 'yaml'
require 'securerandom'

# Set Sinatra settings before loading the app
require 'sinatra/base'
Sinatra::Base.set :environment, :test
Sinatra::Base.set :protection, false

require_relative '../app/sinatra'
require_relative '../app/game_state/player'
require_relative '../app/game_state/card'
require_relative '../app/game_state/city'

class TestHelper < Minitest::Test
  include Rack::Test::Methods

  def app
    Sinatra::Application
  end

  def setup
    @redis = Redis.new(url: ENV['REDIS_URL'] || 'redis://localhost:6379')
    @test_redis_key = generate_test_redis_key
    # Set thread-local variable for game state to use
    Thread.current[:game_redis_key] = @test_redis_key
  end

  def teardown
    # Clean up test Redis keys
    @redis.del(@test_redis_key) if @test_redis_key
    
    # Clear thread-local variable
    Thread.current[:game_redis_key] = nil
  end

  private

  def generate_test_redis_key
    "contract-to-cure/test-#{SecureRandom.hex(8)}-#{Time.now.to_i}"
  end

  def create_test_game_state(difficulty = :heroic, players_count = 4)
    # Create a new game state for testing
    game_state = GameState.new(players_count, difficulty)

    # Ensure we have actions remaining for testing
    game_state.instance_variable_set(:@actions_remaining, 4)

    # Save to test Redis key with 5-minute expiry
    game_data = Marshal.dump(game_state)
    @redis.setex(@test_redis_key, 300, game_data) # 300 seconds = 5 minutes

    game_state
  end

  def create_game_with_custom_state
    game_state = create_test_game_state
    yield(game_state) if block_given?

    # Save the modified state
    game_data = Marshal.dump(game_state)
    @redis.setex(@test_redis_key, 300, game_data)

    game_state
  end

  def parse_json_response(response)
    JSON.parse(response.body)
  end

  def assert_successful_response(response, message = "Expected successful response")
    assert response.successful?, "#{message}. Status: #{response.status}, Body: #{response.body}"
  end

  def assert_json_response(response, message = "Expected JSON response")
    assert_equal 'application/json', response.content_type, message
    begin
      JSON.parse(response.body)
    rescue JSON::ParserError => e
      flunk "Failed to parse JSON response: #{e.message}"
    end
  end

  def assert_error_response(response, expected_status, message = nil)
    assert_equal expected_status, response.status
    return unless message

    parsed = parse_json_response(response)
    assert_includes parsed['message'], message
  end
end
