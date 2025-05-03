module EndTurnEvents
  def end_turn
    events = [] # Store events to return

    # Draw 2 player cards
    2.times do
      event = draw_player_card(@current_player_index)
      events << event if event
      return { game_over: true, reason: @game_over_reason, events: events } if @game_over
    end

    # Infect cities
    @infection_rate.times do
      event = infect_city
      events << event if event
      return { game_over: true, reason: @game_over_reason, events: events } if @game_over
    end

    # Go to next player
    @current_player_index = (@current_player_index + 1) % @players.size
    @actions_remaining = 4

    { game_over: false, events: events } # Return events if game is not over
  end

  def draw_player_card(player_index)
    if @player_deck.empty?
      @game_over = true
      @game_over_reason = :no_player_cards
      return { type: :game_over, reason: @game_over_reason }
    end

    card = @player_deck.pop
    player = @players[player_index]
    event = { type: :draw_card, player: player_index, card: card }

    if card.type == :epidemic
      epidemic_event = handle_epidemic
      events << epidemic_event if epidemic_event # Capture epidemic events
      event[:type] = :epidemic # Modify the initial draw event
    else
      player.hand << card

      # Check hand limit (7 cards)
      if player.hand.size > 7
        # TODO: Prompt player to discard down to 7 cards (this needs separate UI interaction)
      end
    end
    event # Return the event
  end

  def handle_epidemic
    epidemic_events = []

    # Increase infection rate
    @infection_rate_marker += 1
    @infection_rate = INFECTION_RATE_TRACK[@infection_rate_marker] if @infection_rate_marker < INFECTION_RATE_TRACK.size
    epidemic_events << { type: :increase_infection_rate, new_rate: @infection_rate }

    # Infect: draw bottom card from infection deck
    return epidemic_events unless @infection_deck.any?

    bottom_card = @infection_deck.shift
    city = @cities[bottom_card.name]

    # Add 3 cubes of the city's color
    infection_event = add_disease_cubes(city.name, city.color, 3)
    epidemic_events << infection_event if infection_event

    # Add card to discard pile
    @infection_discard << bottom_card
    epidemic_events << { type: :infect_city, city: city.name, color: city.color, count: 3, epidemic: true }

    # Intensify: shuffle the infection discard pile and put it on top of infection deck
    @infection_deck = @infection_discard.shuffle + @infection_deck
    @infection_discard = []
    epidemic_events << { type: :intensify }

    epidemic_events
  end

  def infect_city
    return nil if @infection_deck.empty? # Return nil if no city infected

    card = @infection_deck.pop
    @infection_discard << card

    city = @cities[card.name]
    infection_event = add_disease_cubes(city.name, city.color, 1)
    return infection_event if infection_event&.dig(:type) == :game_over # Propagate game over event

    { type: :infect_city, city: city.name, color: city.color } # Return infection event
  end

  def add_disease_cubes(city_name, color, count)
    city = @cities[city_name]
    return if city.color != color

    # Handle quarantine specialist prevention
    return if has_quarantine_specialist_protection?(city_name)

    # If the disease is eradicated, don't add cubes
    return if @cures[color] && @disease_cubes[color] == MAX_DISEASE_CUBES_PER_COLOR

    remaining_cubes = @disease_cubes[color]

    # Calculate how many cubes to add
    to_add = [count, remaining_cubes].min
    outbreak_needed = [count - to_add, 0].max

    # Add cubes to the city
    city.disease_cubes += to_add
    @disease_cubes[color] -= to_add

    # If we're out of cubes, game over
    if @disease_cubes[color] <= 0
      @game_over = true
      @game_over_reason = :no_cubes
      return { type: :game_over, reason: :no_cubes, color: color } # Return the color that ran out
    end

    # Handle outbreak if needed
    return nil unless outbreak_needed.positive?

    trigger_outbreak(city_name, color)
  end

  def trigger_outbreak(city_name, color, outbreak_chain = [])
    # Prevent chain reactions in the same city
    return nil if outbreak_chain.include?(city_name)

    # Add this city to the chain
    outbreak_chain << city_name

    # Increment outbreak counter
    @outbreak_count += 1

    # Check for game over
    if @outbreak_count >= MAX_OUTBREAKS
      @game_over = true
      @game_over_reason = :too_many_outbreaks
      return { type: :game_over, reason: :too_many_outbreaks }
    end

    # Spread disease to connected cities
    city = @cities[city_name]
    city.connections.each do |connected_city_name|
      # Skip if connected city has quarantine specialist protection
      next if has_quarantine_specialist_protection?(connected_city_name)

      connected_city = @cities[connected_city_name]

      # Don't add if disease is eradicated
      next if @cures[color] && @disease_cubes[color] == MAX_DISEASE_CUBES_PER_COLOR

      # Add 1 cube, or trigger outbreak if already at 3 cubes
      add_disease_cubes(connected_city.name, color, 1)
      # We don't need to explicitly return game over here, as it's handled in add_disease_cubes
    end
    { type: :outbreak, city: city_name, color: color }
  end
end
