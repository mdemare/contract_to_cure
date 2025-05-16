module ActionCards
  include GameStateConfig
  def use_resilient_population(city_name)
    rv = use_action_card("Resilient Population") do |card|
      # Find the card in the infection discard pile
      card_index = @infection_discard.find_index { |infection_card| infection_card.name == city_name }

      # If card not found, return error message
      break { success: false, message: "City '#{city_name}' not found in infection discard pile" } if card_index.nil?

      nil
    end

    # If error from use_action_card, return it
    return rv if rv

    # Find and remove the card from infection discard pile
    card_index = @infection_discard.find_index { |card| card.name == city_name }
    @infection_discard.delete_at(card_index)

    # Create success response
    response = {
      success: true,
      status: 'success',
      message: "Successfully removed #{city_name} from the infection discard pile",
      game_state: to_json_state
    }

    # Save game state after the action
    save_game_state

    return response
  end

  def quiet_night!
    err = use_action_card("One Quiet Night")

    return err if err

    @quiet_night = true

    # This doesn't consume an action, so don't call after_action
    response = {
      success: true,
      status: 'success',
      message: "Tonight at least will be quiet",
      game_state: to_json_state
    }

    # Save game state after the action
    save_game_state

    return response
  end

  # Government Grant action card
  # Allows a player to build a research station in any city without discarding a city card
  def use_airlift(player_index, city_name)
    rv = use_action_card("Airlift") do |card|

      # Check if city exists
      break { success: false, message: "City '#{city_name}' does not exist" } unless @cities[city_name]
      nil
    end

    return rv if rv

    # Build the research station and discard the card
    @players[player_index].location = city_name

    # This doesn't consume an action, so don't call after_action
    response = {
      success: true,
      status: 'success',
      message: "Successfully Airlifted #{@players[player_index].role} to #{city_name}",
      game_state: to_json_state
    }

    # Save game state after the action
    save_game_state

    return response
  end

  # Government Grant action card
  # Allows a player to build a research station in any city without discarding a city card
  def use_government_grant(city_name)
    rv = use_action_card("Government Grant") do |card|

      # Check maximum research stations limit
      break { success: false, message: "Maximum number of research stations reached" } if @research_stations.size >= MAX_RESEARCH_STATIONS

      # Check if city already has a research station
      break { success: false, message: "Research station already exists in #{city_name}" } if @research_stations.include?(city_name)

      # Check if city exists
      break { success: false, message: "City '#{city_name}' does not exist" } unless @cities[city_name]
      nil
    end

    return rv if rv

    # Build the research station and discard the card
    @research_stations << city_name

    # This doesn't consume an action, so don't call after_action
    response = {
      success: true,
      status: 'success',
      message: "Successfully built a research station in #{city_name} using Government Grant",
      game_state: to_json_state
    }

    # Save game state after the action
    save_game_state

    return response
  end

  private

  def use_action_card(card_name)
    @players.each_with_index do |player, pidx|
      player.hand.each_with_index do |card, hidx|
        if card.name == card_name
          err = yield(card) if block_given?
          discard_player_card(pidx, hidx, card.retrieved?) unless err
          return err
        end
      end
    end
    return { success: false, message: "Card not found in player's hand" }
  end
end
