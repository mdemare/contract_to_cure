require_relative 'test_helper'
require_relative '../app/game_state'

class TestDiseaseSummary < Minitest::Test
  def setup
    @game = GameState.new(4)
  end

  def test_json_state_includes_cube_counts
    json_state = @game.to_json_state

    # Verify diseaseCubes object exists
    assert json_state[:diseaseCubes], "JSON state should include diseaseCubes"

    # Verify each color has inSupply data
    [:blue, :yellow, :black, :red].each do |color|
      disease_data = json_state[:diseaseCubes][color]
      assert disease_data, "Disease data for #{color} should exist"
      assert disease_data.key?(:inSupply), "#{color} should have inSupply data"
      assert_kind_of Integer, disease_data[:inSupply], "inSupply should be an integer"
      assert disease_data[:inSupply] >= 0, "inSupply should be non-negative"
    end
  end

  def test_json_state_does_not_include_infection_deck_size
    json_state = @game.to_json_state

    # The JSON generator should only include playerDeck size, not infectionDeck size for client
    assert json_state[:decks][:playerDeck], "Should include player deck size"
    refute json_state[:decks].key?(:infectionDeck), "Should not include infection deck size in client JSON"
  end
end
