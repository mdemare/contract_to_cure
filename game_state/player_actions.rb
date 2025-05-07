module PlayerActions
  include GameStateConfig

  def move(player_index, destination)
    player = @players[player_index]
    current_location = player.location
    # Check if move is valid
    if @cities[current_location].connections.include?(destination)
      move_type = 'drive / ferry'
    elsif @research_stations.include?(current_location) && @research_stations.include?(destination)
      move_type = 'shuttle flight'
    elsif current_player.role == :dispatcher
      # The dispatcher can bring players together
      if @players.any? { |p| p.location == destination && p.index != player_index }
        move_type = 'dispatcher special move'
      else
        return { success: false, status: 'error', message: "Dispatcher can only move pawns to cities with other pawns" }
      end
    elsif has_city_card?(player_index, destination)
      move_type = 'direct flight'

      # Check if player has the destination city card for direct flight
      card_index = player.hand.find_index do |card|
        card.type == :city && card.name == destination
      end

      discard_player_card(player_index, card_index)
    elsif has_city_card?(player_index, current_location)
      move_type = 'charter flight'

      # Check if player has the current location city card for charter flight
      card_index = player.hand.find_index do |card|
        card.type == :city && card.name == current_location
      end

      discard_player_card(player_index, card_index)
    else
      return { success: false, status: 'error', message: "Cannot move player to destination #{destination} from #{current_location}" }
    end

    player.location = destination

    # Handle medic ability
    medic_move(player, destination)

    after_action(true, "Successfully moved #{player.role} from #{current_location} to #{destination} via #{move_type}")
  end

  def build_research_station
    city_name = current_player.location

    return after_action(false, 'Maximum number of research stations reached') if @research_stations.size >= MAX_RESEARCH_STATIONS
    return after_action(false, "Research station already exists in #{city_name}") if @research_stations.include?(city_name)

    # Check if player is at the city
    return after_action(false, "Player must be in #{city_name} to build a research station") unless current_player.location == city_name

    # Operations expert can build without a card
    if current_player.role == :operations_expert
      @research_stations << city_name
      return after_action(true, "Successfully built a research station in #{city_name} (Operations Expert ability)")
    end

    # Otherwise, player needs the city card
    player_card_index = current_player.hand.find_index { |card| card.type == :city && card.name == city_name }
    if player_card_index
      discard_player_card(current_player_index, player_card_index)
      @research_stations << city_name
      return after_action(true, "Successfully built a research station in #{city_name}")
    end

    after_action(false, "Player does not have the #{city_name} city card")
  end

  def pass
    @actions_remaining = 1
    return after_action(true, "Passed for the rest of the turn")
  end

  def treat_disease
    city = @cities[current_player.location]
    color = city.color

    # Check if there are any cubes of this color to treat
    return { success: false, message: "No #{color} disease cubes to treat in #{city.name}" } if city.disease_cubes.zero?

    # Medic can remove all cubes
    cubes_removed = (current_player.role == :medic || @cures[color]) ? city.disease_cubes : 1
    city.disease_cubes -= cubes_removed
    @disease_cubes[color] += cubes_removed

    return after_action(true, "Treated #{color} disease in #{city.name}", {cubes_removed: cubes_removed})
  end

  def share_knowledge(giving_player_index, receiving_player_index, city_name)
    giving_player = @players[giving_player_index]
    receiving_player = @players[receiving_player_index]

    # Both players must be in the same city
    return after_action(false, 'Both players must be in the same city to share knowledge') unless giving_player.location == receiving_player.location

    # Find the card in the giving player's hand
    card_index = giving_player.hand.find_index { |card| card.type == :city && card.name == city_name }
    return after_action(false, "Player does not have the #{city_name} city card") unless card_index

    card = giving_player.hand[card_index]

    # The card must be a city card matching the current location, or the player must be a researcher
    unless card.name == giving_player.location || giving_player.role == :researcher
      return after_action(false, 'Card must match current location or player must be a researcher')
    end

    # Move the card
    giving_player.hand.delete_at(card_index)
    receiving_player.hand << card

    # Return success
    after_action(true, "Successfully shared #{card.name} card from #{giving_player.role} to #{receiving_player.role}")
  end

  def cure_disease(color, card_indices)
    raise "color must be a symbol" unless color.is_a?(Symbol)
    # Player must be at a research station
    return after_action(false, 'Player must be at a research station to discover a cure') unless @research_stations.include?(current_player.location)

    # Cure must not already be discovered
    return after_action(false, "The #{color} disease is already cured") if @cures[color]

    # Determine number of cards needed
    cards_needed = current_player.role == :scientist ? CARDS_NEEDED_FOR_CURE[:scientist] : CARDS_NEEDED_FOR_CURE[:default]
    return after_action(false, "Need #{cards_needed} cards of the same color to discover a cure") if card_indices.size != cards_needed

    # Check if all selected cards are of the right color
    selected_cards = card_indices.map do |idx|
      player.hand[idx]
    end.select { |card| card.type == :city && card.color == color }

    return after_action(false, "All selected cards must be #{color} city cards") if selected_cards.size != cards_needed

    # Discard the cards
    card_indices.sort.reverse.each { |idx| discard_player_card(current_player.index, idx) }

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
