module PlayerActions
  include GameStateConfig

  def move_pawn(player_index, destination)
    player = @players[player_index]
    current_location = player.location

    # Check if move is valid
    if @cities[current_location].connections.include?(destination) ||
       (@research_stations.include?(current_location) && @research_stations.include?(destination)) ||
       has_city_card?(player_index, destination) ||
       has_city_card?(player_index, current_location) && player.role == :operations_expert

      player.location = destination
      return true
    end

    false
  end

  def build_research_station(player_index, city_name)
    return after_action(false, 'Maximum number of research stations reached') if @research_stations.size >= MAX_RESEARCH_STATIONS
    return after_action(false, "Research station already exists in #{city_name}") if @research_stations.include?(city_name)

    player = @players[player_index]

    # Check if player is at the city
    return after_action(false, "Player must be in #{city_name} to build a research station") unless player.location == city_name

    # Operations expert can build without a card
    if player.role == :operations_expert
      @research_stations << city_name
      return after_action(true, "Successfully built a research station in #{city_name} (Operations Expert ability)")
    end

    # Otherwise, player needs the city card
    player_card_index = player.hand.find_index { |card| card.type == :city && card.name == city_name }
    if player_card_index
      discard_player_card(player_index, player_card_index)
      @research_stations << city_name
      return after_action(true, "Successfully built a research station in #{city_name}")
    end

    after_action(false, "Player does not have the #{city_name} city card")
  end

  def treat_disease
    player = @players[@current_player_index]
    city = @cities[player.location]
    color = city.color

    # Check if there are any cubes of this color to treat
    return { success: false, message: "No #{color} disease cubes to treat in #{city.name}" } if city.disease_cubes.zero?

    # Medic can remove all cubes
    if player.role == :medic || @cures[color]
      cubes_removed = city.disease_cubes
      city.disease_cubes = 0
    else
      cubes_removed = 1
      city.disease_cubes -= 1
    end
    @disease_cubes[color] += cubes_removed

    # Consume an action
    @actions_remaining -= 1

    # Prepare response
    rvalue = {
      success: true,
      status: 'success',
      message: "Treated #{color} disease in #{city.name}",
      cubes_removed: cubes_removed,
      actions_remaining: @actions_remaining,
      end_turn: @actions_remaining.zero?
    }

    # End turn if no actions remaining
    return rvalue unless @actions_remaining.zero?

    end_turn_events = end_turn
    rvalue.merge({ end_turn_events: end_turn_events })
  end

  def share_knowledge(giving_player_index, receiving_player_index, card_index)
    giving_player = @players[giving_player_index]
    receiving_player = @players[receiving_player_index]

    # Both players must be in the same city
    return after_action(false, 'Both players must be in the same city to share knowledge') unless giving_player.location == receiving_player.location

    card = giving_player.hand[card_index]

    # The card must be a city card matching the current location, or the player must be a researcher
    return after_action(false, 'Card must be a city card matching the current location, or player must be a researcher') unless card.type == :city && (card.name == giving_player.location || giving_player.role == :researcher)

    # Move the card
    giving_player.hand.delete_at(card_index)
    receiving_player.hand << card

    # Return success
    after_action(true, "Successfully shared #{card.name} card from #{giving_player.role} to #{receiving_player.role}")
  end

  def discover_cure(player_index, color, card_indices)
    player = @players[player_index]

    # Player must be at a research station
    return after_action(false, 'Player must be at a research station to discover a cure') unless @research_stations.include?(player.location)

    # Cure must not already be discovered
    return after_action(false, "The #{color} disease is already cured") if @cures[color]

    # Determine number of cards needed
    cards_needed = player.role == :scientist ? CARDS_NEEDED_FOR_CURE[:scientist] : CARDS_NEEDED_FOR_CURE[:default]
    return after_action(false, "Need #{cards_needed} cards of the same color to discover a cure") if card_indices.size != cards_needed

    # Check if all selected cards are of the right color
    selected_cards = card_indices.map do |idx|
      player.hand[idx]
    end.select { |card| card.type == :city && card.color == color }

    return after_action(false, "All selected cards must be #{color} city cards") if selected_cards.size != cards_needed

    # Discard the cards
    card_indices.sort.reverse.each { |idx| discard_player_card(player_index, idx) }

    # Mark the cure as discovered
    @cures[color] = true

    # Check if all cures are discovered (victory condition)
    if @cures.values.all?
      @game_over = true
      @game_over_reason = :victory
    end

    # Return success
    after_action(true, "Successfully discovered a cure for the #{color} disease!")
  end

  def move_drive_ferry(player_index, destination)
    # Validate destination exists
    return { success: false, status: 'error', message: 'Invalid destination city' } unless @cities.key?(destination)

    # Check if it's the player's turn or if current player is dispatcher
    current_player = @players[@current_player_index]
    requested_player = @players[player_index]

    # If not the current player's turn and current player is not dispatcher
    return { success: false, status: 'error', message: 'Cannot move another player unless you are the dispatcher' } if player_index != @current_player_index && current_player.role != :dispatcher

    # Check if destination is connected to current city
    current_city = @cities[requested_player.location]
    return { success: false, status: 'error', message: "#{destination} is not connected to #{requested_player.location}" } unless current_city.connections.include?(destination)

    # All checks passed, perform the move
    old_location = requested_player.location
    requested_player.location = destination

    # Handle medic ability
    medic_move(requested_player, destination)

    # Return success with appropriate message
    after_action(true, "Successfully moved #{requested_player.role} from #{old_location} to #{destination} via drive/ferry")
  end

  def move_direct_flight(player_index, destination)
    # Validate destination exists
    return { success: false, status: 'error', message: 'Invalid destination city' } unless @cities.key?(destination)

    # Check if it's the player's turn or if current player is dispatcher
    current_player = @players[@current_player_index]
    requested_player = @players[player_index]

    # If not the current player's turn and current player is not dispatcher
    return { success: false, status: 'error', message: 'Cannot move another player unless you are the dispatcher' } if player_index != @current_player_index && current_player.role != :dispatcher

    # Check if player has the destination city card for direct flight
    card_index = requested_player.hand.find_index do |card|
      card.type == :city && card.name == destination
    end

    return { success: false, status: 'error', message: "Player does not have the #{destination} city card for direct flight, he only has #{requested_player.hand.select { _1.type == :city }.inspect}" } unless card_index

    # All checks passed, perform the move
    # Discard the city card
    discard_player_card(player_index, card_index)

    # Move the player
    old_location = requested_player.location
    requested_player.location = destination

    # Automatic medic ability: remove cubes of cured diseases
    medic_move(requested_player, destination)

    # Return success
    after_action(true, "Successfully moved #{requested_player.role} from #{old_location} to #{destination} via direct flight")
  end

  def move_charter_flight(player_index, destination)
    # Validate destination exists
    return { success: false, status: 'error', message: 'Invalid destination city' } unless @cities.key?(destination)

    # Check if it's the player's turn or if current player is dispatcher
    current_player = @players[@current_player_index]
    requested_player = @players[player_index]

    # If not the current player's turn and current player is not dispatcher
    return { success: false, status: 'error', message: 'Cannot move another player unless you are the dispatcher' } if player_index != @current_player_index && current_player.role != :dispatcher

    # Check if player has the source city card for direct flight
    card_index = requested_player.hand.find_index do |card|
      card.type == :city && card.name == requested_player.location
    end

    return { success: false, status: 'error', message: "Player does not have the #{requested_player.location} city card for charter flight, he only has #{requested_player.hand.select { _1.type == :city }.inspect}" } unless card_index

    # All checks passed, perform the move
    # Discard the city card
    discard_player_card(player_index, card_index)

    # Move the player
    old_location = requested_player.location
    requested_player.location = destination

    # Automatic medic ability: remove cubes of cured diseases
    medic_move(requested_player, destination)

    # Return success
    after_action(true, "Successfully moved #{requested_player.role} from #{old_location} to #{destination} via charter flight")
  end

  private

  # Common after-action method to handle action consumption, end of turn, and response creation
  def after_action(action_success, message, additional_data = {})
    return { success: false, status: 'error', message: message }.merge(additional_data) unless action_success

    # Consume an action
    @actions_remaining -= 1

    # Prepare the base response
    response = {
      success: true,
      status: 'success',
      message: message,
      actions_remaining: @actions_remaining,
      end_turn: @actions_remaining.zero?
    }.merge(additional_data)

    # Handle end of turn if no actions remaining
    if @actions_remaining.zero?
      end_turn_events = end_turn
      response[:end_turn_events] = end_turn_events
    end

    response
  end
end
