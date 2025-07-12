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

  private

  def create_test_game_state
    game_state = GameState.new(2, :normal)
    game_state.save_game_state
  end
end
