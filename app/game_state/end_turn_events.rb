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
    @phase = 'infect_cities' unless @pending_hand_limit
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
    card_hash = {
      type: card.type,
      name: card.name,
      color: card.respond_to?(:color) ? card.color : nil
    }
    card_hash[:retrieved] = true if card.retrieved?
    card_hash
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
      connected_city = @cities[connected_city_name]

      # Outbreak spread intentionally does not use medic protection. This preserves
      # the existing difference between spread and direct infection placement.
      next if disease_placement_protected?(connected_city_name, color)
      next unless connected_city.color == color

      # Check if adding cubes would cause game over
      if @disease_cubes[color] == 1
        # Adding all remaining cubes then game over
        add_cubes_to_city(connected_city, 1)
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
        consume_disease_cubes(color, 1)
        add_cubes_to_city(connected_city, 1)
      end

      next unless outbreak

      event = trigger_outbreak(connected_city_name, events, outbreak_chain)
      return event if event && event[:type] == :game_over

      outbreak_chain = event[:outbreak_chain] if event
    end
    { type: :outbreak, city: city_name, color: color, outbreak_chain: outbreak_chain }
  end

  def add_disease_cubes(city_name, color, count, events)
    # Medic protection is intentionally direct-placement-only. Outbreak spread
    # retains its historical behavior and does not apply this guard.
    return if disease_placement_protected?(city_name, color)
    return if cures[color] && has_medic_at_location?(city_name)

    city = cities[city_name]
    return unless city.color == color

    cubes_to_place = [count, 3 - city.disease_cubes].min

    if cubes_to_place > disease_cubes[color]
      add_cubes_to_city(city, disease_cubes[color])
      out_of_cubes(color)
      return { type: :game_over, reason: :no_cubes, color: color }
    end

    consume_disease_cubes(color, cubes_to_place)
    if city.disease_cubes + count > 3
      add_cubes_to_city(city, 3 - city.disease_cubes)
      trigger_outbreak(city_name, events)
    else
      # Normal case - add cubes
      add_cubes_to_city(city, count)
      nil
    end
  end

  # Shared placement primitives keep city and supply mutations consistent while
  # callers retain the distinct rules for direct infection and outbreak spread.
  def add_cubes_to_city(city, count)
    city.disease_cubes = [3, city.disease_cubes + count].min
  end

  def consume_disease_cubes(color, count)
    @disease_cubes[color] -= count
  end

  def disease_placement_protected?(city_name, color)
    has_quarantine_specialist_protection?(city_name) || eradicated?(color)
  end

  def eradicated?(color)
    @cures[color] && @disease_cubes[color] == MAX_DISEASE_CUBES_PER_COLOR
  end

  # Helper method to check if a medic is present at the given location
  def has_medic_at_location?(city_name)
    @players.any? { |player| player.role == :medic && player.location == city_name }
  end
end
