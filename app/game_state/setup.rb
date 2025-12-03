require_relative 'game_state_config'
require 'json'

module Setup
  include GameStateConfig
  def initialize_game(players_count)
    # Initialize cities
    @cities = init_cities
    raise "Expected 48 cities, but got #{@cities.size}" unless @cities.size == 48

    # Initialize players
    @players = init_players(players_count)
    @current_player = @players.first

    # Initialize decks
    raise "Expected 48 cities before creating decks, but got #{@cities.size}" unless @cities.size == 48

    @infection_deck, @infection_discard = init_infection_deck
    @player_deck, @player_discard = init_player_deck(players_count)

    # Initialize research stations
    @research_stations = ['Wuhan'] # Wuhan starts with a research station

    # Set up initial infections
    setup_initial_infections
  end

  def init_cities
    # Load cities from JSON file
    # Use absolute path based on app directory
    app_dir = File.dirname(__FILE__, 2)
    cities_json = File.read(File.join(app_dir, '..', 'public', 'cities.json'))
    cities_data = JSON.parse(cities_json)
    raise "Expected 48 cities in cities.json, but got #{cities_data.size}" unless cities_data.size == 48

    # Convert the JSON data to City objects
    cities = {}
    cities_data.each do |name, data|
      # Convert string keys to symbols for color and convert string array to symbols
      color = data['color'].to_sym
      connections = data['connections']

      # Create a new City object
      cities[name] = City.new(name, color, connections)
      connections.each do |connected_city|
        if (cc = cities[connected_city]) && !cc.connections.include?(name)
          raise "Asymmetric connection: #{name} connects to #{connected_city}, but not vice versa"
        end
      end
      cities.each do |cn, city|
        if city.connections.include?(name) and !connections.include?(cn)
          raise "Asymmetric connection: #{cn} connects to #{name}, but not vice versa"
        end
      end
    end

    # Set Wuhan to have a research station
    cities['Wuhan'].has_research_station = true if cities['Wuhan']

    cities
  end

  def init_players(count)
    # Randomly assign roles to players
    roles = ROLES.shuffle.take(count)

    players = []
    roles.each_with_index do |role, index|
      players << Player.new(role, index)
    end

    players
  end

  def init_infection_deck
    raise "Expected 48 cities for infection deck, but got #{@cities.size}" unless @cities.size == 48

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

    # Create action cards
    action_cards = [
      Card.new(:action, 'Airlift'),
      Card.new(:action, 'Forecast'),
      Card.new(:action, 'Government Grant'),
      Card.new(:action, 'One Quiet Night'),
      Card.new(:action, 'Resilient Population')
    ]

    # Combine and shuffle
    combined_deck = (city_cards + action_cards).shuffle

    # Deal initial hands
    player_deck = combined_deck.dup

    # Deal cards to players
    @players.each do |player|
      CARDS_PER_PLAYER[players_count].times do
        player.hand << player_deck.pop
      end
      player.hand = player.sorted_hand
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
        city.disease_cubes += cube_count
        @disease_cubes[city.color] -= cube_count
      end
    end
  end
end
