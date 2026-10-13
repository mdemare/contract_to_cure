require_relative 'test_helper'

class TestSessionsController < TestHelper
  def setup
    super
    @redis = Redis.new(url: ENV['REDIS_URL'] || 'redis://localhost:6379')
    @auth_hash = {
      'provider' => 'google_oauth2',
      'uid' => '123456',
      'info' => {
        'email' => 'test@example.com',
        'name' => 'Test User',
        'image' => 'http://example.com/image.jpg'
      }
    }
  end

  def test_destroy_session
    # Test logout endpoint responds correctly
    delete '/logout'

    assert last_response.redirect?
    follow_redirect!
    assert_equal '/', last_request.path
  end

  def test_authentication_failure
    get '/auth/failure', { message: 'invalid_credentials' }

    assert last_response.redirect?
    follow_redirect!
    assert_equal '/', last_request.path
  end

  def test_session_routes_redirect_during_forecast
    create_game_with_custom_state do |game|
      game.instance_variable_set(:@forecast_active, true)
    end

    previous_env = %w[AUTH_SERVICE_URL SUBDOMAIN DOMAIN_NAME].to_h { |name| [name, ENV[name]] }
    ENV['AUTH_SERVICE_URL'] = 'https://auth.example.com'
    ENV['SUBDOMAIN'] = 'game'
    ENV['DOMAIN_NAME'] = 'example.com'

    get '/login'
    assert last_response.redirect?, "GET /login: #{last_response.status} #{last_response.body}"
    assert_equal 'https://auth.example.com/login?return_url=https%3A%2F%2Fgame.example.com',
                 last_response.location

    delete '/logout'
    assert last_response.redirect?, "DELETE /logout: #{last_response.status} #{last_response.body}"

    get '/auth/failure', { message: 'invalid_credentials' }
    assert last_response.redirect?, "GET /auth/failure: #{last_response.status} #{last_response.body}"
  ensure
    previous_env&.each { |name, value| restore_env_value(name, value) }
  end

  def test_session_routes_do_not_touch_game_state
    # Simulate Redis being down: every game state read or write goes through GameRedisPool.with
    GameRedisPool.singleton_class.alias_method(:__original_with, :with)
    GameRedisPool.define_singleton_method(:with) { |*| raise Redis::CannotConnectError, 'Redis is down' }

    delete '/logout'
    assert last_response.redirect?, "DELETE /logout: #{last_response.status} #{last_response.body}"

    get '/auth/failure', { message: 'invalid_credentials' }
    assert last_response.redirect?, "GET /auth/failure: #{last_response.status} #{last_response.body}"
  ensure
    GameRedisPool.singleton_class.alias_method(:with, :__original_with)
    GameRedisPool.singleton_class.remove_method(:__original_with)
  end

  def test_current_user_helper
    # Create a test game state first
    create_test_game_state

    # Test with development mode user
    ENV['SKIP_AUTH'] = 'true'
    get '/game_state.json'

    assert last_response.ok?

    json_response = JSON.parse(last_response.body)
    assert_equal 'dev_user', json_response['current_user']['uid']
    assert_equal 'dev@example.com', json_response['current_user']['email']
    assert_equal 'Development User', json_response['current_user']['name']

    ENV.delete('SKIP_AUTH')
  end

  def test_current_user_helper_without_session
    # Create a test game state first
    create_test_game_state

    get '/game_state.json'

    assert last_response.ok?

    json_response = JSON.parse(last_response.body)
    assert_nil json_response['current_user']
  end

  def teardown
    super
    # Clean up test data from Redis
    @redis.del("google_user:123456")
  end
end
