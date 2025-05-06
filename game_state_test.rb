require 'minitest/autorun'
require_relative 'game_state'

class GameStateTest < Minitest::Test
  def setup
    @game = GameState.new(2, :normal)
  end

  def test_initialization
    assert_equal 2, @game.players.length
    assert_equal :normal, @game.difficulty_level
    assert_equal 0, @game.current_player_index
    assert_equal 0, @game.outbreak_count
    assert_equal 2, @game.infection_rate
    refute @game.game_over
  end

  def test_invalid_player_count
    assert_raises(ArgumentError) { GameState.new(5) }
    assert_raises(ArgumentError) { GameState.new(1) }
  end

  def test_invalid_difficulty_level
    assert_raises(ArgumentError) { GameState.new(2, :impossible) }
  end

  def test_cities_initialization
    assert_equal 48, @game.cities.size

    # Check that Wuhan has a research station
    wuhan = @game.cities['Wuhan']
    assert_instance_of City, wuhan
    assert_equal 'Wuhan', wuhan.name
    assert wuhan.has_research_station

    # Test a few city connections
    assert wuhan.connections.include?('Shanghai'), 'Wuhan should connect to Shanghai'
  end

  def test_players_initialization
    @game.players.each do |player|
      assert GameStateConfig::ROLES.include?(player.role), "#{player.role} should be a valid role"
      assert_equal 'Wuhan', player.location
      assert_instance_of Hash, player.role_abilities
      assert player.role_abilities.key?(:description)
      refute player.role_abilities[:description].empty?
    end
  end

  def test_infection_deck_initialization
    deck = @game.infection_deck
    discard = @game.infection_discard

    assert_equal 48, deck.size + discard.size, 'Should have cards for all 48 cities'
    assert_equal 9, discard.size, 'Should have 9 cards in the infection discard pile after setup'

    # Test that all infection cards are city cards
    all_cards = deck + discard
    all_cards.each do |card|
      assert_equal :city, card.type
      assert @game.cities.key?(card.name), "#{card.name} should be a valid city"
    end
  end

  def test_player_deck_initialization
    # Two players game should have 4 cards per player
    assert_equal 4, @game.players[0].hand.size
    assert_equal 4, @game.players[1].hand.size

    # Normal difficulty should have 5 epidemic cards
    epidemic_count = @game.player_deck.count { |card| card.type == :epidemic }
    assert_equal 5, epidemic_count

    # Create a different game with different difficulty to test epidemic count
    easy_game = GameState.new(2, :introductory)
    epidemic_count = easy_game.player_deck.count { |card| card.type == :epidemic }
    assert_equal 4, epidemic_count
  end

  def test_initial_infections
    # After setup, should have 9 cities with infection cubes
    cities_with_3 = @game.cities.count { |_, city| city.disease_cubes == 3 }
    cities_with_2 = @game.cities.count { |_, city| city.disease_cubes == 2 }
    cities_with_1 = @game.cities.count { |_, city| city.disease_cubes == 1 }

    assert_equal 3, cities_with_3
    assert_equal 3, cities_with_2
    assert_equal 3, cities_with_1

    # Total number of cubes on the board should be 18 (3*3 + 3*2 + 3*1)
    total_cubes_on_board = @game.cities.sum { |_, city| city.disease_cubes }
    assert_equal 18, total_cubes_on_board

    # Check that proper number of cubes have been removed from supply
    removed_cubes = 0
    @game.disease_cubes.each_value do |count|
      removed_cubes += (GameStateConfig::MAX_DISEASE_CUBES_PER_COLOR - count)
    end
    assert_equal 18, removed_cubes
  end
end

