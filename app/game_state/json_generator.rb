require_relative 'config'

module JsonGenerator
  include GameStateConfig

  def to_json_state
    {
      gameStatus: {
        actions_remaining: @actions_remaining,
        phase: @phase,
        turn: @turn,
        gameOver: @game_over,
        outbreaks: @outbreak_count,
        infectionRate: @infection_rate,
        infectionRatePosition: @infection_rate_marker,
        currentPlayerIndex: @current_player_idx,
        forecast_active: @forecast_active,
        forecast_cards: @forecast_cards
      },
      diseaseCubes: COLORS.each_with_object({}) do |color, hash|
        # Only include cities with cubes
        cities_with_cubes = @cities.select { |_, city| city.color == color && city.disease_cubes.positive? }.
                            transform_values(&:disease_cubes)

        hash[color] = {
          cured: @cures[color],
          eradicated: @cures[color] && @disease_cubes[color] == MAX_DISEASE_CUBES_PER_COLOR,
          inSupply: @disease_cubes[color],
          onBoard: cities_with_cubes
        }
      end,
      researchStations: {
        available: MAX_RESEARCH_STATIONS - @research_stations.size,
        locations: @research_stations
      },
      players: @players.map do |player|
        {
          role: player.role,
          index: player.index,
          location: player.location,
          hand: player.sorted_hand.map(&:description).map.with_index do |o, i|
            o[:index] = i
            o
          end
        }
      end,
      decks: {
        playerDeck: @player_deck.size,
        infectionDeck: @infection_deck.size,
        discardPile: @player_discard.map(&:description),
        infectionDiscardPile: @infection_discard.map(&:description)
      }
    }
  end
end
