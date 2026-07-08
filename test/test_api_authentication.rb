require_relative 'test_helper'

class TestApiAuthentication < TestHelper
  def test_game_state_requires_auth_when_bypass_disabled
    create_test_game_state

    with_required_auth do
      get '/game_state.json'

      assert_error_response(last_response, 401, 'Authentication required')
    end
  end

  def test_mutating_endpoint_requires_auth_when_bypass_disabled
    create_test_game_state

    with_required_auth do
      post '/restart_game', {}.to_json, { 'CONTENT_TYPE' => 'application/json' }

      assert_error_response(last_response, 401, 'Authentication required')
    end
  end

  def test_invalid_auth_token_is_rejected
    create_test_game_state

    with_required_auth do
      set_auth_cookie('not-a-jwt')
      get '/game_state.json'

      assert_error_response(last_response, 401, 'Invalid authentication token')
    end
  end

  def test_expired_auth_token_is_rejected
    create_test_game_state

    with_required_auth do
      set_auth_cookie(auth_token(exp: 1.hour.ago.to_i))
      get '/game_state.json'

      assert_error_response(last_response, 401, 'Authentication token has expired')
    end
  end

  def test_valid_auth_token_allows_game_state
    create_test_game_state

    with_required_auth do
      set_auth_cookie
      get '/game_state.json'

      assert_successful_response(last_response)
      data = parse_json_response(last_response)
      assert_equal '123', data['current_user']['uid']
      assert_equal 'test@example.com', data['current_user']['email']
      assert_equal 'Test User', data['current_user']['name']
    end
  end

  def test_test_environment_bypass_remains_explicit
    create_test_game_state

    get '/game_state.json'

    assert_successful_response(last_response)
  end
end
