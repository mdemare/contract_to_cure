require_relative 'test_helper'

class TestApiEndpoints < TestHelper
  def test_root_renders_index
    get '/'
    assert_equal 200, last_response.status
    assert_includes last_response.body, 'Contract To Cure'
  end

  def test_deployment_healthcheck_routes
    get '/up'
    assert_equal 200, last_response.status

    get '/health'
    assert_equal 200, last_response.status
  end

  def test_git_hash_not_displayed_in_development
    get '/'
    assert_equal 200, last_response.status
    refute_includes last_response.body, 'git-hash', 'Git hash should not be displayed in development environment'
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

  def test_game_state_json_includes_saved_game_over_reason
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@game_over, true)
      state.instance_variable_set(:@game_over_reason, :too_many_outbreaks)
    end

    get '/game_state.json'
    assert_successful_response(last_response)

    game_status = parse_json_response(last_response)['gameStatus']
    assert_equal true, game_status['gameOver']
    assert_equal 'too_many_outbreaks', game_status['gameOverReason']
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

  def test_move_endpoint_rejects_moving_another_pawn_without_dispatcher
    create_game_with_custom_state do |state|
      state.players[0].instance_variable_set(:@role, :medic)
      state.players[0].location = 'London'
      state.players[1].instance_variable_set(:@role, :scientist)
      state.players[1].location = 'London'
    end

    post '/move', {
      player_index: 1,
      destination: 'Paris'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_equal 422, last_response.status
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'error', data['status']
    assert_includes data['message'], 'Dispatcher'

    saved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 'London', saved_state.players[1].location
  end

  def test_dispatcher_can_move_another_pawn_by_drive_or_ferry
    create_game_with_custom_state do |state|
      state.players[0].instance_variable_set(:@role, :dispatcher)
      state.players[0].location = 'Wuhan'
      state.players[1].instance_variable_set(:@role, :medic)
      state.players[1].location = 'London'
    end

    post '/move', {
      player_index: 1,
      destination: 'Paris'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'success', data['status']
    assert_equal 'Paris', data['game_state']['players'][1]['location']
    assert_equal 'Wuhan', data['game_state']['players'][0]['location']
  end

  def test_dispatcher_can_move_any_pawn_to_city_with_another_pawn
    create_game_with_custom_state do |state|
      state.players[0].instance_variable_set(:@role, :dispatcher)
      state.players[0].location = 'Wuhan'
      state.players[1].instance_variable_set(:@role, :medic)
      state.players[1].location = 'London'
      state.players[2].instance_variable_set(:@role, :scientist)
      state.players[2].location = 'Tokyo'
    end

    post '/move', {
      player_index: 1,
      destination: 'Tokyo'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'success', data['status']
    assert_equal 'Tokyo', data['game_state']['players'][1]['location']
  end

  def test_dispatcher_pays_card_cost_when_moving_another_pawn_by_flight
    create_game_with_custom_state do |state|
      state.players[0].instance_variable_set(:@role, :dispatcher)
      state.players[0].location = 'Wuhan'
      state.players[0].hand.clear
      state.players[0].hand << Card.new(:city, 'Tokyo', :red)

      state.players[1].instance_variable_set(:@role, :medic)
      state.players[1].location = 'London'
      state.players[1].hand.clear
    end

    post '/move', {
      player_index: 1,
      destination: 'Tokyo'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'success', data['status']
    assert_equal 'Tokyo', data['game_state']['players'][1]['location']
    assert_empty data['game_state']['players'][0]['hand']
    assert_empty data['game_state']['players'][1]['hand']
  end

  def test_move_endpoint_missing_parameters
    create_test_game_state

    post '/move', {
      player_index: 0
      # Missing destination
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_error_response(last_response, 422, 'Missing required parameters')
  end

  def test_move_endpoint_missing_player_index
    create_test_game_state

    post '/move', {
      destination: 'London'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_error_response(last_response, 422, 'Missing required parameters')
  end

  def test_protected_player_action_endpoints_return_error_object_outside_player_actions_phase
    protected_endpoints = [
      ['/move', { player_index: 0, destination: 'London' }],
      ['/treat', {}],
      ['/cure_disease', { color: 'blue', card_names: [] }],
      ['/retrieve', { action_card_name: 'Airlift' }],
      ['/share_knowledge', { giving_player_index: 0, receiving_player_index: 1, city_name: 'Chicago' }],
      ['/build_research_station', {}]
    ]

    protected_endpoints.each do |path, payload|
      create_game_with_custom_state do |state|
        state.instance_variable_set(:@actions_remaining, 0)
        state.instance_variable_set(:@phase, 'draw_cards')
      end

      post path, payload.to_json, { 'CONTENT_TYPE' => 'application/json' }

      assert_equal 422, last_response.status, "#{path} should reject outside player_actions"
      assert_json_response(last_response)
      data = parse_json_response(last_response)
      assert_instance_of Hash, data, "#{path} should return a JSON object"
      assert_equal({ 'status' => 'error', 'message' => 'No more actions allowed' }, data)
    end
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

  def test_share_knowledge_endpoint_missing_indices
    create_test_game_state

    post '/share_knowledge', {
      city_name: 'Chicago'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_error_response(last_response, 422, 'Missing required parameters')
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
      # Put player in the required hand-limit discard state.
      player = state.players[0]
      require_relative '../app/game_state/card'

      player.hand.clear
      ['Chicago', 'Montreal', 'Washington', 'New York', 'London', 'Paris', 'Barcelona', 'Stockholm', 'Rome'].each do |city|
        player.hand << Card.new(:city, city, :blue)
      end
      state.set_pending_hand_limit(0, 'infect_cities')
    end

    post '/discard_cards', {
      player_index: 0,
      card_names: %w[Paris Rome]
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_json_response(last_response)

    data = parse_json_response(last_response)
    assert_equal 'success', data['status']
    assert_includes data['message'], 'Successfully discarded'

    saved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 'infect_cities', saved_state.phase
    assert_nil saved_state.pending_hand_limit
    assert_equal 7, saved_state.players[0].hand.size
  end

  def test_discard_cards_rejects_unsolicited_discard
    create_test_game_state

    post '/discard_cards', {
      player_index: 0,
      card_names: ['Chicago']
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_error_response(last_response, 422, 'No hand-limit discard is pending')
  end

  def test_discard_cards_requires_exact_pending_count
    create_game_with_custom_state do |state|
      player = state.players[0]
      player.hand.clear
      ['Chicago', 'Montreal', 'Washington', 'New York', 'London', 'Paris', 'Barcelona', 'Stockholm', 'Rome'].each do |city|
        player.hand << Card.new(:city, city, :blue)
      end
      state.set_pending_hand_limit(0, 'infect_cities')
    end

    post '/discard_cards', {
      player_index: 0,
      card_names: ['Paris']
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_error_response(last_response, 422, 'Must discard exactly 2')
    saved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 9, saved_state.players[0].hand.size
    assert_equal 'pending_discard', saved_state.phase
  end

  def test_discard_cards_endpoint_invalid_card_names_type
    create_test_game_state

    post '/discard_cards', {
      player_index: 0,
      card_names: 'Chicago'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_error_response(last_response, 422, 'Invalid parameters')
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

  # cc-435: a missing or out-of-range player_index used to raise (500), and -1
  # moved the last player.
  def test_action_card_airlift_without_valid_player_index
    [[nil, 'No player given for Airlift'], [4, 'Unknown player 4'], [-1, 'Unknown player -1']].each do |index, message|
      create_game_with_custom_state do |state|
        require_relative '../app/game_state/card'
        state.players[state.current_player_idx].hand << Card.new(:action, 'Airlift')
      end

      params = { card: 'Airlift', city: 'London' }
      params[:player_index] = index unless index.nil?
      post '/action_card', params.to_json, { 'CONTENT_TYPE' => 'application/json' }

      assert_error_response(last_response, 422, message)
      data = parse_json_response(last_response)
      assert_equal false, data['success']
      assert_equal 'error', data['status']

      get '/game_state.json'
      state = parse_json_response(last_response)
      refute(state['players'].any? { |player| player['location'] == 'London' }, "player_index #{index.inspect} moved a player")
    end
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

  def test_contingency_planner_retrieved_event_is_removed_after_play
    create_game_with_custom_state do |state|
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :contingency_planner)
      current_player.hand.clear
      state.player_discard.clear
      state.player_discard << Card.new(:action, 'Airlift')
    end

    post '/retrieve', {
      action_card_name: 'Airlift'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    retrieve_data = parse_json_response(last_response)
    current_player_state = retrieve_data['game_state']['players'][0]
    assert_includes current_player_state['hand'].map { |card| card['name'] }, 'Airlift'
    refute_includes retrieve_data['game_state']['decks']['discardPile'].map { |card| card['name'] }, 'Airlift'

    post '/action_card', {
      card: 'Airlift',
      player_index: 0,
      city: 'London'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    play_data = parse_json_response(last_response)
    current_player_state = play_data['game_state']['players'][0]
    refute_includes current_player_state['hand'].map { |card| card['name'] }, 'Airlift'
    refute_includes play_data['game_state']['decks']['discardPile'].map { |card| card['name'] }, 'Airlift'
  end

  def test_retrieve_over_hand_limit_sets_pending_discard
    create_game_with_custom_state do |state|
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :contingency_planner)
      current_player.hand.clear
      ['Montreal', 'Washington', 'New York', 'London', 'Paris', 'Madrid', 'Essen'].each do |city|
        current_player.hand << Card.new(:city, city, :blue)
      end
      state.player_discard.clear
      state.player_discard << Card.new(:action, 'Airlift')
    end

    post '/retrieve', {
      action_card_name: 'Airlift'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert_successful_response(last_response)
    data = parse_json_response(last_response)
    assert_equal({ 'player_index' => 0, 'discard_count' => 1, 'return_phase' => 'player_actions' },
                 data['exceeded_hand_limit'])
    assert_equal 'pending_discard', data['game_state']['gameStatus']['phase']

    saved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 'pending_discard', saved_state.phase
    assert_equal({ player_index: 0, discard_count: 1, return_phase: 'player_actions' }, saved_state.pending_hand_limit)

    post '/discard_cards', {
      player_index: 0,
      card_names: ['Montreal']
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert_successful_response(last_response)

    resolved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 'player_actions', resolved_state.phase
    assert_nil resolved_state.pending_hand_limit
    assert_equal 7, resolved_state.players[0].hand.size
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
      state.instance_variable_set(:@phase, 'draw_cards')
    end

    post '/draw_cards'
    assert_successful_response(last_response)
    # The endpoint returns JSON but doesn't always set content-type header
    # Check that we can parse the response as JSON
    data = parse_json_response(last_response)
    assert data.is_a?(Hash), "Response should be valid JSON"
    assert data.key?('status') || data.key?('end_turn_events'), "Response should contain expected keys"
  end

  def test_draw_cards_rejects_before_draw_phase
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@actions_remaining, 0)
      state.instance_variable_set(:@phase, 'player_actions')
    end

    post '/draw_cards'

    assert_error_response(last_response, 422, 'game phase is draw_cards')
    saved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 'player_actions', saved_state.phase
    assert_equal 0, saved_state.actions_remaining
  end

  def test_draw_cards_sets_pending_discard_before_infection_when_hand_limit_exceeded
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@actions_remaining, 0)
      state.instance_variable_set(:@phase, 'draw_cards')

      current_player = state.current_player
      current_player.hand.clear
      ['Chicago', 'Montreal', 'Washington', 'New York', 'London', 'Paris'].each do |city|
        current_player.hand << Card.new(:city, city, :blue)
      end

      state.player_deck.clear
      state.player_deck << Card.new(:city, 'Barcelona', :yellow)
      state.player_deck << Card.new(:city, 'Madrid', :yellow)
    end

    post '/draw_cards'
    assert_successful_response(last_response)

    saved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 'pending_discard', saved_state.phase
    assert_equal({
                   player_index: saved_state.current_player_idx,
                   discard_count: 1,
                   return_phase: 'infect_cities'
                 }, saved_state.pending_hand_limit)

    post '/infect_cities'
    assert_error_response(last_response, 422, 'pending hand-limit discard')

    post '/discard_cards', {
      player_index: saved_state.current_player_idx,
      card_names: ['Paris']
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert_successful_response(last_response)

    resolved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 'infect_cities', resolved_state.phase
    assert_nil resolved_state.pending_hand_limit
  end

  def test_share_knowledge_sets_pending_discard_for_receiving_player
    create_game_with_custom_state do |state|
      state.players[0].location = 'Chicago'
      state.players[1].location = 'Chicago'
      state.players[0].hand.clear
      state.players[0].hand << Card.new(:city, 'Chicago', :blue)
      state.players[1].hand.clear
      ['Montreal', 'Washington', 'New York', 'London', 'Paris', 'Barcelona', 'Stockholm'].each do |city|
        state.players[1].hand << Card.new(:city, city, :blue)
      end
    end

    post '/share_knowledge', {
      giving_player_index: 0,
      receiving_player_index: 1,
      city_name: 'Chicago'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert_successful_response(last_response)

    saved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 'pending_discard', saved_state.phase
    assert_equal({ player_index: 1, discard_count: 1, return_phase: 'player_actions' }, saved_state.pending_hand_limit)

    post '/discard_cards', {
      player_index: 0,
      card_names: ['Chicago']
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert_error_response(last_response, 422, 'Only the player over the hand limit may discard')

    post '/discard_cards', {
      player_index: 1,
      card_names: ['Chicago']
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert_successful_response(last_response)

    resolved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 'player_actions', resolved_state.phase
    assert_nil resolved_state.pending_hand_limit
    assert_equal 7, resolved_state.players[1].hand.size
  end

  def test_action_card_can_resolve_pending_hand_limit
    create_game_with_custom_state do |state|
      player = state.players[0]
      player.hand.clear
      ['Chicago', 'Montreal', 'Washington', 'New York', 'London', 'Paris', 'Barcelona'].each do |city|
        player.hand << Card.new(:city, city, :blue)
      end
      player.hand << Card.new(:action, 'One Quiet Night')
      state.set_pending_hand_limit(0, 'infect_cities')
    end

    post '/action_card', {
      card: 'One Quiet Night'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    saved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 'infect_cities', saved_state.phase
    assert_nil saved_state.pending_hand_limit
    assert_equal 7, saved_state.players[0].hand.size
  end

  def test_infect_cities_endpoint
    create_game_with_custom_state do |state|
      # Set actions remaining to 0 to trigger end turn
      state.instance_variable_set(:@actions_remaining, 0)
      state.instance_variable_set(:@phase, 'infect_cities')
    end

    post '/infect_cities'
    assert_successful_response(last_response)
    # The endpoint returns JSON but doesn't always set content-type header
    # Check that we can parse the response as JSON
    data = parse_json_response(last_response)
    assert data.is_a?(Hash), "Response should be valid JSON"
    assert data.key?('status') || data.key?('end_turn_events'), "Response should contain expected keys"
  end

  def test_draw_cards_game_over_returns_events_and_reason
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@actions_remaining, 0)
      state.instance_variable_set(:@phase, 'draw_cards')
      state.current_player.hand.clear
      state.player_deck.clear
      state.player_deck << Card.new(:city, 'Madrid', :yellow)
    end

    post '/draw_cards'
    assert_successful_response(last_response)

    data = parse_json_response(last_response)
    end_turn_events = data['end_turn_events']
    assert_equal true, end_turn_events['game_over']
    assert_equal 'no_player_cards', end_turn_events['reason']
    assert_equal ['draw_card'], end_turn_events['events'].map { |event| event['type'] }
    assert_equal 'Madrid', end_turn_events['events'].first['card']['name']
    assert data['game_state']['gameStatus']['gameOver']

    saved_state = GameState.load_from_redis(@test_redis_key)
    assert saved_state.game_over
    assert_equal 'draw_cards', saved_state.phase
  end

  def test_infect_cities_game_over_returns_events_and_reason
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@actions_remaining, 0)
      state.instance_variable_set(:@phase, 'infect_cities')
      state.instance_variable_set(:@quiet_night, false)
      state.cities.each_value { |city| city.disease_cubes = 0 }
      state.players.each do |player|
        player.instance_variable_set(:@role, :scientist)
        player.location = 'Atlanta'
      end
      state.disease_cubes[:yellow] = 0
      state.infection_deck.clear
      state.infection_deck << Card.new(:city, 'Madrid', :blue)
      state.infection_deck << Card.new(:city, 'Lagos', :yellow)
    end
    current_player_idx = GameState.load_from_redis(@test_redis_key).current_player_idx

    post '/infect_cities'
    assert_successful_response(last_response)

    data = parse_json_response(last_response)
    end_turn_events = data['end_turn_events']
    assert_equal true, end_turn_events['game_over']
    assert_equal 'no_cubes', end_turn_events['reason']
    assert_equal [{ 'type' => 'infect_city', 'city' => 'Lagos', 'color' => 'yellow' }],
                 end_turn_events['events']
    assert data['game_state']['gameStatus']['gameOver']
    assert_equal 'infect_cities', data['game_state']['gameStatus']['phase']
    assert_equal current_player_idx, data['game_state']['gameStatus']['currentPlayerIndex']

    saved = GameState.load_from_redis(@test_redis_key)
    assert saved.game_over
    assert_equal :no_cubes, saved.game_over_reason
    assert_equal 0, saved.disease_cubes[:yellow]
    assert_equal [Card.new(:city, 'Madrid', :blue)].map(&:name), saved.infection_deck.map(&:name)
  end

  def test_infect_cities_rejected_after_game_over
    test_infect_cities_game_over_returns_events_and_reason
    saved_before = @redis.get(@test_redis_key)

    post '/infect_cities'
    assert_equal 422, last_response.status
    assert_equal({ 'status' => 'error', 'message' => 'The game is over' }, parse_json_response(last_response))
    assert_equal saved_before, @redis.get(@test_redis_key)
  end

  def test_mutating_endpoints_rejected_after_game_over
    requests = {
      '/move' => { player_index: 0, destination: 'Chicago' },
      '/treat' => {},
      '/cure_disease' => { color: 'blue', card_names: %w[Atlanta Chicago Montreal New\ York] },
      '/retrieve' => { action_card_name: 'Airlift' },
      '/share_knowledge' => { giving_player_index: 0, receiving_player_index: 1, city_name: 'Atlanta' },
      '/pass' => {},
      '/draw_cards' => {},
      '/infect_cities' => {},
      '/build_research_station' => {},
      '/discard_cards' => { player_index: 0, card_names: ['Atlanta'] },
      '/action_card' => { card: 'One Quiet Night' }
    }
    %w[player_actions draw_cards infect_cities].each do |phase|
      create_game_with_custom_state do |state|
        state.instance_variable_set(:@phase, phase)
        state.instance_variable_set(:@actions_remaining, phase == 'player_actions' ? 4 : 0)
        state.instance_variable_set(:@game_over, true)
        state.instance_variable_set(:@game_over_reason, :victory)
      end
      saved_before = @redis.get(@test_redis_key)

      requests.each do |path, body|
        post path, body.to_json, { 'CONTENT_TYPE' => 'application/json' }
        assert_equal 422, last_response.status, "#{path} in #{phase}"
        assert_equal({ 'status' => 'error', 'message' => 'The game is over' }, parse_json_response(last_response))
        assert_equal saved_before, @redis.get(@test_redis_key), "#{path} in #{phase} changed the save"
      end
    end
  end

  def test_restart_game_allowed_after_game_over
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@game_over, true)
      state.instance_variable_set(:@game_over_reason, :no_player_cards)
    end

    post '/restart_game', {}.to_json, { 'CONTENT_TYPE' => 'application/json' }
    assert_successful_response(last_response)
    refute GameState.load_from_redis(@test_redis_key).game_over
  end

  def test_infect_cities_rejects_skipping_draw_cards_phase
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@actions_remaining, 0)
      state.instance_variable_set(:@phase, 'draw_cards')
    end

    post '/infect_cities'

    assert_error_response(last_response, 422, 'game phase is infect_cities')
    saved_state = GameState.load_from_redis(@test_redis_key)
    assert_equal 'draw_cards', saved_state.phase
    assert_equal 0, saved_state.actions_remaining
  end

  def test_draw_cards_rejects_replay_after_draw_phase
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@actions_remaining, 0)
      state.instance_variable_set(:@phase, 'draw_cards')
    end

    post '/draw_cards'
    assert_successful_response(last_response)
    after_first_draw = GameState.load_from_redis(@test_redis_key)
    assert_equal 'infect_cities', after_first_draw.phase
    hand_size_after_first_draw = after_first_draw.players[after_first_draw.current_player_idx].hand.size
    deck_size_after_first_draw = after_first_draw.player_deck.size

    post '/draw_cards'

    assert_error_response(last_response, 422, 'game phase is draw_cards')
    after_replay_attempt = GameState.load_from_redis(@test_redis_key)
    assert_equal 'infect_cities', after_replay_attempt.phase
    assert_equal hand_size_after_first_draw,
                 after_replay_attempt.players[after_replay_attempt.current_player_idx].hand.size
    assert_equal deck_size_after_first_draw, after_replay_attempt.player_deck.size
  end

  def test_forecast_persists_across_requests
    state = GameState.new(4, :heroic)
    state.current_player.hand = [Card.new(:action, 'Forecast')]
    state.save_game_state
    original_deck = state.infection_deck.map(&:name)
    # Infection draws pop from the end, so the top six in draw order are the last six reversed.
    top_six = original_deck.last(6).reverse

    post '/action_card', { card: 'Forecast' }.to_json,
         { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    assert_equal top_six, parse_json_response(last_response)['cards'].map { |card| card['name'] }
    assert @redis.get(@test_redis_key).start_with?('---'), 'State must use production YAML persistence'
    loaded_state = GameState.load_from_redis(@test_redis_key)
    assert loaded_state.forecast_active
    assert_equal top_six, loaded_state.instance_variable_get(:@forecast_cards)
    refute_includes loaded_state.current_player.hand.map(&:name), 'Forecast'
    assert_includes loaded_state.player_discard.map(&:name), 'Forecast'

    saved_state = @redis.get(@test_redis_key)
    post '/move', {
      player_index: 0,
      destination: 'London'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_error_response(last_response, 422, 'Cannot perform action while Forecast is active')
    assert_equal saved_state, @redis.get(@test_redis_key)

    reordered_cards = top_six.reverse
    post '/action_card', { card: 'Forecast', card_order: reordered_cards }.to_json,
         { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    completed_state = GameState.load_from_redis(@test_redis_key)
    refute completed_state.forecast_active
    assert_nil completed_state.instance_variable_get(:@forecast_cards)
    assert_equal original_deck[0...-6] + reordered_cards.reverse, completed_state.infection_deck.map(&:name)
    assert_equal reordered_cards.first, completed_state.infection_deck.last.name, 'First chosen card is drawn next'
    assert_equal [:city], completed_state.infection_deck.map(&:type).uniq

    post '/pass'
    assert_successful_response(last_response)
  end

  def test_older_yaml_saves_default_to_inactive_forecast
    GameState.new(4, :heroic).save_game_state
    saved_state = YAML.load(@redis.get(@test_redis_key), permitted_classes: [Symbol])
    saved_state[:game_status].delete(:forecast_active)
    saved_state[:game_status].delete(:forecast_cards)
    @redis.set(@test_redis_key, YAML.dump(saved_state))

    loaded_state = GameState.load_from_redis(@test_redis_key)
    assert loaded_state
    refute loaded_state.forecast_active
    assert_nil loaded_state.instance_variable_get(:@forecast_cards)
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

    # A spent special move must not block direct, charter, or flight-choice requests.
    [
      [%w[Tokyo London], nil, 'direct flight', 'Tokyo'],
      [%w[Wuhan London], nil, 'charter flight', 'Wuhan'],
      [%w[Wuhan Tokyo London], 'Tokyo', 'direct flight', 'Tokyo'],
      [%w[Wuhan Tokyo London], 'Wuhan', 'charter flight', 'Wuhan'],
      [%w[Wuhan Tokyo London], nil, 'flight_choice', nil],
      [%w[London], 'London', 'error', nil]
    ].each do |cards, selected_card, expected, discarded|
      state = create_game_with_custom_state do |game|
        expert = game.players[game.current_player_idx]
        expert.instance_variable_set(:@role, :operations_expert)
        expert.location = 'Wuhan'
        expert.hand = cards.map { |name| Card.new(:city, name, :blue) }
        game.instance_variable_set(:@operations_expert_move_used, true)
      end
      post '/move', {
        player_index: 0, destination: 'Tokyo', card_name: selected_card
      }.to_json, { 'CONTENT_TYPE' => 'application/json' }
      result = parse_json_response(last_response)

      if discarded
        assert_successful_response(last_response)
        assert_includes result['message'], expected
        saved = GameState.load_from_redis(@test_redis_key)
        assert_equal 'Tokyo', saved.current_player.location
        assert_equal cards - [discarded], saved.current_player.hand.map(&:name)
        assert_equal state.actions_remaining - 1, saved.actions_remaining
        assert saved.operations_expert_move_used
      else
        assert_equal expected == 'error' ? 422 : 200, last_response.status
        assert_equal expected == 'error' ? 'error' : 'card_required', result['status']
        assert_equal 'flight_choice', result['movement_type'] unless expected == 'error'
        saved = GameState.load_from_redis(@test_redis_key)
        assert_equal 'Wuhan', saved.current_player.location
        assert_equal cards, saved.current_player.hand.map(&:name)
        assert_equal state.actions_remaining, saved.actions_remaining
        assert saved.operations_expert_move_used
      end
    end
  end
end
