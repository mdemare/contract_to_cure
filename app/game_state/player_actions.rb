module PlayerActions
  include GameStateConfig

  def move(player_index, destination, card_index = nil)
    player = @players[player_index]
    current_location = player.location
    puts "city cards: ",current_player.city_cards.inspect
    # Check if move is valid
    if @cities[current_location].connections.include?(destination)
      move_type = 'drive / ferry'
    elsif @research_stations.include?(current_location) && @research_stations.include?(destination)
      move_type = 'shuttle flight'
    elsif current_player.role == :operations_expert and @research_stations.include?(current_location) and not current_player.city_cards.empty?
      if card_index and current_player.hand[card_index].type == :city
        # The operation expert can go anywhere from a research station by discarding a city card
        move_type = 'operation researcher special move'
        discard_player_card(@current_player_index, card_index)
      else
        # Request card index for operations expert move
        return {
          success: false,
          status: 'card_required',
          message: "Operations Expert requires a city card to move from a research station to any city",
          movement_type: 'operations_expert_special'
        }
      end
    elsif current_player.role == :dispatcher and @players.any? { |p| p.location == destination && p.index != player_index }
      # The dispatcher can bring players together
      move_type = 'dispatcher special move'
    elsif has_city_card?(player_index, destination)
      hand = current_player.hand
      if has_city_card?(player_index, current_location)
        if card_index and hand[card_index].type == :city and hand[card_index].name == destination
          move_type = 'direct flight'
          discard_player_card(player_index, card_index)
        elsif card_index and hand[card_index].type == :city and hand[card_index].name == current_location
          move_type = 'charter flight'
          discard_player_card(player_index, card_index)
        else
          # Request card selection when player has both current location and destination cards
          return {
            success: false,
            status: 'card_required',
            message: "You can use either a direct flight (discard destination card) or a charter flight (discard current location card)",
            movement_type: 'flight_choice',
            options: ['direct_flight', 'charter_flight']
          }
        end
      else
        move_type = 'direct flight'

        # Check if player has the destination city card for direct flight
        card_index = player.hand.find_index do |card|
          card.type == :city && card.name == destination
        end

        discard_player_card(player_index, card_index)
      end
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
    medic_ability(player, destination)

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
    giving_player.hand = giving_player.sorted_hand
    receiving_player.hand << card
    receiving_player.hand = receiving_player.sorted_hand

    # Check hand limit (7 cards)
    exceeded_limit = nil
    if receiving_player.hand.size > 7
      exceeded_limit = {
        player_index: receiving_player_index,
        discard_count: receiving_player.hand.size - 7
      }
    end

    # Return success with hand limit info if applicable
    response = after_action(true, "Successfully shared #{card.name} card from #{giving_player.role} to #{receiving_player.role}")
    response[:exceeded_hand_limit] = exceeded_limit if exceeded_limit
    response
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
      current_player.hand[idx]
    end.select { |card| card.type == :city && card.color == color }

    return after_action(false, "All selected cards must be #{color} city cards") if selected_cards.size != cards_needed

    # Discard the cards
    card_indices.sort.reverse.each { |idx| discard_player_card(current_player.index, idx) }

    # Mark the cure as discovered
    @cures[color] = true

    # Activate medic ability if any player is a medic
    @players.each do |player|
      if player.role == :medic
        # Use the medic_ability method to automatically remove cubes of the cured disease
        medic_ability(player, player.location)
      end
    end

    # Check if all cures are discovered (victory condition)
    if @cures.values.all?
      @game_over = true
      @game_over_reason = :victory
    end

    # Return success
    after_action(true, "Successfully discovered a cure for the #{color} disease!")
  end

  def use_action_card(card_name)
    puts "use_action_card(#{card_name})"
    @players.each_with_index do |player, pidx|
      player.hand.each_with_index do |card, hidx|
        if card.name == card_name
          err = yield(card)
          discard_player_card(pidx, hidx) unless err
          return err
        else
          puts card.inspect, card_name
        end
      end
    end
    puts "no card found in hand"
    return { success: false, message: "Card not found in player's hand" }
  end

  def quiet_night!
    use_action_card("One Quiet Night") do |card|
      puts "QUIET NIGHT!!"
      @quiet_night = true
      nil
    end
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

  def retrieve(action_card_name)
    # Check if current player is the contingency planner
    return after_action(false, "Only the Contingency Planner can retrieve action cards") unless current_player.role == :contingency_planner

    # Check if the card is in the discard pile
    action_card = @player_discard_pile.find { |card| card.name == action_card_name }
    return after_action(false, "Card '#{action_card_name}' not found in discard pile") unless action_card

    # Check if this card has been retrieved previously
    return after_action(false, "This card has already been retrieved by the Contingency Planner") if current_player.stored_special_event == action_card_name

    # Check if the card is an action/event card
    return after_action(false, "Card '#{action_card_name}' is not an action card") unless action_card.type == :event

    # Store the card with the contingency planner and remove from discard pile
    current_player.stored_special_event = action_card_name
    @player_discard_pile.delete_if { |card| card.name == action_card_name }

    # Handle hand limit check if needed
    if current_player.hand.size > 7
      exceeded_limit = {
        player_index: current_player_index,
        discard_count: current_player.hand.size - 7
      }
      response = after_action(true, "Successfully retrieved '#{action_card_name}' action card")
      response[:exceeded_hand_limit] = exceeded_limit
      return response
    end

    # Return success
    after_action(true, "Successfully retrieved '#{action_card_name}' action card")
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
    else
      # Save game state after every action (not just at end of turn)
      save_game_state
    end

    response.merge(game_state: to_json_state)
  end
end
