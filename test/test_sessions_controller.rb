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

  def test_create_session_with_valid_oauth_data
    # Mock the OmniAuth callback
    OmniAuth.config.test_mode = true
    OmniAuth.config.mock_auth[:google_oauth2] = OmniAuth::AuthHash.new(@auth_hash)

    # Simulate OAuth callback
    post '/auth/google_oauth2'
    follow_redirect!
    get '/auth/google_oauth2/callback'
    follow_redirect!

    assert last_response.ok?
    assert_includes last_response.body, 'Contract To Cure'

    # Verify user data was stored in Redis
    user_key = "google_oauth2_user:123456"
    assert @redis.exists?(user_key)

    stored_email = @redis.hget(user_key, 'email')
    assert_equal 'test@example.com', stored_email
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
    @redis.del("google_oauth2_user:123456")
  end
end
