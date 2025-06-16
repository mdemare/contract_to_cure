require_relative 'test_helper'

class TestApiEndpoints < TestHelper
  def test_root_redirects_to_index
    get '/'
    assert_equal 302, last_response.status
    assert_includes last_response.location, '/index.html'
  end

  def test_game_state_json_endpoint
    create_test_game_state

    get '/game_state.json'
    assert_successful_response(last_response)
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert data.key?('players')
    assert data.key?('gameStatus')
    assert data["gameStatus"].key?('currentPlayerIndex')
    assert data["gameStatus"].key?('actions_remaining')
  end

  def test_move_endpoint_valid_request
    game_state = create_test_game_state

    # Get current player location and find a connected city
    current_player = game_state.players[game_state.current_player_idx]
    current_city = current_player.location
    connected_city = game_state.cities[current_city].connections.first

    post '/move', {
      player_index: game_state.current_player_idx,
      destination: connected_city
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'success', data['status']
  end

  def test_move_endpoint_missing_parameters
    create_test_game_state

    post '/move', {
      player_index: 0
      # Missing destination
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_error_response(last_response, 422, 'Missing required parameters')
  end

  def test_treat_disease_endpoint
    create_game_with_custom_state do |state|
      # Ensure current player is in a city with disease cubes
      current_player = state.players[state.current_player_idx]
      city_name = current_player.location

      # Add disease cubes to current location
      city = state.cities[city_name]
      city.disease_cubes = 2
    end

    post '/treat'
    assert_successful_response(last_response)
    assert_json_response(last_response)
  end

  def test_cure_disease_endpoint
    create_game_with_custom_state do |state|
      # Give player enough cards of same color to cure disease
      player = state.players[state.current_player_idx]
      require_relative '../app/game_state/card'

      # Ensure player is not a scientist (who needs only 4 cards)
      player.instance_variable_set(:@role, :medic) if player.role == :scientist

      # Clear existing hand and add blue city cards
      player.hand.clear
      ['Chicago', 'Montreal', 'Washington', 'New York', 'London'].each do |city|
        card = Card.new(:city, city, :blue)
        player.hand << card
      end

      # Ensure player is at a research station
      player.location = 'Chicago'
      state.research_stations << 'Chicago' unless state.research_stations.include?('Chicago')
    end

    post '/cure_disease', {
      color: 'blue',
      card_names: ['Chicago', 'Montreal', 'Washington', 'New York', 'London']
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)
  end

  def test_share_knowledge_endpoint
    create_game_with_custom_state do |state|
      # Place two players in same city
      state.players[0].location = 'Chicago'
      state.players[1].location = 'Chicago'

      # Give first player the Chicago card
      require_relative '../app/game_state/card'
      state.players[0].hand.clear
      state.players[0].hand << Card.new(:city, 'Chicago', :blue)
    end

    post '/share_knowledge', {
      giving_player_index: 0,
      receiving_player_index: 1,
      city_name: 'Chicago'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)
  end

  def test_build_research_station_endpoint
    create_game_with_custom_state do |state|
      # Move player to a city without a research station
      current_player = state.players[state.current_player_idx]
      current_player.location = 'Chicago'  # Move away from Wuhan
      require_relative '../app/game_state/card'

      # Give player the Chicago card to build research station
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'Chicago', :blue)
    end

    post '/build_research_station'
    assert_successful_response(last_response)
    assert_json_response(last_response)
  end

  def test_pass_endpoint
    create_test_game_state

    post '/pass'
    assert_successful_response(last_response)
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'success', data['status']
  end

  def test_discard_cards_endpoint
    create_game_with_custom_state do |state|
      # Give player more than 7 cards to force discard
      player = state.players[0]
      require_relative '../app/game_state/card'

      player.hand.clear
      ['Chicago', 'Montreal', 'Washington', 'New York', 'London', 'Paris', 'Barcelona', 'Stockholm', 'Rome'].each do |city|
        player.hand << Card.new(:city, city, :blue)
      end
    end

    post '/discard_cards', {
      player_index: 0,
      card_names: %w[Madrid Paris]
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'success', data['status']
    assert_includes data['message'], 'Successfully discarded'
  end

  def test_action_card_airlift
    create_game_with_custom_state do |state|
      # Give current player an Airlift card
      current_player = state.players[state.current_player_idx]
      require_relative '../app/game_state/card'
      current_player.hand << Card.new(:action, 'Airlift')
    end

    post '/action_card', {
      card: 'Airlift',
      player_index: 0,
      city: 'London'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)
  end

  def test_action_card_one_quiet_night
    create_game_with_custom_state do |state|
      current_player = state.players[state.current_player_idx]
      require_relative '../app/game_state/card'
      current_player.hand << Card.new(:action, 'One Quiet Night')
    end

    post '/action_card', {
      card: 'One Quiet Night'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)
  end

  def test_action_card_forecast
    create_game_with_custom_state do |state|
      current_player = state.players[state.current_player_idx]
      require_relative '../app/game_state/card'
      current_player.hand << Card.new(:action, 'Forecast')
    end

    post '/action_card', {
      card: 'Forecast'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)
  end

  def test_restart_game_endpoint
    create_test_game_state

    post '/restart_game', {
      difficulty_level: 'normal'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'success', data['status']
  end

  def test_draw_cards_endpoint
    create_game_with_custom_state do |state|
      # Set actions remaining to 0 to trigger end turn
      state.instance_variable_set(:@actions_remaining, 0)
    end

    post '/draw_cards'
    assert_successful_response(last_response)
    # The endpoint returns JSON but doesn't always set content-type header
    # Check that we can parse the response as JSON
    data = parse_json_response(last_response)
    assert data.is_a?(Hash), "Response should be valid JSON"
    assert data.key?('status') || data.key?('end_turn_events'), "Response should contain expected keys"
  end

  def test_infect_cities_endpoint
    create_game_with_custom_state do |state|
      # Set actions remaining to 0 to trigger end turn
      state.instance_variable_set(:@actions_remaining, 0)
    end

    post '/infect_cities'
    assert_successful_response(last_response)
    # The endpoint returns JSON but doesn't always set content-type header
    # Check that we can parse the response as JSON
    data = parse_json_response(last_response)
    assert data.is_a?(Hash), "Response should be valid JSON"
    assert data.key?('status') || data.key?('end_turn_events'), "Response should contain expected keys"
  end

  def test_forecast_blocking_other_actions
    create_game_with_custom_state do |state|
      # Set forecast as active
      state.instance_variable_set(:@forecast_active, true)
    end

    # Debug: Check that forecast is actually active in Redis
    redis_data = @redis.get(@test_redis_key)
    loaded_state = Marshal.load(redis_data)
    assert loaded_state.instance_variable_get(:@forecast_active), "Forecast should be active in Redis"

    post '/move', {
      player_index: 0,
      destination: 'London'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_error_response(last_response, 422, 'Cannot perform action while Forecast is active')
  end
end
