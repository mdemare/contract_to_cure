require_relative 'config'

module JsonGenerator
  include GameStateConfig

  def to_json_state
    {
      gameStatus: {
        turn: @current_player_index + 1,
        outbreaks: @outbreak_count,
        infectionRate: @infection_rate,
        infectionRatePosition: @infection_rate_marker,
        currentPlayerIndex: @current_player_index,
        phase: 'playerActions' # This would need to be tracked separately in the full implementation
      },
      diseaseCubes: COLORS.each_with_object({}) do |color, hash|
        # Only include cities with cubes
        cities_with_cubes = @cities.select { |_, city| city.disease_cubes.positive? }
                                   .transform_values(&:disease_cubes)

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
          hand: player.hand.map do |card|
            if card.type == :event
              "Action:#{card.name}"
            else
              card.name
            end
          end
        }
      end,
      decks: {
        playerDeck: @player_deck.size,
        infectionDeck: @infection_deck.size
      }
    }.to_json
  end

  def game_status
    {
      players: @players.map do |player|
        {
          role: player.role,
          location: player.location,
          index: player.index,
          hand: player.sorted_hand.map { |card| { type: card.type, name: card.name, color: card.color } }
        }
      end,
      current_player: @current_player_index,
      outbreak_count: @outbreak_count,
      infection_rate: @infection_rate,
      research_stations: @research_stations,
      cures: @cures,
      disease_cubes: @disease_cubes,
      cities_status: @cities.map do |name, city|
        {
          name: name,
          disease_cubes: city.disease_cubes,
          has_research_station: city.has_research_station
        }
      end,
      game_over: @game_over,
      game_over_reason: @game_over_reason,
      remaining_player_cards: @player_deck.size,
      remaining_infection_cards: @infection_deck.size
    }
  end

  def cities_with_3_or_more_cubes
    @cities.select do |_, city|
      city.disease_cubes == 3
    end.map { |name, _| name }
  end

  def eradicated_diseases
    @cures.select do |color, cured|
      cured && @disease_cubes[color] == MAX_DISEASE_CUBES_PER_COLOR
    end.keys
  end
end
