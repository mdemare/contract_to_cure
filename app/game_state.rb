# Main entry point for the GameState components
require_relative 'game_state/game_state_config'

require_relative 'game_state/action_cards'
require_relative 'game_state/player_actions'
require_relative 'game_state/end_turn_events'
require_relative 'game_state/json_generator'
require_relative 'game_state/setup'
require_relative 'game_state/city'
require_relative 'game_state/player'
require_relative 'game_state/card'

class GameState
  include ActionCards
  include GameStateConfig
  include PlayerActions
  include EndTurnEvents
  include JsonGenerator
  include Setup

  attr_reader :cities, :players, :current_player_idx, :infection_deck, :infection_discard,
              :player_deck, :player_discard, :research_stations, :disease_cubes, :cures,
              :outbreak_count, :infection_rate, :infection_rate_marker, :game_over,
              :game_over_reason, :difficulty_level, :current_player, :forecast_active,
              :actions_remaining, :operations_expert_move_used

  # Initialize a new game state
  def initialize(players_count, difficulty_level = :heroic)
    @players_count = players_count
    reset_game(difficulty_level)
  end

  # Load game state from Redis if it exists
  def self.load_from_redis(redis_key = nil)
    require 'redis'
    require 'yaml'

    # Use thread-local key if set (for testing), otherwise use default
    redis_key ||= Thread.current[:game_redis_key] || 'contract-to-cure/current-game'

    redis_url = ENV['REDIS_URL'] || 'redis://localhost:6379'
    redis = Redis.new(url: redis_url)
    saved_data = redis.get(redis_key)

    return nil unless saved_data

    begin
      # Load as YAML with permitted classes for security
      saved_state = YAML.load(saved_data, permitted_classes: [GameState, Player, Card, City, Symbol])

      # If we got a GameState object directly, return it
      return saved_state if saved_state.is_a?(GameState)

      # Otherwise, create a new instance without initialization
      game = allocate

      # Set up instance variables from the saved state
      game.send(:load_state_from_hash, saved_state)

      return game
    rescue => e
      puts "Error loading game state from Redis: #{e.message}"
      puts e.backtrace
      return nil
    end
  rescue Redis::BaseError => e
    puts "Redis connection error: #{e.message}"
    return nil
  end

  def game_over!(reason)
    @game_over = true
    @game_over_reason = reason
    save_game_state
    return { type: :game_over, reason: game_over_reason }
  end

  def check_action
    return nil if @phase == 'player_actions'

    { status: 'error', message: 'No more actions allowed' }
  end

  # Public method to save game state to Redis
  def save_game_state(redis_key = nil)
    require 'redis'

    # Use thread-local key if set (for testing), otherwise use default
    redis_key ||= Thread.current[:game_redis_key] || 'contract-to-cure/current-game'

    begin
      # Create a hash with all game state, including hidden information like decks
      game_state = {
        game_status: {
          actions_remaining: @actions_remaining,
          phase: @phase,
          turn: @turn,
          game_over: @game_over,
          game_over_reason: @game_over_reason,
          outbreaks: @outbreak_count,
          infection_rate: @infection_rate,
          infection_rate_position: @infection_rate_marker,
          current_player_idx: @current_player_idx,
          quiet_night: @quiet_night,
          operations_expert_move_used: @operations_expert_move_used
        },
        disease_cubes: COLORS.each_with_object({}) do |color, hash|
          hash[color] = {
            cured: @cures[color],
            eradicated: @cures[color] && @disease_cubes[color] == MAX_DISEASE_CUBES_PER_COLOR,
            in_supply: @disease_cubes[color]
          }
        end,
        cities: @cities.transform_values do |city|
          {
            name: city.name,
            color: city.color,
            connections: city.connections,
            disease_cubes: city.disease_cubes,
            has_research_station: city.has_research_station
          }
        end,
        research_stations: {
          available: MAX_RESEARCH_STATIONS - @research_stations.size,
          locations: @research_stations
        },
        players: @players.map do |player|
          {
            role: player.role,
            index: player.index,
            location: player.location,
            hand: player.hand.map { |card| card_to_hash(card) }
          }
        end,
        decks: {
          player_deck: @player_deck.map { |card| card_to_hash(card) },
          player_discard: @player_discard.map { |card| card_to_hash(card) },
          infection_deck: @infection_deck.map { |card| card_to_hash(card) },
          infection_discard: @infection_discard.map { |card| card_to_hash(card) }
        }
      }

      # Save to Redis
      redis_url = ENV['REDIS_URL'] || 'redis://localhost:6379'
      redis = Redis.new(url: redis_url)
      redis.set(redis_key, game_state.to_yaml)
    rescue Redis::BaseError => e
      puts "Redis connection error while saving: #{e.message}"
    rescue => e
      puts "Error saving game state to Redis: #{e.message}"
    end
  end

  # Reset the game to its initial state
  def reset_game(difficulty_level)
    @difficulty_level = difficulty_level || @difficulty_level
    raise ArgumentError, 'Player count must be 2-4' unless (2..4).include?(@players_count)

    if difficulty_level && !%i[introductory normal heroic].include?(difficulty_level)
      raise ArgumentError, 'Difficulty must be :introductory, :normal, :heroic'
    end

    @forecast_active = false
    @forecast_cards = nil
    @current_player_idx = 0
    @outbreak_count = 0
    @infection_rate_marker = 0
    @infection_rate = INFECTION_RATE_TRACK[@infection_rate_marker]
    @game_over = false
    @turn = 1
    @game_over_reason = nil
    @actions_remaining = 4
    @phase = 'player_actions'
    @operations_expert_move_used = false

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
    { success: true, status: 'success', message: 'Game restarted successfully' }
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

  # NEW HELPER METHODS FOR CARD NAMES

  # Find a card by name in a player's hand and return both the card and its index
  def find_card_in_player_hand(player_index, card_name)
    player = @players[player_index]
    card_index = player.hand.find_index { |card| card.name == card_name }

    return nil, nil if card_index.nil?

    return player.hand[card_index], card_index
  end

  # Find a city card by name in a player's hand and return both the card and its index
  def find_city_card_in_player_hand(player_index, city_name)
    player = @players[player_index]
    card_index = player.hand.find_index { |card| card.type == :city && card.name == city_name }

    return nil, nil if card_index.nil?

    return player.hand[card_index], card_index
  end

  # Find an action card by name in a player's hand and return both the card and its index
  def find_action_card_in_player_hand(player_index, card_name)
    player = @players[player_index]
    card_index = player.hand.find_index { |card| card.type == :action && card.name == card_name }

    return nil, nil if card_index.nil?

    return player.hand[card_index], card_index
  end

  # Discard a card by name from a player's hand
  def discard_player_card_by_name(player_index, card_name, retrieved = false)
    _, card_index = find_card_in_player_hand(player_index, card_name)

    return false if card_index.nil?

    player = @players[player_index]
    card = player.hand.delete_at(card_index)
    player.hand = player.sorted_hand
    @player_discard << card if card && !retrieved
    return true
  end

  # New version of has_city_card that doesn't depend on an existing method
  def has_city_card?(player_index, city_name)
    player = @players[player_index]
    player.hand.any? { |card| card.type == :city && card.name == city_name }
  end

  # Check if a player has a specific action card
  def has_action_card?(player_index, card_name)
    player = @players[player_index]
    player.hand.any? { |card| card.type == :action && card.name == card_name }
  end

  private

  # Set up instance variables from the saved state hash
  def load_state_from_hash(state)
    # Basic game state
    @actions_remaining = state[:game_status][:actions_remaining]
    @turn = state[:game_status][:turn]
    @phase = state[:game_status][:phase]
    @game_over = state[:game_status][:game_over]
    @game_over_reason = state[:game_status][:game_over_reason]
    @outbreak_count = state[:game_status][:outbreaks]
    @infection_rate = state[:game_status][:infection_rate]
    @infection_rate_marker = state[:game_status][:infection_rate_position]
    @current_player_idx = state[:game_status][:current_player_idx]
    @quiet_night = state[:game_status][:quiet_night]
    @forecast_active = state[:game_status][:forecast_active] || false
    @forecast_cards = state[:game_status][:forecast_cards]
    @operations_expert_move_used = state[:game_status][:operations_expert_move_used] || false

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
    @current_player = @players[@current_player_idx]

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

  # Helper method for medic ability
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
