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
              :game_over_reason, :difficulty_level, :current_player

  # Initialize a new game state
  def initialize(players_count, difficulty_level = :heroic)
    @players_count = players_count
    reset_game(difficulty_level)
  end

  # Load game state from a YAML file if it exists
  def self.load_from_yaml(file_path = 'current_game.yaml')
    require 'yaml'

    if File.exist?(file_path)
      begin
        puts "Loading game state from #{file_path}"
        saved_state = YAML.load_file(file_path)

        # Create a new instance without initialization
        game = allocate

        # Set up instance variables from the saved state
        game.send(:load_state_from_hash, saved_state)

        return game
      rescue => e
        puts "Error loading game state from file: #{e.message}"
        puts e.backtrace
        return nil
      end
    else
      puts "No saved game state found at #{file_path}"
      return nil
    end
  end

  # Reset the game to its initial state
  def reset_game(difficulty_level)
    @difficulty_level = difficulty_level || @difficulty_level
    raise ArgumentError, 'Player count must be 2-4' unless (2..4).include?(@players_count)
    if difficulty_level
      raise ArgumentError, 'Difficulty must be :introductory, :normal, :heroic' unless %i[introductory normal heroic].include?(difficulty_level)
    end

    @current_player_index = 0
    @outbreak_count = 0
    @infection_rate_marker = 0
    @infection_rate = INFECTION_RATE_TRACK[@infection_rate_marker]
    @game_over = false
    @turn = 1
    @game_over_reason = nil
    @actions_remaining = 4

    # Initialize diseases
    @disease_cubes = {}
    COLORS.each { |color| @disease_cubes[color] = MAX_DISEASE_CUBES_PER_COLOR }

    # Initialize cures
    @cures = {}
    COLORS.each { |color| @cures[color] = false }

    # Initialize game components (delegates to Setup module)
    initialize_game(@players_count)

    # Save the new game state
    save_game_state

    # Return success response
    { status: 'success', message: 'Game restarted successfully' }
  end

  private

  # Set up instance variables from the saved state hash
  def load_state_from_hash(state)
    # Basic game state
    @actions_remaining = state[:game_status][:actions_remaining]
    @turn = state[:game_status][:turn]
    @game_over = state[:game_status][:game_over]
    @game_over_reason = state[:game_status][:game_over_reason]
    @outbreak_count = state[:game_status][:outbreaks]
    @infection_rate = state[:game_status][:infection_rate]
    @infection_rate_marker = state[:game_status][:infection_rate_position]
    @current_player_index = state[:game_status][:current_player_index]

    # Rebuild cities
    @cities = {}
    state[:cities].each do |name, city_data|
      @cities[name] = City.new(
        city_data[:name],
        city_data[:color],
        city_data[:connections]
      )
      @cities[name].disease_cubes = city_data[:disease_cubes]
      @cities[name].has_research_station = city_data[:has_research_station]
    end

    # Disease state
    @disease_cubes = {}
    @cures = {}
    state[:disease_cubes].each do |color, data|
      @disease_cubes[color] = data[:in_supply]
      @cures[color] = data[:cured]
    end

    # Research stations
    @research_stations = state[:research_stations][:locations]

    # Players
    @players = []
    state[:players].each do |player_data|
      player = Player.new(player_data[:role], player_data[:index])
      player.location = player_data[:location]
      player.hand = player_data[:hand].map do |card_data|
        Card.new(card_data[:type], card_data[:name], card_data[:color])
      end
      @players << player
    end

    # Current player reference
    @current_player = @players[@current_player_index]

    # Decks
    @player_deck = state[:decks][:player_deck].map do |card_data|
      Card.new(card_data[:type], card_data[:name], card_data[:color])
    end

    @player_discard = state[:decks][:player_discard].map do |card_data|
      Card.new(card_data[:type], card_data[:name], card_data[:color])
    end

    @infection_deck = state[:decks][:infection_deck].map do |card_data|
      Card.new(card_data[:type], card_data[:name], card_data[:color])
    end

    @infection_discard = state[:decks][:infection_discard].map do |card_data|
      Card.new(card_data[:type], card_data[:name], card_data[:color])
    end

    # Determine player count and difficulty level
    @players_count = @players.size
    # We don't have the difficulty level stored, so we'll default to normal
    @difficulty_level = :normal
  end

  # Helper methods

  def has_city_card?(player_index, city_name)
    player = @players[player_index]
    player.hand.any? { |card| card.type == :city && card.name == city_name }
  end

  def discard_player_card(player_index, card_index)
    player = @players[player_index]
    card = player.hand.delete_at(card_index)
    player.hand = player.sorted_hand
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

  def medic_ability(requested_player, destination)
    raise unless requested_player.is_a?(Player)

    # Automatic medic ability: remove cubes of cured diseases
    return unless requested_player.role == :medic

    city = @cities[destination]
    color = city.color
    return unless @cures[color]

    @disease_cubes[color] += city.disease_cubes
    city.disease_cubes = 0
  end
end
