class GameState
  attr_reader :cities, :players, :current_player_index, :infection_deck, :infection_discard,
              :player_deck, :player_discard, :research_stations, :disease_cubes, :cures,
              :outbreak_count, :infection_rate, :infection_rate_marker, :game_over,
              :game_over_reason, :difficulty_level

  COLORS = [:blue, :yellow, :black, :red]
  ROLES = [:medic, :scientist, :researcher, :operations_expert, :dispatcher, :contingency_planner, :quarantine_specialist]
  INFECTION_RATE_TRACK = [2, 2, 2, 3, 3, 4, 4]
  MAX_OUTBREAKS = 8
  MAX_DISEASE_CUBES_PER_COLOR = 24
  CARDS_PER_PLAYER = { 2 => 4, 3 => 3, 4 => 2 }
  INITIAL_RESEARCH_STATIONS = 1
  MAX_RESEARCH_STATIONS = 6
  CARDS_NEEDED_FOR_CURE = { scientist: 4, default: 5 }

  # Initialize a new game state
  def initialize(players_count, difficulty_level = :normal)
    raise ArgumentError, "Player count must be 2-4" unless (2..4).include?(players_count)
    raise ArgumentError, "Difficulty must be :introductory, :normal, :heroic" unless [:introductory, :normal, :heroic].include?(difficulty_level)

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

    # Initialize players
    @players = init_players(players_count)

    # Initialize decks
    @infection_deck, @infection_discard = init_infection_deck
    @player_deck, @player_discard = init_player_deck(players_count)

    # Initialize research stations
    @research_stations = ["Atlanta"] # Atlanta starts with a research station

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

    def initialize(role, location = "Atlanta")
      @role = role
      @location = location
      @hand = []
      @role_abilities = set_role_abilities(role)
    end

    private

    def set_role_abilities(role)
      case role
      when :medic
        { description: "Remove all cubes of a single color when treating a disease. Automatically remove cubes of cured diseases in your location." }
      when :scientist
        { description: "You need only 4 cards of the same color to discover a cure." }
      when :researcher
        { description: "You may give a player cards from your hand for one action per card." }
      when :operations_expert
        { description: "You may build a research station in your location without discarding a city card. Once per turn, you may move from a research station to any city by discarding any city card." }
      when :dispatcher
        { description: "Move other players' pawns as if they were your own. Move any pawn to a city with another pawn." }
      when :contingency_planner
        { description: "You may take an event card from the discard pile and use it. Remove it from the game afterward." }
      when :quarantine_specialist
        { description: "Prevent disease cubes in your location and all connected cities." }
      else
        { description: "Unknown role" }
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

  def treat_disease(player_index, color)
    player = @players[player_index]
    city = @cities[player.location]

    return false if city.disease_cubes[color] == 0

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
    selected_cards = card_indices.map { |idx| player.hand[idx] }.select { |card| card.type == :city && card.color == color }
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
    if @infection_deck.any?
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
    if has_quarantine_specialist_protection?(city_name)
      return
    end

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
    if @disease_cubes[color] == 0
      @game_over = true
      @game_over_reason = :no_cubes
      return
    end

    # Handle outbreak if needed
    if outbreak_needed > 0
      trigger_outbreak(city_name, color)
    end
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
        if @disease_cubes[color] > 0
          connected_city.disease_cubes[color] += 1
          @disease_cubes[color] -= 1

          # If we're out of cubes, game over
          if @disease_cubes[color] == 0
            @game_over = true
            @game_over_reason = :no_cubes
            return
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
    # Create cities with their connections
    # This is a simplified version of the Pandemic board
    cities = {
      # Blue cities
      "San Francisco" => City.new("San Francisco", :blue, ["Chicago", "Los Angeles", "Tokyo", "Manila"]),
      "Chicago" => City.new("Chicago", :blue, ["San Francisco", "Los Angeles", "Mexico City", "Atlanta", "Montreal"]),
      "Atlanta" => City.new("Atlanta", :blue, ["Chicago", "Washington", "Miami"]),
      "Montreal" => City.new("Montreal", :blue, ["Chicago", "Washington", "New York"]),
      "Washington" => City.new("Washington", :blue, ["Atlanta", "Montreal", "New York", "Miami"]),
      "New York" => City.new("New York", :blue, ["Montreal", "Washington", "London", "Madrid"]),
      "London" => City.new("London", :blue, ["New York", "Madrid", "Paris", "Essen"]),
      "Madrid" => City.new("Madrid", :blue, ["New York", "London", "Paris", "Algiers", "São Paulo"]),
      "Paris" => City.new("Paris", :blue, ["London", "Madrid", "Algiers", "Milan", "Essen"]),
      "Essen" => City.new("Essen", :blue, ["London", "Paris", "Milan", "St. Petersburg"]),
      "Milan" => City.new("Milan", :blue, ["Essen", "Paris", "Istanbul"]),
      "St. Petersburg" => City.new("St. Petersburg", :blue, ["Essen", "Istanbul", "Moscow"]),

      # Yellow cities
      "Los Angeles" => City.new("Los Angeles", :yellow, ["San Francisco", "Chicago", "Mexico City", "Sydney"]),
      "Mexico City" => City.new("Mexico City", :yellow, ["Los Angeles", "Chicago", "Miami", "Bogotá", "Lima"]),
      "Miami" => City.new("Miami", :yellow, ["Atlanta", "Washington", "Mexico City", "Bogotá"]),
      "Bogotá" => City.new("Bogotá", :yellow, ["Miami", "Mexico City", "Lima", "Buenos Aires", "São Paulo"]),
      "Lima" => City.new("Lima", :yellow, ["Mexico City", "Bogotá", "Santiago"]),
      "Santiago" => City.new("Santiago", :yellow, ["Lima"]),
      "Buenos Aires" => City.new("Buenos Aires", :yellow, ["Bogotá", "São Paulo"]),
      "São Paulo" => City.new("São Paulo", :yellow, ["Bogotá", "Buenos Aires", "Madrid", "Lagos"]),
      "Lagos" => City.new("Lagos", :yellow, ["São Paulo", "Khartoum", "Kinshasa"]),
      "Khartoum" => City.new("Khartoum", :yellow, ["Lagos", "Kinshasa", "Johannesburg", "Cairo"]),
      "Kinshasa" => City.new("Kinshasa", :yellow, ["Lagos", "Khartoum", "Johannesburg"]),
      "Johannesburg" => City.new("Johannesburg", :yellow, ["Kinshasa", "Khartoum"]),

      # Black cities
      "Algiers" => City.new("Algiers", :black, ["Madrid", "Paris", "Istanbul", "Cairo"]),
      "Istanbul" => City.new("Istanbul", :black, ["Milan", "Algiers", "St. Petersburg", "Moscow", "Baghdad", "Cairo"]),
      "Moscow" => City.new("Moscow", :black, ["St. Petersburg", "Istanbul", "Tehran"]),
      "Cairo" => City.new("Cairo", :black, ["Algiers", "Istanbul", "Baghdad", "Riyadh", "Khartoum"]),
      "Baghdad" => City.new("Baghdad", :black, ["Istanbul", "Cairo", "Riyadh", "Karachi", "Tehran"]),
      "Tehran" => City.new("Tehran", :black, ["Moscow", "Baghdad", "Karachi", "Delhi"]),
      "Riyadh" => City.new("Riyadh", :black, ["Cairo", "Baghdad", "Karachi"]),
      "Karachi" => City.new("Karachi", :black, ["Riyadh", "Baghdad", "Tehran", "Delhi", "Mumbai"]),
      "Mumbai" => City.new("Mumbai", :black, ["Karachi", "Delhi", "Chennai"]),
      "Delhi" => City.new("Delhi", :black, ["Tehran", "Karachi", "Mumbai", "Chennai", "Kolkata"]),
      "Chennai" => City.new("Chennai", :black, ["Mumbai", "Delhi", "Kolkata", "Bangkok", "Jakarta"]),
      "Kolkata" => City.new("Kolkata", :black, ["Delhi", "Chennai", "Bangkok", "Hong Kong"]),

      # Red cities
      "Beijing" => City.new("Beijing", :red, ["Seoul", "Shanghai"]),
      "Seoul" => City.new("Seoul", :red, ["Beijing", "Shanghai", "Tokyo"]),
      "Tokyo" => City.new("Tokyo", :red, ["Seoul", "Shanghai", "San Francisco", "Osaka"]),
      "Shanghai" => City.new("Shanghai", :red, ["Beijing", "Seoul", "Tokyo", "Taipei", "Hong Kong"]),
      "Hong Kong" => City.new("Hong Kong", :red, ["Shanghai", "Taipei", "Manila", "Ho Chi Minh City", "Bangkok", "Kolkata"]),
      "Taipei" => City.new("Taipei", :red, ["Shanghai", "Osaka", "Manila", "Hong Kong"]),
      "Osaka" => City.new("Osaka", :red, ["Tokyo", "Taipei"]),
      "Manila" => City.new("Manila", :red, ["Taipei", "Hong Kong", "Ho Chi Minh City", "Sydney", "San Francisco"]),
      "Ho Chi Minh City" => City.new("Ho Chi Minh City", :red, ["Hong Kong", "Manila", "Jakarta", "Bangkok"]),
      "Bangkok" => City.new("Bangkok", :red, ["Kolkata", "Hong Kong", "Ho Chi Minh City", "Jakarta", "Chennai"]),
      "Jakarta" => City.new("Jakarta", :red, ["Bangkok", "Ho Chi Minh City", "Sydney", "Chennai"]),
      "Sydney" => City.new("Sydney", :red, ["Jakarta", "Manila", "Los Angeles"])
    }

    # Set Atlanta to have a research station
    cities["Atlanta"].has_research_station = true

    cities
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
      Card.new(:event, "Airlift"),
      Card.new(:event, "Forecast"),
      Card.new(:event, "Government Grant"),
      Card.new(:event, "One Quiet Night"),
      Card.new(:event, "Resilient Population")
    ]

    # Combine and shuffle
    combined_deck = (city_cards + event_cards).shuffle

    # Deal initial hands
    player_deck = combined_deck.dup
    players_hand = []

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

    epidemic_cards = Array.new(epidemic_count) { Card.new(:epidemic, "Epidemic") }

    # Split deck into piles and add epidemic cards
    pile_size = player_deck.size / epidemic_count
    piles = []

    epidemic_count.times do |i|
      start_idx = i * pile_size
      end_idx = (i == epidemic_count - 1) ? player_deck.size : (i + 1) * pile_size
      pile = player_deck[start_idx ... end_idx]
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
    status = {
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

    status
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
      if card.type == :city
        actions[:move_options] << card.name unless actions[:move_options].include?(card.name)
      end
    end

    # Charter flights (if player has current city card)
    if has_city_card?(player_index, player.location)
      actions[:move_options] = @cities.keys - [player.location]
    end

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
      if city.disease_cubes[color] > 0
        actions[:can_treat_disease][color] = true
      end
    end

    # Share knowledge
    @players.each_with_index do |other_player, other_idx|
      next if other_idx == player_index

      if other_player.location == player.location
        # Give knowledge
        player.hand.each_with_index do |card, card_idx|
          if card.type == :city && (card.name == player.location || player.role == :researcher)
            actions[:can_share_knowledge] << {
              action: :give,
              player: other_idx,
              card_index: card_idx,
              card_name: card.name
            }
          end
        end

        # Take knowledge
        other_player.hand.each_with_index do |card, card_idx|
          if card.type == :city && (card.name == player.location || other_player.role == :researcher)
            actions[:can_share_knowledge] << {
              action: :take,
              player: other_idx,
              card_index: card_idx,
              card_name: card.name
            }
          end
        end
      end
    end

    # Discover cure
    if @research_stations.include?(player.location)
      COLORS.each do |color|
        next if @cures[color]

        cards_of_color = player.hand.select { |card| card.type == :city && card.color == color }
        cards_needed = player.role == :scientist ? CARDS_NEEDED_FOR_CURE[:scientist] : CARDS_NEEDED_FOR_CURE[:default]

        if cards_of_color.size >= cards_needed
          actions[:can_discover_cure] << color
        end
      end
    end

    actions
  end

  # Debugging methods

  def perform_action(action)
    case action
    when :move
    when :charter_flight
    when :shuttle_flight
    when :treat_disease
    when :cure_disease
    when :give_card
    when :take_card
    when :build_research_station
    when :play_card
    when
    @actions_remaining -= 1
    if @actions_remaining == 0
      end_turn
    end
  end

  def debug_city_disease_cubes
    debug_info = {}
    @cities.each do |name, city|
      debug_info[name] = city.disease_cubes.select { |_, count| count > 0 }
    end
    debug_info
  end

  def debug_player_hands
    debug_info = {}
    @players.each_with_index do |player, idx|
      debug_info["Player #{idx} (#{player.role})"] = player.hand.map { |card| "#{card.name} (#{card.type} #{card.color})" }
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
