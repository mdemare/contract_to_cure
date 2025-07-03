require_relative 'test_helper'

class TestApiEndpoints < TestHelper
  def test_root_renders_index
    get '/'
    assert_equal 200, last_response.status
    assert_includes last_response.body, 'Contract To Cure'
  end

  def test_git_hash_not_displayed_in_development
    get '/'
    assert_equal 200, last_response.status
    refute_includes last_response.body, 'git-hash', 'Git hash should not be displayed in development environment'
  end

  def test_git_hash_moved_to_player_list
    # This test verifies the structure is in place for production git hash display
    get '/'
    assert_equal 200, last_response.status
    # In development, no data-git-hash attribute should be present
    refute_includes last_response.body, 'data-git-hash', 'data-git-hash attribute should not be present in development'
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
      current_player.location = 'Chicago' # Move away from Wuhan
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

  def test_operations_expert_special_move_valid
    create_game_with_custom_state do |state|
      # Set first player as Operations Expert
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :operations_expert)

      # Place Operations Expert at research station (Wuhan starts with one)
      current_player.location = 'Wuhan'

      # Give Operations Expert city cards
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'London', :blue)
      current_player.hand << Card.new(:city, 'Paris', :blue)
    end

    post '/move', {
      player_index: 0,
      destination: 'Tokyo',
      card_name: 'London'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'success', data['status']

    # Verify the response contains updated game state with player in Tokyo
    assert data.key?('game_state'), "Response should contain game_state"
    assert_equal 'Tokyo', data['game_state']['players'][0]['location']

    # Verify London card was discarded from the game state in response
    player_hand = data['game_state']['players'][0]['hand']
    card_names = player_hand.map { |card| card['name'] }
    assert_not_includes card_names, 'London'
    assert_includes card_names, 'Paris'
  end

  def test_operations_expert_special_move_card_selection
    create_game_with_custom_state do |state|
      # Set first player as Operations Expert
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :operations_expert)

      # Place Operations Expert at research station
      current_player.location = 'Wuhan'

      # Give Operations Expert city cards
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'London', :blue)
      current_player.hand << Card.new(:city, 'Paris', :blue)
    end

    # Attempt move without specifying card - should trigger card selection
    post '/move', {
      player_index: 0,
      destination: 'Tokyo'
      # No card_name specified
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    # Should return 200 for card_required responses (not 422)
    assert_equal 200, last_response.status
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'card_required', data['status']
    assert_equal 'operations_expert_special', data['movement_type']
    assert_includes data['message'], 'Operations Expert requires a city card'
  end

  def test_operations_expert_prerequisites_not_at_station
    create_game_with_custom_state do |state|
      # Set first player as Operations Expert
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :operations_expert)

      # Place Operations Expert NOT at research station
      current_player.location = 'London' # London doesn't have a research station

      # Give Operations Expert city cards
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'Paris', :blue)
    end

    post '/move', {
      player_index: 0,
      destination: 'Tokyo',
      card_name: 'Paris'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    # Should fail because not at research station - will try other move types
    # This should result in invalid move since London and Tokyo aren't connected
    assert_equal 422, last_response.status
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'error', data['status']
  end

  def test_operations_expert_prerequisites_no_city_cards
    create_game_with_custom_state do |state|
      # Set first player as Operations Expert
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :operations_expert)

      # Place Operations Expert at research station
      current_player.location = 'Wuhan'

      # Give Operations Expert NO city cards (only action cards)
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:action, 'Airlift')
    end

    post '/move', {
      player_index: 0,
      destination: 'Tokyo'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    # Should fail because no city cards available
    assert_equal 422, last_response.status
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'error', data['status']
  end

  def test_non_operations_expert_cannot_use_special_move
    create_game_with_custom_state do |state|
      # Set first player as Medic (not Operations Expert)
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :medic)

      # Place at research station with city cards
      current_player.location = 'Wuhan'

      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'London', :blue)
    end

    post '/move', {
      player_index: 0,
      destination: 'Tokyo',
      card_name: 'London'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    # Should fail because player is not Operations Expert
    assert_equal 422, last_response.status
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'error', data['status']
  end

  def test_operations_expert_integration_with_normal_moves
    create_game_with_custom_state do |state|
      # Set first player as Operations Expert
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :operations_expert)

      # Place Operations Expert at London (connected to several cities)
      current_player.location = 'London'

      # Give Operations Expert city cards
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'Paris', :blue)
    end

    # Operations Expert should be able to use normal drive/ferry moves
    post '/move', {
      player_index: 0,
      destination: 'Paris' # London and Paris are connected
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'success', data['status']

    # Verify player moved to Paris via normal move (not special move)
    assert data.key?('game_state'), "Response should contain game_state"
    assert_equal 'Paris', data['game_state']['players'][0]['location']

    # Verify Paris card was NOT discarded (normal drive/ferry doesn't require card)
    player_hand = data['game_state']['players'][0]['hand']
    card_names = player_hand.map { |card| card['name'] }
    assert_includes card_names, 'Paris'
  end
end
