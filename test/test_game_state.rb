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
      test_card = Card.new('Test City', :city, :blue)
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

    # Verify backup was created
    assert @original_game_state, "Original game state should be backed up"

    # Modify the state
    create_game_with_custom_state do |state|
      state.instance_variable_set(:@outbreak_count, 5)
    end

    # Verify current state is modified
    current_data = @redis.get('contract-to-cure/current-game')
    current_state = YAML.load(current_data, permitted_classes: [GameState, Player, Card, City])
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
    deserialized_game = YAML.load(serialized_data, permitted_classes: [GameState, Player, Card, City])

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
end
