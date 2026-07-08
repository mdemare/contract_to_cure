require_relative 'test_helper'

class TestEndTurnEvents < TestHelper
  def test_add_disease_cubes_allows_exact_supply_placement
    game_state = create_game_with_custom_state do |state|
      reset_city_cubes(state)
      state.disease_cubes[:blue] = 1
      state.cities['Chicago'].disease_cubes = 0
      disable_quarantine_specialists(state)
    end

    events = []
    result = game_state.add_disease_cubes('Chicago', :blue, 1, events)

    assert_nil result
    assert_equal 1, game_state.cities['Chicago'].disease_cubes
    assert_equal 0, game_state.disease_cubes[:blue]
    refute game_state.game_over
    assert_empty events
  end

  def test_add_disease_cubes_subtracts_cube_placed_before_outbreak
    game_state = create_game_with_custom_state do |state|
      reset_city_cubes(state)
      state.disease_cubes[:blue] = 24
      state.cities['Chicago'].disease_cubes = 2
      state.cities['Chicago'].connections.clear
      disable_quarantine_specialists(state)
    end

    events = []
    game_state.add_disease_cubes('Chicago', :blue, 2, events)

    assert_equal 3, game_state.cities['Chicago'].disease_cubes
    assert_equal 23, game_state.disease_cubes[:blue]
    assert_equal 1, game_state.outbreak_count
    assert_equal [:outbreak], events.map { |event| event[:type] }
    refute game_state.game_over
  end

  private

  def reset_city_cubes(state)
    state.cities.each_value { |city| city.disease_cubes = 0 }
    GameStateConfig::COLORS.each do |color|
      state.disease_cubes[color] = GameStateConfig::MAX_DISEASE_CUBES_PER_COLOR
    end
  end

  def disable_quarantine_specialists(state)
    state.players.each do |player|
      player.instance_variable_set(:@role, :medic)
      player.location = 'Wuhan'
    end
  end
end
