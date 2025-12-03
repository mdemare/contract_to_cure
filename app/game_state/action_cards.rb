module ActionCards
  include GameStateConfig

  # Uses an action card by name, finding which player has it and discarding it
  # Returns nil on success or an error hash if card not found or conditions not met
  def use_action_card(card_name)
    # Find which player has the card
    player_index = nil

    @players.each_with_index do |_player, idx|
      if has_action_card?(idx, card_name)
        player_index = idx
        break
      end
    end

    unless player_index
      return { success: false, status: 'error', message: "No player has the #{card_name} card" }
    end

    # If a block is given, execute it for additional validation
    if block_given?
      result = yield(player_index)
      return result if result # Return early if the block returned an error
    end

    # Discard the action card
    discard_player_card_by_name(player_index, card_name)

    # Return nil to indicate success
    nil
  end

  # Forecast action card implementation
  # First stage: Look at the top 6 cards of the infection deck
  def use_forecast
    # Try to use the Forecast card
    result = use_action_card('Forecast')
    return result if result # Return early if there was an error

    # Get the top 6 cards from the infection deck (or all if less than 6)
    card_count = [@infection_deck.length, 6].min
    top_cards = @infection_deck.first(card_count)

    # Set a flag indicating we're in forecast mode
    @forecast_active = true
    @forecast_cards = top_cards.map(&:name)

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
      color = city&.color

      next unless color

      # Create a new card and add it to the top of the infection deck
      new_card = Card.new(:infection, card_name, color)
      @infection_deck.unshift(new_card)
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
    # Try to use the Resilient Population card with validation
    result = use_action_card('Resilient Population') do |_player_index|
      # Find the card in the infection discard pile
      card_index = @infection_discard.find_index { |infection_card| infection_card.name == city_name }

      # If card not found, return error message
      if card_index.nil?
        { success: false, status: 'error', message: "City '#{city_name}' not found in infection discard pile" }
      end
    end

    return result if result # Return early if there was an error

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
    # Try to use the One Quiet Night card
    result = use_action_card('One Quiet Night')
    return result if result # Return early if there was an error

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

  def use_airlift(player_index, city_name)
    # Try to use the Airlift card with validation
    result = use_action_card('Airlift') do |_|
      # Check if city exists
      if @cities[city_name]
        nil # Continue with the action
      else
        { success: false, status: 'error', message: "City '#{city_name}' does not exist" }
      end
    end

    return result if result # Return early if there was an error

    # Move the player to the destination
    old_location = @players[player_index].location
    @players[player_index].location = city_name

    # Handle medic ability if applicable
    medic_ability(@players[player_index], city_name) if @players[player_index].role == :medic

    # This doesn't consume an action, so don't call after_action
    response = {
      success: true,
      status: 'success',
      message: "Successfully Airlifted #{@players[player_index].role} from #{old_location} to #{city_name}",
      game_state: to_json_state
    }

    # Save game state after the action
    save_game_state

    return response
  end

  # Government Grant action card
  # Allows a player to build a research station in any city without discarding a city card
  def use_government_grant(city_name)
    # Try to use the Government Grant card with validation
    result = use_action_card('Government Grant') do |_|
      # Check maximum research stations limit
      if @research_stations.size >= MAX_RESEARCH_STATIONS
        { success: false, status: 'error', message: "Maximum number of research stations reached" }
      # Check if city already has a research station
      elsif @research_stations.include?(city_name)
        { success: false, status: 'error', message: "Research station already exists in #{city_name}" }
      # Check if city exists
      elsif !@cities[city_name]
        { success: false, status: 'error', message: "City '#{city_name}' does not exist" }
      end
    end

    return result if result # Return early if there was an error

    # Build the research station
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
end
