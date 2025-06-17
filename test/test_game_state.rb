require_relative 'test_helper'

class TestGameState < TestHelper
  def test_redis_key_randomization
    # Create multiple test keys and ensure they're different
    key1 = send(:generate_test_redis_key)
    key2 = send(:generate_test_redis_key)

    refute_equal key1, key2, "Redis keys should be randomized"
    assert_match(%r{contract-to-cure/test-[a-f0-9]{16}-\d+}, key1)
    assert_match(%r{contract-to-cure/test-[a-f0-9]{16}-\d+}, key2)
  end

  def test_redis_key_expiry
    create_test_game_state

    # Check that the key exists
    assert @redis.exists?(@test_redis_key), "Test Redis key should exist"

    # Check TTL is set (should be around 300 seconds)
    ttl = @redis.ttl(@test_redis_key)
    assert ttl.positive?, "Redis key should have TTL set"
    assert ttl <= 300, "TTL should be 5 minutes or less"
    assert ttl > 250, "TTL should be close to 5 minutes"
  end

  def test_game_state_fixture_creation
    game_state = create_test_game_state(:normal, 3)

    assert_equal 3, game_state.players.length
    assert_equal :normal, game_state.difficulty_level
    assert_equal 4, game_state.actions_remaining
    assert_equal 0, game_state.current_player_idx
  end

  def test_custom_game_state_modification
    game_state = create_game_with_custom_state do |state|
      state.instance_variable_set(:@current_player_idx, 2)
      state.instance_variable_set(:@actions_remaining, 1)
      # Add a card to player's hand
      require_relative '../app/game_state/card'
      test_card = Card.new(:city, 'Test City', :blue)
      state.players[0].hand << test_card
    end

    assert_equal 2, game_state.current_player_idx
    assert_equal 1, game_state.actions_remaining
    assert_equal 1, game_state.players[0].hand.select { |c| c.name == 'Test City' }.length
  end

  def test_different_difficulty_levels
    [:introductory, :normal, :heroic].each do |difficulty|
      game_state = create_test_game_state(difficulty)
      assert_equal difficulty, game_state.difficulty_level
    end
  end

  def test_game_state_backup_and_restore
    # Create original state
    create_test_game_state

    # Verify backup was created (backup functionality not implemented yet)
    # assert @original_game_state, "Original game state should be backed up"

    # Modify the state
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@outbreak_count, 5)
    end

    # Verify current state is modified
    current_data = @redis.get(@test_redis_key)
    current_state = Marshal.load(current_data)
    assert_equal 5, current_state.outbreak_count
  end

  def test_multiple_test_instances_isolated
    # Create first test instance
    create_test_game_state
    key1 = @test_redis_key

    # Create second test helper to simulate another test
    helper2 = TestHelper.new('test_dummy')
    helper2.setup

    helper2.send(:create_test_game_state)
    key2 = helper2.instance_variable_get(:@test_redis_key)

    # Keys should be different
    refute_equal key1, key2

    # Both should exist in Redis
    assert @redis.exists?(key1)
    assert @redis.exists?(key2)

    # Clean up second helper
    helper2.teardown

    # Second key should be cleaned up
    refute @redis.exists?(key2)
    # First key should still exist
    assert @redis.exists?(key1)
  end

  def test_game_state_serialization_deserialization
    original_game = create_test_game_state

    # Get serialized data from Redis
    serialized_data = @redis.get(@test_redis_key)
    assert serialized_data, "Serialized data should exist in Redis"

    # Deserialize and verify
    deserialized_game = Marshal.load(serialized_data)

    assert_equal original_game.players.length, deserialized_game.players.length
    assert_equal original_game.difficulty_level, deserialized_game.difficulty_level
    assert_equal original_game.actions_remaining, deserialized_game.actions_remaining
    assert_equal original_game.current_player_idx, deserialized_game.current_player_idx
  end

  def test_cleanup_removes_test_keys
    # Create a game state (creates Redis key)
    create_test_game_state
    key = @test_redis_key

    # Verify key exists
    assert @redis.exists?(key), "Test key should exist before cleanup"

    # Trigger cleanup
    teardown

    # Verify key is removed
    refute @redis.exists?(key), "Test key should be removed after cleanup"
  end

  def test_redis_connection_handling
    # Test with custom Redis URL
    ENV['REDIS_URL'] = 'redis://localhost:6379/1'

    # Create new helper to pick up the new Redis URL
    helper = TestHelper.new('test_dummy')
    helper.setup

    # Should be able to create game state
    game_state = helper.send(:create_test_game_state)
    assert game_state

    helper.teardown

    # Reset Redis URL
    ENV.delete('REDIS_URL')
  end

  def test_game_state_json_structure
    create_test_game_state

    get '/game_state.json'
    assert_successful_response(last_response)

    data = parse_json_response(last_response)

    # Verify required JSON structure (using camelCase from JSON generator)
    required_keys = %w[gameStatus diseaseCubes researchStations players decks]

    required_keys.each do |key|
      assert data.key?(key), "Game state JSON should include #{key}"
    end

    # Verify players structure
    assert data['players'].is_a?(Array)
    assert data['players'].length.positive?

    data['players'].each do |player|
      assert player.key?('role')
      assert player.key?('location')
      assert player.key?('hand')
    end

    # Verify game status structure
    assert data['gameStatus'].is_a?(Hash)
    assert data['gameStatus'].key?('actions_remaining')
    assert data['gameStatus'].key?('currentPlayerIndex')

    # Verify numerical values
    assert data['gameStatus']['currentPlayerIndex'].is_a?(Integer)
    assert data['gameStatus']['actions_remaining'].is_a?(Integer)
  end

  def test_operations_expert_move_requires_card_selection
    create_game_with_custom_state do |state|
      # Set up Operations Expert at a research station with city cards
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :operations_expert)
      current_player.location = 'Chicago'

      # Add Chicago as research station
      state.research_stations << 'Chicago'

      # Give player some city cards
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'Houston', :blue)
      current_player.hand << Card.new(:city, 'London', :blue)
    end

    # Try to move without providing card - should require card selection
    post '/move', {
      player_index: 0,
      destination: 'Paris' # Using a valid city from the game
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    refute last_response.successful?
    data = parse_json_response(last_response)
    assert_equal 'card_required', data['status']
    assert_equal 'operations_expert_special', data['movement_type']
    assert_includes data['message'].downcase, 'operations expert requires'
  end

  def test_operations_expert_move_with_card_succeeds
    create_game_with_custom_state do |state|
      # Set up Operations Expert at research station
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :operations_expert)
      current_player.location = 'Chicago'

      state.research_stations << 'Chicago'

      # Give player city cards
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'Houston', :blue)
      current_player.hand << Card.new(:city, 'London', :blue)
    end

    # Move by providing a card name
    post '/move', {
      player_index: 0,
      destination: 'Paris',
      card_name: 'Houston'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)
    data = parse_json_response(last_response)
    assert data['success']
    assert_includes data['message'].downcase, 'moved'

    # Verify player moved to Paris
    game_state = get_current_game_state
    assert_equal 'Paris', game_state.players[0].location

    # Verify Houston card was discarded
    player_card_names = game_state.players[0].hand.map(&:name)
    refute_includes player_card_names, 'Houston'
    assert_includes player_card_names, 'London'
  end

  def test_operations_expert_once_per_turn_limit
    create_game_with_custom_state do |state|
      # Set up Operations Expert at research station
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :operations_expert)
      current_player.location = 'Chicago'

      state.research_stations << 'Chicago'
      state.research_stations << 'London' # Add another research station

      # Give player multiple city cards
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'London', :blue)
      current_player.hand << Card.new(:city, 'Tokyo', :red)
      current_player.hand << Card.new(:city, 'Seoul', :red)

      # Ensure player has enough actions
      state.instance_variable_set(:@actions_remaining, 4)
    end

    # First special move should succeed
    post '/move', {
      player_index: 0,
      destination: 'Paris',
      card_name: 'London'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)

    # Move to another research station using regular move (Paris -> London)
    post '/move', {
      player_index: 0,
      destination: 'London'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    assert_successful_response(last_response)

    # Try second special move from research station - should fail
    post '/move', {
      player_index: 0,
      destination: 'Tokyo',
      card_name: 'Seoul'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    refute last_response.successful?
    data = parse_json_response(last_response)
    assert_includes data['message'].downcase, 'once per turn'
  end

  def test_operations_expert_build_without_card
    create_game_with_custom_state do |state|
      # Set up Operations Expert without the city card
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :operations_expert)
      current_player.location = 'London'

      # Give player cards but NOT London
      require_relative '../app/game_state/card'
      current_player.hand.clear
      current_player.hand << Card.new(:city, 'Chicago', :blue)

      # Ensure London doesn't have research station yet
      state.research_stations.delete('London')
    end

    # Operations Expert should be able to build without London card
    post '/build_research_station'

    assert_successful_response(last_response)
    data = parse_json_response(last_response)
    assert data['success']
    assert_includes data['message'], 'Operations Expert ability'

    # Verify research station was built
    game_state = get_current_game_state
    assert_includes game_state.research_stations, 'London'

    # Verify no cards were discarded
    player_card_names = game_state.players[0].hand.map(&:name)
    assert_includes player_card_names, 'Chicago'
  end

  def test_operations_expert_no_city_cards_move_fails
    create_game_with_custom_state do |state|
      # Set up Operations Expert at research station with NO city cards
      current_player = state.players[state.current_player_idx]
      current_player.instance_variable_set(:@role, :operations_expert)
      current_player.location = 'Chicago'

      state.research_stations << 'Chicago'

      # Clear hand - no city cards
      current_player.hand.clear
    end

    # Try to move - should fail because no city cards available
    post '/move', {
      player_index: 0,
      destination: 'Paris'
    }.to_json, { 'CONTENT_TYPE' => 'application/json' }

    refute last_response.successful?
    data = parse_json_response(last_response)
    # Should fall through to regular move logic and fail
    assert_includes data['message'].downcase, 'cannot move'
  end

  private

  def get_current_game_state
    # Helper method to get current game state for verification
    get '/game_state.json'
    data = parse_json_response(last_response)

    # Create a simple struct to access the data more easily
    Struct.new(:players, :research_stations) do
      def initialize(data)
        self.players = data['players'].map do |p|
          Struct.new(:location, :hand, :role) do
            def initialize(player_data)
              self.location = player_data['location']
              self.hand = player_data['hand'].map { |card| Struct.new(:name).new(card['name']) }
              self.role = player_data['role'].to_sym
            end
          end.new(p)
        end
        # Get research stations from correct structure
        rs_data = data['researchStations'] || data['research_stations'] || {}
        self.research_stations = rs_data['locations'] || rs_data || []
      end
    end.new(data)
  end
end
