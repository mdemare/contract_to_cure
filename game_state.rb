# frozen_string_literal: true

require 'awesome_print'
require 'json'

class GameState
  attr_reader :cities, :players, :current_player_index, :infection_deck, :infection_discard,
              :player_deck, :player_discard, :research_stations, :disease_cubes, :cures,
              :outbreak_count, :infection_rate, :infection_rate_marker, :game_over,
              :game_over_reason, :difficulty_level

  COLORS = %i[blue yellow black red].freeze
  ROLES = %i[medic scientist researcher operations_expert dispatcher contingency_planner
             quarantine_specialist].freeze
  INFECTION_RATE_TRACK = [2, 2, 2, 3, 3, 4, 4].freeze
  MAX_OUTBREAKS = 8
  MAX_DISEASE_CUBES_PER_COLOR = 24
  CARDS_PER_PLAYER = { 2 => 4, 3 => 3, 4 => 2 }.freeze
  INITIAL_RESEARCH_STATIONS = 1
  MAX_RESEARCH_STATIONS = 6
  CARDS_NEEDED_FOR_CURE = { scientist: 4, default: 5 }.freeze

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

    # Initialize diseases
    @disease_cubes = {}
    COLORS.each { |color| @disease_cubes[color] = MAX_DISEASE_CUBES_PER_COLOR }

    # Initialize cures
    @cures = {}
    COLORS.each { |color| @cures[color] = false }

    # Initialize cities
    @cities = init_cities
    raise unless @cities.size == 48

    # Initialize players
    @players = init_players(players_count)

    # Initialize decks
    raise unless @cities.size == 48

    @infection_deck, @infection_discard = init_infection_deck
    @player_deck, @player_discard = init_player_deck(players_count)

    # Initialize research stations
    @research_stations = ['Wuhan'] # Wuhan starts with a research station

    # Set up initial infections
    setup_initial_infections
  end

  # City class for tracking city-specific data
  class City
    attr_reader :name, :color, :connections
    attr_accessor :disease_cubes, :has_research_station

    def initialize(name, color, connections = [])
      @name = name
      @color = color
      @connections = connections
      @disease_cubes = { blue: 0, yellow: 0, black: 0, red: 0 }
      @has_research_station = false
    end

    def add_connection(city_name)
      @connections << city_name unless @connections.include?(city_name)
    end
  end

  # Player class for tracking player-specific data
  class Player
    attr_reader :role, :role_abilities
    attr_accessor :location, :hand

    def initialize(role, location = 'Wuhan')
      @role = role
      @location = location
      @hand = []
      @role_abilities = set_role_abilities(role)
    end

    private

    def set_role_abilities(role)
      case role
      when :medic
        { description: 'Remove all cubes of a single color when treating a disease. Automatically remove cubes of cured diseases in your location.' }
      when :scientist
        { description: 'You need only 4 cards of the same color to discover a cure.' }
      when :researcher
        { description: 'You may give a player cards from your hand for one action per card.' }
      when :operations_expert
        { description: 'You may build a research station in your location without discarding a city card. Once per turn, you may move from a research station to any city by discarding any city card.' }
      when :dispatcher
        { description: "Move other players' pawns as if they were your own. Move any pawn to a city with another pawn." }
      when :contingency_planner
        { description: 'You may take an event card from the discard pile and use it. Remove it from the game afterward.' }
      when :quarantine_specialist
        { description: 'Prevent disease cubes in your location and all connected cities.' }
      else
        { description: 'Unknown role' }
      end
    end
  end

  # Card class for both player and infection cards
  class Card
    attr_reader :type, :name, :color

    def initialize(type, name, color = nil)
      @type = type # :city, :event, :epidemic
      @name = name
      @color = color # Only for city cards
    end
  end

  # Game actions

  def move_pawn(player_index, destination)
    player = @players[player_index]
    current_location = player.location

    # Check if move is valid
    if @cities[current_location].connections.include?(destination) ||
       (@research_stations.include?(current_location) && @research_stations.include?(destination)) ||
       has_city_card?(player_index, destination) ||
       has_city_card?(player_index, current_location) && player.role == :operations_expert

      player.location = destination
      return true
    end

    false
  end

  def build_research_station(player_index, city_name)
    return false if @research_stations.size >= MAX_RESEARCH_STATIONS
    return false if @research_stations.include?(city_name)

    player = @players[player_index]

    # Check if player is at the city
    return false unless player.location == city_name

    # Operations expert can build without a card
    if player.role == :operations_expert
      @research_stations << city_name
      return true
    end

    # Otherwise, player needs the city card
    player_card_index = player.hand.find_index { |card| card.type == :city && card.name == city_name }
    if player_card_index
      discard_player_card(player_index, player_card_index)
      @research_stations << city_name
      return true
    end

    false
  end

  def treat_disease(player_index)
    player = @players[player_index]
    city = @cities[player.location]
    # TODO: color = color of city

    return false if city.disease_cubes[color].zero?

    # Medic can remove all cubes of a color
    if player.role == :medic || @cures[color]
      cubes_removed = city.disease_cubes[color]
      city.disease_cubes[color] = 0
      @disease_cubes[color] += cubes_removed
    else
      city.disease_cubes[color] -= 1
      @disease_cubes[color] += 1
    end

    true
  end

  def share_knowledge(giving_player_index, receiving_player_index, card_index)
    giving_player = @players[giving_player_index]
    receiving_player = @players[receiving_player_index]

    # Both players must be in the same city
    return false unless giving_player.location == receiving_player.location

    card = giving_player.hand[card_index]

    # The card must be a city card matching the current location, or the player must be a researcher
    return false unless card.type == :city &&
                        (card.name == giving_player.location || giving_player.role == :researcher)

    # Move the card
    giving_player.hand.delete_at(card_index)
    receiving_player.hand << card

    true
  end

  def discover_cure(player_index, color, card_indices)
    player = @players[player_index]

    # Player must be at a research station
    return false unless @research_stations.include?(player.location)

    # Cure must not already be discovered
    return false if @cures[color]

    # Determine number of cards needed
    cards_needed = player.role == :scientist ? CARDS_NEEDED_FOR_CURE[:scientist] : CARDS_NEEDED_FOR_CURE[:default]
    return false if card_indices.size != cards_needed

    # Check if all selected cards are of the right color
    selected_cards = card_indices.map do |idx|
      player.hand[idx]
    end.select { |card| card.type == :city && card.color == color }
    return false if selected_cards.size != cards_needed

    # Discard the cards
    card_indices.sort.reverse.each { |idx| discard_player_card(player_index, idx) }

    # Mark the cure as discovered
    @cures[color] = true

    # Check if all cures are discovered (victory condition)
    if @cures.values.all?
      @game_over = true
      @game_over_reason = :victory
    end

    true
  end

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

  def has_quarantine_specialist_protection?(city_name)
    # Check if there's a quarantine specialist in this city
    return true if @players.any? { |p| p.role == :quarantine_specialist && p.location == city_name }

    # Check if there's a quarantine specialist in a connected city
    city = @cities[city_name]
    city.connections.any? do |connected_city|
      @players.any? { |p| p.role == :quarantine_specialist && p.location == connected_city }
    end
  end

  # Initialize methods

  def init_cities
    # Load cities from JSON file

    cities_json = File.read('public/cities.json')
    cities_data = JSON.parse(cities_json)
    raise cities_data unless cities_data.size == 48

    # Convert the JSON data to City objects
    cities = {}
    cities_data.each do |name, data|
      # Convert string keys to symbols for color and convert string array to symbols
      color = data['color'].to_sym
      connections = data['connections']

      # Create a new City object
      cities[name] = City.new(name, color, connections)
    end

    # Set Wuhan to have a research station
    cities['Wuhan'].has_research_station = true if cities['Wuhan']

    cities
  rescue StandardError => e
    puts "Error loading cities from JSON: #{e.message}"
    puts e.backtrace
    # Fall back to returning an empty hash or handling the error as needed
    {}
  end

  def init_players(count)
    # Randomly assign roles to players
    roles = ROLES.shuffle.take(count)

    players = []
    roles.each do |role|
      players << Player.new(role)
    end

    players
  end

  def init_infection_deck
    raise unless @cities.size == 48

    # Create infection cards for each city
    infection_cards = @cities.map do |name, city|
      Card.new(:city, name, city.color)
    end

    # Shuffle the deck
    infection_deck = infection_cards.shuffle
    infection_discard = []

    [infection_deck, infection_discard]
  end

  def init_player_deck(players_count)
    # Create city cards
    city_cards = @cities.map do |name, city|
      Card.new(:city, name, city.color)
    end

    # Create event cards
    event_cards = [
      Card.new(:event, 'Airlift'),
      Card.new(:event, 'Forecast'),
      Card.new(:event, 'Government Grant'),
      Card.new(:event, 'One Quiet Night'),
      Card.new(:event, 'Resilient Population')
    ]

    # Combine and shuffle
    combined_deck = (city_cards + event_cards).shuffle

    # Deal initial hands
    player_deck = combined_deck.dup

    # Deal cards to players
    @players.each do |player|
      CARDS_PER_PLAYER[players_count].times do
        player.hand << player_deck.pop
      end
    end

    # Add epidemic cards
    epidemic_count = case @difficulty_level
                     when :introductory then 4
                     when :normal then 5
                     when :heroic then 6
                     end

    epidemic_cards = Array.new(epidemic_count) { Card.new(:epidemic, 'Event:Epidemic') }

    # Split deck into piles and add epidemic cards
    pile_size = player_deck.size / epidemic_count
    piles = []

    epidemic_count.times do |i|
      start_idx = i * pile_size
      end_idx = i == epidemic_count - 1 ? player_deck.size : (i + 1) * pile_size
      pile = player_deck[start_idx...end_idx]
      pile << epidemic_cards[i]
      piles << pile.shuffle
    end

    # Combine piles to form the final player deck
    player_deck = piles.flatten
    player_discard = []

    [player_deck, player_discard]
  end

  def setup_initial_infections
    # Initial infections: 3 cities with 3 cubes, 3 cities with 2 cubes, 3 cities with 1 cube
    [3, 2, 1].each do |cube_count|
      3.times do
        card = @infection_deck.pop
        @infection_discard << card
        city = @cities[card.name]
        city.disease_cubes[city.color] += cube_count
        @disease_cubes[city.color] -= cube_count
      end
    end
  end

  # Utility methods for game status

  def game_status
    {
      players: @players.map do |player|
        {
          role: player.role,
          location: player.location,
          hand: player.hand.map { |card| { type: card.type, name: card.name, color: card.color } }
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
      city.disease_cubes.any? { |_, count| count >= 3 }
    end.map { |name, _| name }
  end

  def eradicated_diseases
    @cures.select do |color, cured|
      cured && @disease_cubes[color] == MAX_DISEASE_CUBES_PER_COLOR
    end.keys
  end

  def available_actions(player_index)
    player = @players[player_index]
    city = @cities[player.location]

    actions = {
      move_options: [],
      can_build_research_station: false,
      can_treat_disease: {},
      can_share_knowledge: [],
      can_discover_cure: []
    }

    # Move options
    actions[:move_options] = city.connections.dup

    # Direct flights (if player has city cards)
    player.hand.each do |card|
      actions[:move_options] << card.name if (card.type == :city) && !actions[:move_options].include?(card.name)
    end

    # Charter flights (if player has current city card)
    actions[:move_options] = @cities.keys - [player.location] if has_city_card?(player_index, player.location)

    # Shuttle flights (if current city has research station)
    if @research_stations.include?(player.location)
      @research_stations.each do |rs|
        actions[:move_options] << rs unless rs == player.location || actions[:move_options].include?(rs)
      end
    end

    # Build research station
    actions[:can_build_research_station] =
      !@research_stations.include?(player.location) &&
      (@research_stations.size < MAX_RESEARCH_STATIONS) &&
      (has_city_card?(player_index, player.location) || player.role == :operations_expert)

    # Treat disease
    COLORS.each do |color|
      actions[:can_treat_disease][color] = true if city.disease_cubes[color].positive?
    end

    # Share knowledge
    @players.each_with_index do |other_player, other_idx|
      next if other_idx == player_index

      next unless other_player.location == player.location

      # Give knowledge
      player.hand.each_with_index do |card, card_idx|
        next unless card.type == :city && (card.name == player.location || player.role == :researcher)

        actions[:can_share_knowledge] << {
          action: :give,
          player: other_idx,
          card_index: card_idx,
          card_name: card.name
        }
      end

      # Take knowledge
      other_player.hand.each_with_index do |card, card_idx|
        next unless card.type == :city && (card.name == player.location || other_player.role == :researcher)

        actions[:can_share_knowledge] << {
          action: :take,
          player: other_idx,
          card_index: card_idx,
          card_name: card.name
        }
      end
    end

    # Discover cure
    if @research_stations.include?(player.location)
      COLORS.each do |color|
        next if @cures[color]

        cards_of_color = player.hand.select { |card| card.type == :city && card.color == color }
        cards_needed = player.role == :scientist ? CARDS_NEEDED_FOR_CURE[:scientist] : CARDS_NEEDED_FOR_CURE[:default]

        actions[:can_discover_cure] << color if cards_of_color.size >= cards_needed
      end
    end

    actions
  end

  # JSON

  # Add this method to the GameState class
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
        cities_with_cubes = @cities.select { |_, city| city.disease_cubes[color].positive? }
                                   .transform_values { |city| city.disease_cubes[color] }

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
        playerDeck: {
          draw: @player_deck.map do |card|
            if card.type == :event
              "Action:#{card.name}"
            elsif card.type == :epidemic
              'Epidemic'
            else
              card.name
            end
          end,
          discard: @player_discard.map do |card|
            if card.type == :event
              "Action:#{card.name}"
            elsif card.type == :epidemic
              'Epidemic'
            else
              card.name
            end
          end
        },
        infectionDeck: {
          draw: @infection_deck.map(&:name),
          discard: @infection_discard.map(&:name)
        }
      }
    }.to_json
  end

  def medic_move(requested_player, destination)
    raise unless requested_player.is_a?(Player)
    # Automatic medic ability: remove cubes of cured diseases
    if requested_player.role == :medic
      COLORS.each do |color|
        next unless @cures[color]

        city = @cities[destination]
        cubes_removed = city.disease_cubes[color]
        city.disease_cubes[color] = 0
        @disease_cubes[color] += cubes_removed
      end
    end
  end

  def move_drive_ferry(player_index, destination)
    # Validate destination exists
    return { success: false, status: "error", message: 'Invalid destination city' } unless @cities.key?(destination)

    # Check if it's the player's turn or if current player is dispatcher
    current_player = @players[@current_player_index]
    raise unless current_player.is_a?(Player)
    requested_player = @players[player_index]
    raise unless requested_player.is_a?(Player)

    # If not the current player's turn and current player is not dispatcher
    if player_index != @current_player_index && current_player.role != :dispatcher
      return {
        success: false,
        status: "error",
        message: 'Cannot move another player unless you are the dispatcher'
      }
    end

    # TODO check if destination is connection of current city

    # All checks passed, perform the move

    # Move the player
    old_location = requested_player.location
    requested_player.location = destination

    medic_move(requested_player, destination)

    @actions_remaining = (@actions_remaining || 4) - 1

    # End turn if no actions remaining
    end_turn if @actions_remaining <= 0

    {
      success: true,
      status: "success",
      message: "Successfully moved #{requested_player.role} from #{old_location} to #{destination} via direct flight",
      end_turn: @actions_remaining <= 0
    }
  end

  def move_direct_flight(player_index, destination)
    # Validate destination exists
    return { success: false, message: 'Invalid destination city' } unless @cities.key?(destination)

    # Check if it's the player's turn or if current player is dispatcher
    current_player = @players[@current_player_index]
    requested_player = @players[player_index]

    # If not the current player's turn and current player is not dispatcher
    if player_index != @current_player_index && current_player.role != :dispatcher
      return {
        success: false,
        status: "error",
        message: 'Cannot move another player unless you are the dispatcher'
      }
    end

    # Check if player has the destination city card for direct flight
    card_index = requested_player.hand.find_index do |card|
      card.type == :city && card.name == destination
    end

    unless card_index
      return {
        success: false,
        status: "error",
        message: "Player does not have the #{destination} city card for direct flight, he only has #{requested_player.hand.select { _1.type == :city }.inspect}"
      }
    end

    # All checks passed, perform the move
    # Discard the city card
    discard_player_card(player_index, card_index)

    # Move the player
    old_location = requested_player.location
    requested_player.location = destination

    # Automatic medic ability: remove cubes of cured diseases
    medic_move(requested_player, destination)

    # Consume an action (only if moving the current player)
    @actions_remaining -= 1

    # End turn if no actions remaining
    end_turn if @actions_remaining <= 0

    {
      success: true,
      status: "success",
      message: "Successfully moved #{requested_player.role} from #{old_location} to #{destination} via direct flight",
      end_turn: @actions_remaining <= 0
    }
  end

  # Debugging methods

  def debug_city_disease_cubes
    debug_info = {}
    @cities.each do |name, city|
      debug_info[name] = city.disease_cubes.select { |_, count| count.positive? }
    end
    debug_info
  end

  def debug_player_hands
    debug_info = {}
    @players.each_with_index do |player, idx|
      debug_info["Player #{idx} (#{player.role})"] = player.hand.map do |card|
        "#{card.name} (#{card.type} #{card.color})"
      end
    end
    debug_info
  end
end

# Example usage:
# game = GameState.new(4, :normal)
# status = game.game_status
# p status
#
# available_actions = game.available_actions(0)