class PlayerActionsTest < Minitest::Test
  def setup
    @game = GameState.new(2, :normal)

    # Setup specific test scenario
    @player_index = 0
    @current_player = @game.players[@player_index]

    # Set a known location for testing
    @current_player.location = 'Wuhan'

    # Add a specific card to hand for testing direct flight
    @chicago_card = Card.new(:city, 'Chicago', :blue)
    @current_player.hand.reject! { it.name == 'Chicago' }
    @current_player.hand << @chicago_card
  end

  def test_move_drive_ferry
    # Get the connections of Wuhan
    wuhan = @game.cities['Wuhan']
    connected_city = wuhan.connections.first

    # Try to move to a connected city
    result = @game.move_drive_ferry(@player_index, connected_city)

    assert result[:success]
    assert_equal connected_city, @current_player.location

    # Try to move to a non-connected city
    non_connected = @game.cities.keys.find { |name| !wuhan.connections.include?(name) && name != 'Wuhan' }
    result = @game.move_drive_ferry(@player_index, non_connected)

    refute result[:success]
  end

  def test_move_direct_flight
    # Test direct flight to Chicago using the card we added
    result = @game.move_direct_flight(@player_index, 'Chicago')

    assert result[:success]
    assert_equal 'Chicago', @current_player.location

    # Card should be discarded
    assert_equal(0, @current_player.hand.count { |card| card.name == 'Chicago' })
    assert_equal(1, @game.player_discard.count { |card| card.name == 'Chicago' })

    # Try to move to a city without the card
    result = @game.move_direct_flight(@player_index, 'Paris')

    puts result.inspect if result[:success]
    refute result[:success]
  end

  def test_build_research_station
    # Add the card matching current location to hand
    @current_player.hand << Card.new(:city, 'Wuhan', :blue)

    # Remove existing research station for testing
    @game.instance_variable_set(:@research_stations, [])

    # Build research station
    assert @game.build_research_station(@player_index, 'Wuhan')

    # Verify research station was built
    assert @game.research_stations.include?('Wuhan')

    # Try to build in a different location than player's current location
    refute @game.build_research_station(@player_index, 'Chicago')
  end

  def test_operations_expert_build
    # Set player role to operations expert
    @current_player.instance_variable_set(:@role, :operations_expert)

    # Remove existing research station for testing
    @game.instance_variable_set(:@research_stations, [])

    # Build research station without city card
    assert @game.build_research_station(@player_index, 'Wuhan')

    # Verify research station was built
    assert @game.research_stations.include?('Wuhan')
  end
end

class DiseaseTest < Minitest::Test
  def setup
    @game = GameState.new(2, :normal)
  end

  def test_treat_disease
    # Move current player to a city with disease cubes
    infected_city_name = nil
    infected_city = nil

    @game.cities.each do |name, city|
      next unless city.disease_cubes.positive?

      infected_city_name = name
      infected_city = city
      break
    end

    # Make sure we found an infected city
    refute_nil infected_city_name

    # Move player to infected city
    @game.players[0].location = infected_city_name

    # Get initial disease cube count
    initial_cubes = infected_city.disease_cubes
    initial_supply = @game.disease_cubes[infected_city.color]

    # Treat disease
    result = @game.treat_disease(0)

    assert result[:success]

    # For regular player, should remove 1 cube
    if @game.players[0].role != :medic && !@game.cures[infected_city.color]
      assert_equal initial_cubes - 1, infected_city.disease_cubes
      assert_equal initial_supply + 1, @game.disease_cubes[infected_city.color]
    else
      # For medic or cured disease, should remove all cubes
      assert_equal 0, infected_city.disease_cubes
      assert_equal initial_supply + initial_cubes, @game.disease_cubes[infected_city.color]
    end
  end

  def test_discover_cure
    player = @game.players.reject { it.role == :scientist }[0]

    # Move player to a city with a research station
    player.location = 'Wuhan'

    # Make sure there's a research station
    @game.instance_variable_set(:@research_stations, ['Wuhan'])

    # Give player 5 blue cards
    player.hand = []
    5.times do |i|
      player.hand << Card.new(:city, "Blue City #{i}", :blue)
    end

    assert !@game.cures[:blue]

    # Try to discover cure
    card_indices = [0, 1, 2, 3, 4]
    assert @game.discover_cure(@game.players.index(player), :blue, card_indices)

    # Verify cure was discovered
    assert @game.cures[:blue]

    # Cards should be discarded
    assert_equal 0, player.hand.size
    assert_equal 5, @game.player_discard.size
  end

  def test_scientist_discover_cure
    # Make player a scientist
    @game.players[0].instance_variable_set(:@role, :scientist)
    player = @game.players[0]

    # Move player to a city with a research station
    player.location = 'Wuhan'

    # Make sure there's a research station
    @game.instance_variable_set(:@research_stations, ['Wuhan'])

    # Give player 4 red cards
    player.hand = []
    4.times do |i|
      player.hand << Card.new(:city, "Red City #{i}", :red)
    end

    # Try to discover cure
    card_indices = [0, 1, 2, 3]
    assert @game.discover_cure(0, :red, card_indices)

    # Verify cure was discovered
    assert @game.cures[:red]

    # Cards should be discarded
    assert_equal 0, player.hand.size
    assert_equal 4, @game.player_discard.size
  end

  def test_medic_auto_remove_cubes
    # Make player a medic
    @game.players[0].instance_variable_set(:@role, :medic)
    player = @game.players[0]

    # Set up a cure
    @game.instance_variable_get(:@cures)[:blue] = true

    # Create a blue city with cubes
    city_name = 'Chicago'
    @game.cities[city_name].instance_variable_set(:@color, :blue)
    @game.cities[city_name].disease_cubes = 3

    # Record initial cube supply
    initial_supply = @game.disease_cubes[:blue]

    # Move medic to the city (should trigger auto-removal)
    @game.medic_move(player, city_name)

    # Verify all cubes were removed
    assert_equal 0, @game.cities[city_name].disease_cubes
    assert_equal initial_supply + 3, @game.disease_cubes[:blue]
  end
