class EndTurn
  attr_reader :events

  def initialize(game_state)
    @game_state = game_state
    @events = []
  end

  def draw_player_card
    if @game_state.player_deck.empty?
      return @game_state.game_over!(:no_player_cards)
    end

    card = @game_state.player_deck.pop
    event = { type: :draw_card, player: @game_state.current_player_index, card: card.description }
    current_player = @game_state.current_player

    if card.type != :epidemic
      current_player.hand << card
      current_player.hand = current_player.sorted_hand

      # Check hand limit (7 cards)
      if current_player.hand.size > 7
        event[:exceeded_hand_limit] = true
        event[:discard_count] = current_player.hand.size - 7
        event[:player_index] = @game_state.current_player_index
      end
    end

    @events << event
    if not @game_state.game_over and event[:card][:type] == :epidemic
      handle_epidemic
    end
    if @game_state.game_over
      # Save final game state when the game is over
      @game_state.save_game_state
      return { game_over: true, reason: @game_state.game_over_reason, events: @events }
    end
  end

  def infect_city
    return nil if @game_state.infection_deck.empty? # Return nil if no city infected
    card = @game_state.infection_deck.pop
    @game_state.infection_discard << card

    city = @game_state.cities[card.name]
    infection_event = add_disease_cubes(city.name, city.color, 1)
    return infection_event if infection_event&.dig(:type) == :game_over # Propagate game over event

    infect_event = { type: :infect_city, city: city.name, color: city.color } # Return infection event

    if infect_event
      @events << infect_event
      if @game_state.game_over
        return { game_over: true, reason: @game_state.game_over_reason, events: @events }
      end
    end
  end

  private

  def handle_epidemic
    # Increase infection rate
    @game_state.increase_infection_rate
    @events << { type: :increase_infection_rate, new_rate: @game_state.infection_rate }

    # Infect: draw bottom card from infection deck (a stack)
    return unless @game_state.infection_deck.any?

    bottom_card = @game_state.infection_deck.shift
    city = @game_state.cities[bottom_card.name]

    # Add 3 cubes of the city's color
    infection_event = add_disease_cubes(city.name, city.color, 3)
    @events << infection_event if infection_event

    # Add card to discard pile
    @game_state.infection_discard << bottom_card # TODO
    @events << { type: :infect_new_city, city: city.name, color: city.color, count: 3, epidemic: true }

    # Intensify: shuffle the infection discard pile and put it on top of infection deck
    # We draw cards via pop, so shuffled cards at the end.
    @game_state.intensify
  end

  def add_disease_cubes(city_name, color, count)
    # Early returns for protection cases
    return if @game_state.has_quarantine_specialist_protection?(city_name)
    return if @game_state.cures[color] && @game_state.disease_cubes[color] == GameStateConfig::MAX_DISEASE_CUBES_PER_COLOR

    city = @game_state.cities[city_name]
    return if city.color != color

    # Check if adding cubes would cause game over
    if count >= @game_state.disease_cubes[color] and city.disease_cubes < 3
      # Adding all remaining cubes then game over
      city.disease_cubes = [3, city.disease_cubes + count].min

      @game_state.out_of_cubes(color)
      return { type: :game_over, reason: :no_cubes, color: color }
    end

    if city.disease_cubes + count > 3
      city.disease_cubes = 3
      @game_state.disease_cubes[color] -= 3 - city.disease_cubes
      @game_state.trigger_outbreak(city_name)
    else
      # Normal case - add cubes
      city.disease_cubes += count
      @game_state.disease_cubes[color] -= count
      nil
    end
  end
end
