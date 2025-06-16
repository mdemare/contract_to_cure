require 'minitest/autorun'
require 'minitest/pride'
require 'rack/test'
require 'json'
require 'redis'
require 'yaml'
require 'securerandom'
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
    @original_game_state = nil
  end

  def teardown
    # Clean up test Redis keys
    @redis.del(@test_redis_key) if @test_redis_key

    # Restore original game state if it was backed up
    return unless @original_game_state

    @redis.set('contract-to-cure/current-game', @original_game_state)
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
    game_data = YAML.dump(game_state, permitted_classes: [GameState, Player, Card, City])
    @redis.setex(@test_redis_key, 300, game_data) # 300 seconds = 5 minutes

    # Override the current game state in the application
    backup_current_game_state
    @redis.set('contract-to-cure/current-game', game_data)

    game_state
  end

  def backup_current_game_state
    @original_game_state = @redis.get('contract-to-cure/current-game')
  end

  def create_game_with_custom_state
    game_state = create_test_game_state
    yield(game_state) if block_given?

    # Save the modified state
    game_data = YAML.dump(game_state, permitted_classes: [GameState, Player, Card, City])
    @redis.setex(@test_redis_key, 300, game_data)
    @redis.set('contract-to-cure/current-game', game_data)

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
