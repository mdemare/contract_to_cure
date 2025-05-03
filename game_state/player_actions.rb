# frozen_string_literal: true

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
    return false if @research_stations.size >= MAX_RESEARCH_STATIONS
    return false if @research_stations.include?(city_name)

    player = @players[player_index]

    # Check if player is at the city
    return false unless player.location == city_name

    # Operations expert can build without a card
    if player.role == :operations_expert
      @research_stations << city_name
      return true
    end

    # Otherwise, player needs the city card
    player_card_index = player.hand.find_index { |card| card.type == :city && card.name == city_name }
    if player_card_index
      discard_player_card(player_index, player_card_index)
      @research_stations << city_name
      return true
    end

    false
  end

  def treat_disease(player_index)
    player = @players[player_index]
    city = @cities[player.location]
    color = city.color

    # Check if there are any cubes of this color to treat
    if city.disease_cubes == 0
      return { success: false, message: "No #{color} disease cubes to treat in #{city.name}" }
    end

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

    # End turn if no actions remaining
    end_turn if @actions_remaining <= 0

    {
      success: true,
      status: "success",
      message: "Treated #{color} disease in #{city.name}",
      cubes_removed: cubes_removed,
      end_turn: @actions_remaining <= 0
    }
  end

  def share_knowledge(giving_player_index, receiving_player_index, card_index)
    giving_player = @players[giving_player_index]
    receiving_player = @players[receiving_player_index]

    # Both players must be in the same city
    return false unless giving_player.location == receiving_player.location

    card = giving_player.hand[card_index]

    # The card must be a city card matching the current location, or the player must be a researcher
    return false unless card.type == :city &&
                        (card.name == giving_player.location || giving_player.role == :researcher)

    # Move the card
    giving_player.hand.delete_at(card_index)
    receiving_player.hand << card

    true
  end

  def discover_cure(player_index, color, card_indices)
    player = @players[player_index]

    # Player must be at a research station
    unless @research_stations.include?(player.location)
      puts 'wrong 1'
      return false
    end

    # Cure must not already be discovered
    if @cures[color]
      puts 'wrong 2'
      return false
    end

    # Determine number of cards needed
    cards_needed = player.role == :scientist ? CARDS_NEEDED_FOR_CURE[:scientist] : CARDS_NEEDED_FOR_CURE[:default]
    if card_indices.size != cards_needed
      puts 'wrong 3'
      puts player.role
      return false
    end

    # Check if all selected cards are of the right color
    selected_cards = card_indices.map do |idx|
      player.hand[idx]
    end.select { |card| card.type == :city && card.color == color }
    if selected_cards.size != cards_needed
      puts 'wrong 4'
      return false
    end

    # Discard the cards
    card_indices.sort.reverse.each { |idx| discard_player_card(player_index, idx) }

    # Mark the cure as discovered
    @cures[color] = true

    # Check if all cures are discovered (victory condition)
    if @cures.values.all?
      @game_over = true
      @game_over_reason = :victory
    end

    true
  end

  def move_drive_ferry(player_index, destination)
    # Validate destination exists
    return { success: false, status: "error", message: 'Invalid destination city' } unless @cities.key?(destination)

    # Check if it's the player's turn or if current player is dispatcher
    current_player = @players[@current_player_index]
    raise unless current_player.is_a?(Player)
    requested_player = @players[player_index]
    raise unless requested_player.is_a?(Player)

    # If not the current player's turn and current player is not dispatcher
    if player_index != @current_player_index && current_player.role != :dispatcher
      return {
        success: false,
        status: "error",
        message: 'Cannot move another player unless you are the dispatcher'
      }
    end

    # Check if destination is connected to current city
    current_city = @cities[requested_player.location]
    unless current_city.connections.include?(destination)
      return {
        success: false,
        status: "error",
        message: "#{destination} is not connected to #{requested_player.location}"
      }
    end

    # All checks passed, perform the move

    # Move the player
    old_location = requested_player.location
    requested_player.location = destination

    medic_move(requested_player, destination)

    @actions_remaining = (@actions_remaining || 4) - 1

    # End turn if no actions remaining
    end_turn if @actions_remaining <= 0

    {
      success: true,
      status: "success",
      message: "Successfully moved #{requested_player.role} from #{old_location} to #{destination} via drive/ferry",
      end_turn: @actions_remaining <= 0
    }
  end

  def move_direct_flight(player_index, destination)
    # Validate destination exists
    return { success: false, message: 'Invalid destination city' } unless @cities.key?(destination)

    # Check if it's the player's turn or if current player is dispatcher
    current_player = @players[@current_player_index]
    requested_player = @players[player_index]

    # If not the current player's turn and current player is not dispatcher
    if player_index != @current_player_index && current_player.role != :dispatcher
      return {
        success: false,
        status: "error",
        message: 'Cannot move another player unless you are the dispatcher'
      }
    end

    # Check if player has the destination city card for direct flight
    card_index = requested_player.hand.find_index do |card|
      card.type == :city && card.name == destination
    end

    unless card_index
      return {
        success: false,
        status: "error",
        message: "Player does not have the #{destination} city card for direct flight, he only has #{requested_player.hand.select { _1.type == :city }.inspect}"
      }
    end

    # All checks passed, perform the move
    # Discard the city card
    discard_player_card(player_index, card_index)

    # Move the player
    old_location = requested_player.location
    requested_player.location = destination

    # Automatic medic ability: remove cubes of cured diseases
    medic_move(requested_player, destination)

    # Consume an action (only if moving the current player)
    @actions_remaining -= 1

    # End turn if no actions remaining
    end_turn if @actions_remaining <= 0

    {
      success: true,
      status: "success",
      message: "Successfully moved #{requested_player.role} from #{old_location} to #{destination} via direct flight",
      end_turn: @actions_remaining <= 0
    }
  end

  def available_actions(player_index)
    player = @players[player_index]
    city = @cities[player.location]

    actions = {
      move_options: [],
      can_build_research_station: false,
      can_treat_disease: {},
      can_share_knowledge: [],
      can_discover_cure: []
    }

    # Move options
    actions[:move_options] = city.connections.dup

    # Direct flights (if player has city cards)
    player.hand.each do |card|
      actions[:move_options] << card.name if (card.type == :city) && !actions[:move_options].include?(card.name)
    end

    # Charter flights (if player has current city card)
    actions[:move_options] = @cities.keys - [player.location] if has_city_card?(player_index, player.location)

    # Shuttle flights (if current city has research station)
    if @research_stations.include?(player.location)
      @research_stations.each do |rs|
        actions[:move_options] << rs unless rs == player.location || actions[:move_options].include?(rs)
      end
    end

    # Build research station
    actions[:can_build_research_station] =
      !@research_stations.include?(player.location) &&
      (@research_stations.size < MAX_RESEARCH_STATIONS) &&
      (has_city_card?(player_index, player.location) || player.role == :operations_expert)

    # Treat disease
    COLORS.each do |color|
      actions[:can_treat_disease][color] = true if city.disease_cubes[color].positive?
    end

    # Share knowledge
    @players.each_with_index do |other_player, other_idx|
      next if other_idx == player_index

      next unless other_player.location == player.location

      # Give knowledge
      player.hand.each_with_index do |card, card_idx|
        next unless card.type == :city && (card.name == player.location || player.role == :researcher)

        actions[:can_share_knowledge] << {
          action: :give,
          player: other_idx,
          card_index: card_idx,
          card_name: card.name
        }
      end

      # Take knowledge
      other_player.hand.each_with_index do |card, card_idx|
        next unless card.type == :city && (card.name == player.location || other_player.role == :researcher)

        actions[:can_share_knowledge] << {
          action: :take,
          player: other_idx,
          card_index: card_idx,
          card_name: card.name
        }
      end
    end

    # Discover cure
    if @research_stations.include?(player.location)
      COLORS.each do |color|
        next if @cures[color]

        cards_of_color = player.hand.select { |card| card.type == :city && card.color == color }
        cards_needed = player.role == :scientist ? CARDS_NEEDED_FOR_CURE[:scientist] : CARDS_NEEDED_FOR_CURE[:default]

        actions[:can_discover_cure] << color if cards_of_color.size >= cards_needed
      end
    end

    actions
  end
end
