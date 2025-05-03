# frozen_string_literal: true

require_relative 'config'

module Setup
  include GameStateConfig
  def initialize_game(players_count)
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
        city.disease_cubes += cube_count
        @disease_cubes[city.color] -= cube_count
      end
    end
  end
end