end

class EndTurnEventsTest < Minitest::Test
  def setup
    @game = GameState.new(2, :normal)
  end

  def test_draw_player_cards
    initial_hand_size = @game.players[0].hand.size
    initial_deck_size = @game.player_deck.size

    # End turn should draw 2 cards
    result = @game.end_turn

    # Check if game is not over
    refute result[:game_over] unless @game.game_over

    # Player should have 2 more cards
    expected_cards = initial_hand_size + 2
    if @game.players[0].hand.size != expected_cards
      # Could be less if an epidemic was drawn
      epidemic_drawn = result[:events].any? { |event| event[:type] == :epidemic }
      assert epidemic_drawn
    end

    # Deck should have 2 fewer cards
    assert_equal initial_deck_size - 2, @game.player_deck.size
  end

  def test_infection_phase
    initial_infection_deck_size = @game.infection_deck.size

    # End turn should infect cities based on infection rate
    result = @game.end_turn

    # Check if game is not over
    refute result[:game_over] unless @game.game_over

    # Should have infected more cities
    infection_events = result[:events].count { |event| event[:type] == :infect_city }
    assert_equal @game.infection_rate, infection_events

    # Infection deck should have fewer cards
    assert_equal initial_infection_deck_size - @game.infection_rate, @game.infection_deck.size
  end

  def test_epidemic
    # Add an epidemic card to the top of the player deck
    @game.instance_variable_get(:@player_deck).push(Card.new(:epidemic, 'Event:Epidemic'))

    initial_infection_rate_marker = @game.instance_variable_get(:@infection_rate_marker)

    # End turn will draw the epidemic card
    result = @game.end_turn

    # Find epidemic event
    epidemic_event = result[:events].find { |event| event[:type] == :epidemic }
    refute_nil epidemic_event

    # Check that infection rate marker increased
    epidemic_count = result[:events].count { it[:type] == :epidemic }
    assert_equal initial_infection_rate_marker + epidemic_count, @game.instance_variable_get(:@infection_rate_marker)
  end

  def test_outbreak
    # Setup a city at 3 cubes
    city_name = 'Chicago'
    @game.cities[city_name].disease_cubes = 3
    color = @game.cities[city_name].color

    # Set up connections so we can test outbreak mechanics
    connected_cities = @game.cities[city_name].connections

    # Initial outbreak count
    initial_outbreak_count = @game.outbreak_count

    # Add a cube, which should trigger an outbreak
    @game.send(:add_disease_cubes, city_name, color, 1)

    # Verify outbreak occurred
    assert_equal initial_outbreak_count + 1, @game.outbreak_count

    # Connected cities should have 1 cube each
    connected_cities.select { @game.cities[it].color == color }.each do |connected|
      assert @game.cities[connected].disease_cubes.positive?, "Connected city #{connected} should have disease cubes"
    end
  end

  def test_chain_reaction_outbreaks
    # Set up a chain of cities at 3 cubes
    city1 = 'Chicago'
    city2 = @game.cities[city1].connections.first

    # Get the color for consistency
    color = @game.cities[city1].color

    # Set cube counts
    @game.cities[city1].disease_cubes = 3
    @game.cities[city2].disease_cubes = 3

    # Initial outbreak count
    initial_outbreak_count = @game.outbreak_count

    # Add a cube to first city, which should trigger chain reaction
    @game.send(:add_disease_cubes, city1, color, 1)

    # Should have had 2 outbreaks
    assert_equal initial_outbreak_count + 2, @game.outbreak_count
  end

  def test_quarantine_specialist_protection
    # Make player a quarantine specialist
    @game.players[0].instance_variable_set(:@role, :quarantine_specialist)
    player = @game.players[0]

    # Move to a specific city
    protected_city_name = 'Chicago'
    player.location = protected_city_name

    protected_city = @game.cities[protected_city_name]

    # Try to add cubes
    color = protected_city.color
    cubes = protected_city.disease_cubes

    # City should be protected
    assert @game.has_quarantine_specialist_protection?(protected_city_name)

    # Add disease cubes (or try to)
    @game.send(:add_disease_cubes, protected_city_name, color, 1)

    # Should not have added any cubes
    assert_equal cubes, protected_city.disease_cubes

    # Connected cities should also be protected
    connected_city_name = protected_city.connections.first
    connected_city = @game.cities[connected_city_name]
    cubes = connected_city.disease_cubes

    assert @game.has_quarantine_specialist_protection?(connected_city_name)

    # Add disease cubes to connected city
    @game.send(:add_disease_cubes, connected_city_name, connected_city.color, 1)

    # Should not have added any cubes
    assert_equal cubes, connected_city.disease_cubes
  end
