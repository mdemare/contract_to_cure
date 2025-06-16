class EndTurn
  attr_reader :events

  def initialize(game_state)
    @game_state = game_state
    @events = []
  end

  def draw_player_card(i)
    if @game_state.player_deck.empty?
      @game_state.defer_game_over!(:no_player_cards)
      return { type: :game_over, reason: :no_player_cards }
    end

    card = @game_state.player_deck.pop
    event = { type: :draw_card, player: @game_state.current_player_idx, card: card.description }
    current_player = @game_state.current_player

    if card.type != :epidemic
      current_player.hand << card
      current_player.hand = current_player.sorted_hand
    end

    # Check hand limit (7 cards)
    if i == 1 and current_player.hand.size > 7
      event[:exceeded_hand_limit] = true
      event[:discard_count] = current_player.hand.size - 7
      event[:player_index] = @game_state.current_player_idx
      puts event.inspect
    end

    @events << event
    return unless !@game_state.game_over and !@game_state.deferred_game_over? and event[:card][:type] == :epidemic

    handle_epidemic
  end

  def infect_city
    return nil if @game_state.infection_deck.empty? # Return nil if no city infected

    card = @game_state.infection_deck.pop
    @game_state.infection_discard << card

    city = @game_state.cities[card.name]
    @events << { type: :infect_city, city: city.name, color: city.color }
    @game_state.add_disease_cubes(city.name, city.color, 1, @events)

    # Continue processing even if game over is deferred
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
    infection_event = @game_state.add_disease_cubes(city.name, city.color, 3, @events)
    @events << infection_event if infection_event

    # Add card to discard pile
    @game_state.infection_discard << bottom_card # TODO
    @events << { type: :infect_new_city, city: city.name, color: city.color, count: 3, epidemic: true }

    # Intensify: shuffle the infection discard pile and put it on top of infection deck
    # We draw cards via pop, so shuffled cards at the end.
    @game_state.intensify
  end
end
