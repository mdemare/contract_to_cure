module ActionCards
  include GameStateConfig

  # Forecast action card implementation
  # First stage: Look at the top 6 cards of the infection deck
  def use_forecast
    # Find which player has the Forecast card and the card's index
    player_with_card = nil
    player_index = nil
    forecast_index = nil

    @players.each_with_index do |player, idx|
      card_idx = player.hand.find_index { |card| card.type == :action && card.name == 'Forecast' }
      if card_idx
        player_with_card = player
        player_index = idx
        forecast_index = card_idx
        break
      end
    end

    unless player_with_card
      return { status: 'error', message: 'No player has the Forecast card' }
    end

    # Get the top 6 cards from the infection deck (or all if less than 6)
    card_count = [@infection_deck.length, 6].min
    top_cards = @infection_deck.first(card_count)

    # Discard the Forecast card from the player's hand
    discard_player_card(player_index, forecast_index)

    # Set a flag indicating we're in forecast mode
    @forecast_active = true
    @forecast_cards = top_cards.map(&:name)

    # No action cost for playing action cards
    # Action cards are played as a free action

    # Save the game state
    save_game_state

    # Return the top cards to the frontend for rearrangement
    {
      status: 'success',
      type: :forecast_view,
      message: 'Choose the order for the infection cards',
      cards: top_cards.map { |card| { name: card.name, color: card.color } }
    }
  end

  # Second stage: Apply the new order to the infection deck
  def apply_forecast(card_order)
    # Validate that we're in forecast mode
    unless @forecast_active
      return { status: 'error', message: 'Forecast is not active' }
    end

    # Validate that the card order contains all the forecasted cards
    unless card_order.size == @forecast_cards.size &&
          card_order.all? { |card_name| @forecast_cards.include?(card_name) }
      return { status: 'error', message: 'Invalid card order provided' }
    end

    # Remove the top N cards from the infection deck
    @infection_deck.shift(@forecast_cards.size)

    # Add the cards back in the specified order (reverse order since we're adding to the top)
    card_order.reverse_each do |card_name|
      # Find the original card with this name
      city = @cities[card_name]
      color = city ? city.color : nil

      if color
        # Create a new card and add it to the top of the infection deck
        new_card = Card.new(:infection, card_name, color)
        @infection_deck.unshift(new_card)
      end
    end

    # Reset forecast mode
    @forecast_active = false
    @forecast_cards = nil

    # Save the game state
    save_game_state

    # Return the updated game state
    to_json_state
  end

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
