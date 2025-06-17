require_relative 'test_helper'

class TestErrorHandling < TestHelper
  def test_invalid_json_requests
    create_test_game_state

    post '/move', 'invalid json', { 'CONTENT_TYPE' => 'application/json' }

    assert_equal 500, last_response.status
  end

  def test_missing_content_type
    create_test_game_state

    post '/move', {
      player_index: 0,
      destination: 'London'
    }.to_json

    # Should still work without explicit content type
    assert last_response.successful? || last_response.status == 422
  end

  def test_move_with_invalid_destination
    create_test_game_state

    post '/move', {
      player_index: 0,
      destination: 'NonExistentCity'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    # Should return an error response
    refute last_response.successful?
    assert_json_response(last_response)
  end

  def test_cure_disease_without_research_station
    create_game_with_custom_state do |state|
      # Give player cards but ensure they're not at a research station
      player = state.players[state.current_player_idx]
      player.cards = ['Chicago', 'Montreal', 'Washington', 'New York', 'London']
      player.location = 'London' # Not a research station by default

      # Make sure London is not a research station
      state.research_stations.delete('London')
    end

    post '/cure_disease', {
      color: 'blue',
      card_names: ['Chicago', 'Montreal', 'Washington', 'New York', 'London']
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    refute last_response.successful?
    assert_json_response(last_response)
  end

  def test_cure_disease_insufficient_cards
    create_game_with_custom_state do |state|
      player = state.players[state.current_player_idx]
      require_relative '../app/game_state/card'

      player.hand.clear
      player.hand << Card.new(:city, 'Chicago', :blue)
      player.hand << Card.new(:city, 'Chicago', :blue) # Only 2 cards, need 5
      player.location = 'Chicago'
      state.research_stations << 'Chicago'
    end

    post '/cure_disease', {
      color: 'blue',
      card_names: %w[Chicago Chicago]
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    refute last_response.successful?
    assert_json_response(last_response)
  end

  def test_share_knowledge_players_not_in_same_city
    create_game_with_custom_state do |state|
      # Place players in different cities
      state.players[0].location = 'Chicago'
      state.players[1].location = 'London'
      require_relative '../app/game_state/card'
      state.players[0].hand.clear
      state.players[0].hand << Card.new(:city, 'Chicago', :blue)
    end

    post '/share_knowledge', {
      giving_player_index: 0,
      receiving_player_index: 1,
      city_name: 'Chicago'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    refute last_response.successful?
    assert_json_response(last_response)
  end

  def test_share_knowledge_without_required_card
    create_game_with_custom_state do |state|
      # Place players in same city but giver doesn't have the card
      state.players[0].location = 'Chicago'
      state.players[1].location = 'Chicago'
      require_relative '../app/game_state/card'
      state.players[0].hand.clear
      state.players[0].hand << Card.new(:city, 'London', :blue) # Has London, not Chicago
    end

    post '/share_knowledge', {
      giving_player_index: 0,
      receiving_player_index: 1,
      city_name: 'Chicago'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    refute last_response.successful?
    assert_json_response(last_response)
  end

  def test_build_research_station_without_city_card
    create_game_with_custom_state do |state|
      current_player = state.players[state.current_player_idx]
      current_player.location = 'London'
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'Chicago', :blue) # Has Chicago card, not London
    end

    post '/build_research_station'

    refute last_response.successful?
    assert_json_response(last_response)
  end

  def test_build_research_station_where_one_exists
    create_game_with_custom_state do |state|
      current_player = state.players[state.current_player_idx]
      current_player.location = 'Chicago'
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'Chicago', :blue)
      # Add Chicago to research stations to test the error case
      state.research_stations << 'Chicago'
    end

    post '/build_research_station'

    refute last_response.successful?
    assert_json_response(last_response)
  end

  def test_treat_disease_in_city_without_disease
    create_game_with_custom_state do |state|
      current_player = state.players[state.current_player_idx]
      city_name = current_player.location

      # Ensure city has no disease cubes
      %i[red blue yellow black].each do |_color|
        # Reset disease cubes for the city by setting city's disease cubes to 0
        city = state.cities[city_name]
        city.disease_cubes = 0 if city
      end
    end

    post '/treat'

    refute last_response.successful?
    assert_json_response(last_response)
  end

  def test_action_card_player_doesnt_have
    create_game_with_custom_state do |state|
      current_player = state.players[state.current_player_idx]
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'Chicago', :blue) # Doesn't have Airlift
    end

    post '/action_card', {
      card: 'Airlift',
      player_index: 0,
      city: 'London'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    refute last_response.successful?
    assert_json_response(last_response)
  end

  def test_unknown_action_card
    create_test_game_state

    post '/action_card', {
      card: 'NonExistentCard'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_error_response(last_response, 500, 'Unknown action card')
  end

  def test_discard_cards_player_doesnt_have
    create_game_with_custom_state do |state|
      player = state.players[0]
      require_relative '../app/game_state/card'
      player.hand.clear
      player.hand << Card.new(:city, 'Chicago', :blue) # Only has Chicago
    end

    post '/discard_cards', {
      player_index: 0,
      card_names: ['London'] # Trying to discard London (player doesn't have it)
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response) # Should succeed but discard 0 cards
    data = parse_json_response(last_response)
    assert_includes data['message'], 'Successfully discarded 0'
  end

  def test_actions_when_no_actions_remaining
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@actions_remaining, 0)
      state.instance_variable_set(:@phase, 'draw_cards') # Set phase to not be 'player_actions'
    end

    post '/move', {
      player_index: 0,
      destination: 'London'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    refute last_response.successful?
    assert_json_response(last_response)
  end
end
