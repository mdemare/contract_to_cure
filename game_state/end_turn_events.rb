# frozen_string_literal: true

module EndTurnEvents
  def end_turn
    # Draw 2 player cards
    2.times do
      draw_player_card(@current_player_index)
      return if @game_over
    end

    # Infect cities
    @infection_rate.times do
      infect_city
      return if @game_over
    end

    # Go to next player
    @current_player_index = (@current_player_index + 1) % @players.size
    @actions_remaining = 4
  end

  def draw_player_card(player_index)
    return if @player_deck.empty?

    card = @player_deck.pop
    player = @players[player_index]

    if card.type == :epidemic
      handle_epidemic
    else
      player.hand << card

      # Check hand limit (7 cards)
      if player.hand.size > 7
        # TODO: Prompt player to discard down to 7 cards
      end
    end
  end

  def handle_epidemic
    # Increase infection rate
    @infection_rate_marker += 1
    @infection_rate = INFECTION_RATE_TRACK[@infection_rate_marker] if @infection_rate_marker < INFECTION_RATE_TRACK.size

    # Infect: draw bottom card from infection deck
    return unless @infection_deck.any?

    card = @infection_deck.shift
    city = @cities[card.name]

    # Add 3 cubes of the city's color
    add_disease_cubes(city.name, city.color, 3)

    # Add card to discard pile
    @infection_discard << card

    # Intensify: shuffle the infection discard pile and put it on top of infection deck
    @infection_deck = @infection_discard.shuffle + @infection_deck
    @infection_discard = []
  end

  def infect_city
    return if @infection_deck.empty?

    card = @infection_deck.pop
    @infection_discard << card

    city = @cities[card.name]
    add_disease_cubes(city.name, city.color, 1)
  end

  def add_disease_cubes(city_name, color, count)
    city = @cities[city_name]

    # Handle quarantine specialist prevention
    return if has_quarantine_specialist_protection?(city_name)

    # If the disease is eradicated, don't add cubes
    return if @cures[color] && @disease_cubes[color] == MAX_DISEASE_CUBES_PER_COLOR

    remaining_cubes = @disease_cubes[color]

    # Calculate how many cubes to add
    to_add = [count, remaining_cubes].min
    outbreak_needed = [count - to_add, 0].max

    # Add cubes to the city
    city.disease_cubes[color] += to_add
    @disease_cubes[color] -= to_add

    # If we're out of cubes, game over
    if @disease_cubes[color].zero?
      @game_over = true
      @game_over_reason = :no_cubes
      return
    end

    # Handle outbreak if needed
    return unless outbreak_needed.positive?

    trigger_outbreak(city_name, color)
  end

  def trigger_outbreak(city_name, color, outbreak_chain = [])
    # Prevent chain reactions in the same city
    return if outbreak_chain.include?(city_name)

    # Add this city to the chain
    outbreak_chain << city_name

    # Increment outbreak counter
    @outbreak_count += 1

    # Check for game over
    if @outbreak_count >= MAX_OUTBREAKS
      @game_over = true
      @game_over_reason = :too_many_outbreaks
      return
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
      if connected_city.disease_cubes[color] < 3
        if @disease_cubes[color].positive?
          connected_city.disease_cubes[color] += 1
          @disease_cubes[color] -= 1

          # If we're out of cubes, game over
          if @disease_cubes[color].zero?
            @game_over = true
            @game_over_reason = :no_cubes
            break
          end
        end
      else
        trigger_outbreak(connected_city_name, color, outbreak_chain)
      end
    end
  end
end