end

class GameStatusAndJsonOutputTest < Minitest::Test
  def setup
    @game = GameState.new(2, :normal)
  end

  def test_to_json_state
    # Just ensure it can generate JSON without errors
    json = @game.to_json_state
    assert json.is_a?(String)

    # Should be valid JSON
    parsed = JSON.parse(json)
    assert parsed.is_a?(Hash)

    # Check for required keys
    assert parsed.key?('gameStatus')
    assert parsed.key?('diseaseCubes')
    assert parsed.key?('researchStations')
    assert parsed.key?('players')
    assert parsed.key?('decks')
  end

  def test_game_status
    status = @game.game_status

    assert status.is_a?(Hash)
    assert_equal @game.players.size, status[:players].size
    assert_equal @game.current_player_index, status[:current_player]
    assert_equal @game.outbreak_count, status[:outbreak_count]
    assert_equal @game.infection_rate, status[:infection_rate]
    assert_equal @game.research_stations, status[:research_stations]
  end

  def test_cities_with_3_or_more_cubes
    # Initially no cities should have 3+ cubes after setup infections
    cities = @game.cities_with_3_or_more_cubes
    assert cities.size == 3

    # Set a city to 3 cubes
    test_city = @game.cities.keys.first
    @game.cities[test_city].disease_cubes = 3

    # Check that it's reported correctly
    updated_cities = @game.cities_with_3_or_more_cubes
    assert updated_cities.include?(test_city)
  end

  def test_eradicated_diseases
    # Initially no diseases are eradicated
    eradicated = @game.eradicated_diseases
    assert_empty eradicated

    # Set up a cured disease with all cubes in supply
    color = :blue
    @game.instance_variable_get(:@cures)[color] = true
    @game.instance_variable_get(:@disease_cubes)[color] = GameStateConfig::MAX_DISEASE_CUBES_PER_COLOR

    # Check that it's reported as eradicated
    updated_eradicated = @game.eradicated_diseases
    assert_includes updated_eradicated, color
  end
end
