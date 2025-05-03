# Main entry point for the GameState components
require_relative 'game_state/config'
require_relative 'game_state/player_actions'
require_relative 'game_state/end_turn_events'
require_relative 'game_state/json_generator'
require_relative 'game_state/setup'
require_relative 'game_state/city'
require_relative 'game_state/player'
require_relative 'game_state/card'

class GameState
  include GameStateConfig
  include PlayerActions
  include EndTurnEvents
  include JsonGenerator
  include Setup

  attr_reader :cities, :players, :current_player_index, :infection_deck, :infection_discard,
              :player_deck, :player_discard, :research_stations, :disease_cubes, :cures,
              :outbreak_count, :infection_rate, :infection_rate_marker, :game_over,
              :game_over_reason, :difficulty_level

  # Initialize a new game state
  def initialize(players_count, difficulty_level = :normal)
    raise ArgumentError, 'Player count must be 2-4' unless (2..4).include?(players_count)
    raise ArgumentError, 'Difficulty must be :introductory, :normal, :heroic' unless %i[introductory normal
                                                                                        heroic].include?(difficulty_level)

    @difficulty_level = difficulty_level
    @current_player_index = 0
    @outbreak_count = 0
    @infection_rate_marker = 0
    @infection_rate = INFECTION_RATE_TRACK[@infection_rate_marker]
    @game_over = false
    @game_over_reason = nil
    @actions_remaining = 4

    # Initialize diseases
    @disease_cubes = {}
    COLORS.each { |color| @disease_cubes[color] = MAX_DISEASE_CUBES_PER_COLOR }

    # Initialize cures
    @cures = {}
    COLORS.each { |color| @cures[color] = false }

    # Initialize game components (delegates to Setup module)
    initialize_game(players_count)
  end

  # Helper methods

  def has_city_card?(player_index, city_name)
    player = @players[player_index]
    player.hand.any? { |card| card.type == :city && card.name == city_name }
  end

  def discard_player_card(player_index, card_index)
    player = @players[player_index]
    card = player.hand.delete_at(card_index)
    @player_discard << card if card
  end

  def has_quarantine_specialist_protection?(city_name)
    # Check if there's a quarantine specialist in this city
    return true if @players.any? { |p| p.role == :quarantine_specialist && p.location == city_name }

    # Check if there's a quarantine specialist in a connected city
    city = @cities[city_name]
    city.connections.any? do |connected_city|
      @players.any? { |p| p.role == :quarantine_specialist && p.location == connected_city }
    end
  end

  def medic_move(requested_player, destination)
    raise unless requested_player.is_a?(Player)
    # Automatic medic ability: remove cubes of cured diseases
    if requested_player.role == :medic
      city = @cities[destination]
      color = city.color
      if @cures[color]
        @disease_cubes[color] += city.disease_cubes
        city.disease_cubes = 0
      end
    end
  end
end
