module EndTurnEvents
  include GameStateConfig
  def end_turn
    events = [] # Store events to return

    # Draw 2 player cards
    2.times do
      draw_event = draw_player_card(@current_player_index)
      if draw_event[:card][:type] == :epidemic
        epidemic_events = handle_epidemic
        draw_event[:epidemic_events] = epidemic_events
      end
      events << draw_event
      return { game_over: true, reason: @game_over_reason, events: events } if @game_over
    end

    # Infect cities
    @infection_rate.times do
      infect_event = infect_city
      if infect_event
        events << infect_event
        return { game_over: true, reason: @game_over_reason, events: events } if @game_over
      end
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
    event = { type: :draw_card, player: player_index, card: card.description }

    if card.type != :epidemic
      player.hand << card

      # Check hand limit (7 cards)
      if player.hand.size > 7
        # TODO: Prompt player to discard down to 7 cards (this needs separate UI interaction)
      end
    end
    event # Return the draw event (which may include epidemic events)
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
    # We draw cards via pop, so shuffled cards at the end.
    @infection_discard.shuffle!
    @infection_deck += @infection_discard
    @infection_discard = []

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
    # Early returns for protection cases
    return if has_quarantine_specialist_protection?(city_name)
    return if @cures[color] && @disease_cubes[color] == MAX_DISEASE_CUBES_PER_COLOR

    city = @cities[city_name]
    return if city.color != color

    # Check if adding cubes would cause game over
    if count >= @disease_cubes[color]
      # Adding all remaining cubes then game over
      city.disease_cubes += @disease_cubes[color]
      @disease_cubes[color] = 0
      @game_over = true
      @game_over_reason = :no_cubes
      return { type: :game_over, reason: :no_cubes, color: color }
    end

    if city.disease_cubes + count > 3
      city.disease_cubes = 3
      trigger_outbreak(city_name)
    else
      # Normal case - add cubes
      city.disease_cubes += count
      @disease_cubes[color] -= count
      nil
    end
  end

  def trigger_outbreak(city_name, outbreak_chain = [])
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
    color = city.color
    city.connections.each do |connected_city_name|
      # Skip if connected city has quarantine specialist protection
      next if has_quarantine_specialist_protection?(connected_city_name)

      connected_city = @cities[connected_city_name]

      # Don't add if disease is eradicated
      next if @cures[color] && @disease_cubes[color] == MAX_DISEASE_CUBES_PER_COLOR

      # Early returns for protection cases
      next if connected_city.color != color
      next if has_quarantine_specialist_protection?(connected_city_name)
      next if @cures[color] && @disease_cubes[color] == MAX_DISEASE_CUBES_PER_COLOR

      # Check if adding cubes would cause game over
      if @disease_cubes[color] <= 1
        # Adding all remaining cubes then game over
        connected_city.disease_cubes += @disease_cubes[color]
        @disease_cubes[color] = 0
        @game_over = true
        @game_over_reason = :no_cubes
        return { type: :game_over, reason: :no_cubes, color: color }
      end

      # Normal case - add cubes

      if (connected_city.disease_cubes < 3) && (@disease_cubes[color] == 1)
        @disease_cubes[color] = 0
        @game_over = true
        @game_over_reason = :no_cubes
        return { type: :game_over, reason: :no_cubes, color: color }
      end

      outbreak = connected_city.disease_cubes == 3
      if connected_city.disease_cubes < 3
        @disease_cubes[color] -= 1
        connected_city.disease_cubes += 1
      end

      next unless outbreak

      event = trigger_outbreak(connected_city_name, outbreak_chain)
      return event if event && event[:type] == :game_over

      outbreak_chain = event[:outbreak_chain] if event
    end
    { type: :outbreak, city: city_name, color: color, outbreak_chain: outbreak_chain }
  end
end
