require 'yaml'
require_relative 'end_turn'

module EndTurnEvents
  include GameStateConfig
  def draw_cards
    end_turn = EndTurn.new(self)
    2.times do |i|
      end_turn.draw_player_card(i)
      return if game_over
    end

    end_turn.events << { type: :wait_infect_cities }
    @phase = 'infect_cities'
    # Save game state after turn is complete
    save_game_state

    { game_over: false, events: end_turn.events } # Return events if game is not over
  end

  def infect_cities
    end_turn = EndTurn.new(self)
    if @quiet_night
      @quiet_night = false
      end_turn.events << { type: :quiet_night }
    else
      @infection_rate.times do
        end_turn.infect_city
        return if game_over
      end
    end

    # Go to next player
    @current_player_idx = (@current_player_idx + 1) % @players.size
    @current_player = @players[@current_player_idx]
    @actions_remaining = 4
    @phase = 'player_actions'
    @turn += 1
    @operations_expert_move_used = false

    # Save game state after turn is complete
    save_game_state

    end_turn.events << { message: "TURN START: #{@current_player.role_name}", type: 'header' }

    { game_over: false, events: end_turn.events } # Return events if game is not over
  end

  # Helper method to convert a card to a hash
  def card_to_hash(card)
    {
      type: card.type,
      name: card.name,
      color: card.respond_to?(:color) ? card.color : nil
    }
  end

  def out_of_cubes(color)
    disease_cubes[color] = 0
    @game_over = true
    @game_over_reason = :no_cubes
  end

  def increase_infection_rate
    @infection_rate_marker += 1
    @infection_rate = INFECTION_RATE_TRACK[@infection_rate_marker] if @infection_rate_marker < INFECTION_RATE_TRACK.size
  end

  def intensify
    @infection_discard.shuffle!
    @infection_deck += @infection_discard
    @infection_discard = []
  end

  def trigger_outbreak(city_name, events, outbreak_chain = [])
    # Prevent chain reactions in the same city
    return nil if outbreak_chain.include?(city_name)

    events << { type: :outbreak, city: city_name, color: @cities[city_name].color, outbreak_chain: outbreak_chain }

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
      if @disease_cubes[color] == 1
        # Adding all remaining cubes then game over
        connected_city.disease_cubes = [3, connected_city.disease_cubes + 1].min
        add_disease_cubes(connected_city_name, color, 1, events)
        @disease_cubes[color] = 0
      end

      if @disease_cubes[color].zero?
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

      event = trigger_outbreak(connected_city_name, events, outbreak_chain)
      return event if event && event[:type] == :game_over

      outbreak_chain = event[:outbreak_chain] if event
    end
    { type: :outbreak, city: city_name, color: color, outbreak_chain: outbreak_chain }
  end

  def add_disease_cubes(city_name, color, count, events)
    # Early returns for protection cases
    return if has_quarantine_specialist_protection?(city_name)
    # Don't add if eradicated
    return if cures[color] && disease_cubes[color] == GameStateConfig::MAX_DISEASE_CUBES_PER_COLOR
    # Don't add if cured and medic present
    return if cures[color] && has_medic_at_location?(city_name)

    city = cities[city_name]
    return if city.color != color

    # Check if adding cubes would cause game over
    if count >= disease_cubes[color] and city.disease_cubes < 3
      # Adding all remaining cubes then game over
      city.disease_cubes = [3, city.disease_cubes + count].min

      out_of_cubes(color)
      return { type: :game_over, reason: :no_cubes, color: color }
    end

    if city.disease_cubes + count > 3
      city.disease_cubes = 3
      disease_cubes[color] -= 3 - city.disease_cubes
      trigger_outbreak(city_name, events)
    else
      # Normal case - add cubes
      city.disease_cubes += count
      disease_cubes[color] -= count
      nil
    end
  end

  # Helper method to check if a medic is present at the given location
  def has_medic_at_location?(city_name)
    @players.any? { |player| player.role == :medic && player.location == city_name }
  end
end
