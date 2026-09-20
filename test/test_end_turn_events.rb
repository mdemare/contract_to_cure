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

  def test_direct_placement_and_outbreak_retain_medic_behavior_difference
    game_state = create_game_with_custom_state do |state|
      reset_city_cubes(state)
      configure_two_city_outbreak(state)
      state.cures[:blue] = true
      state.disease_cubes[:blue] = 10
      state.players.first.instance_variable_set(:@role, :medic)
      state.players.first.location = 'Houston'
    end

    direct_events = []
    game_state.add_disease_cubes('Houston', :blue, 1, direct_events)

    assert_equal 0, game_state.cities['Houston'].disease_cubes
    assert_equal 10, game_state.disease_cubes[:blue]

    outbreak_events = []
    game_state.cities['Houston'].disease_cubes = 0
    game_state.trigger_outbreak('Chicago', outbreak_events)

    assert_equal 1, game_state.cities['Houston'].disease_cubes
    assert_equal 9, game_state.disease_cubes[:blue]
  end

  def test_direct_placement_and_outbreak_retain_exact_supply_difference
    game_state = create_game_with_custom_state do |state|
      reset_city_cubes(state)
      configure_two_city_outbreak(state)
      state.disease_cubes[:blue] = 1
    end

    direct_events = []
    game_state.add_disease_cubes('Houston', :blue, 1, direct_events)

    assert_equal 1, game_state.cities['Houston'].disease_cubes
    assert_equal 0, game_state.disease_cubes[:blue]
    refute game_state.game_over

    outbreak_events = []
    game_state.cities['Houston'].disease_cubes = 0
    game_state.disease_cubes[:blue] = 1
    game_state.trigger_outbreak('Chicago', outbreak_events)

    assert_equal 2, game_state.cities['Houston'].disease_cubes
    assert_equal 0, game_state.disease_cubes[:blue]
    assert game_state.game_over
    assert_equal :no_cubes, game_state.game_over_reason
  end

  def test_quarantine_and_eradication_protect_both_placement_paths
    game_state = create_game_with_custom_state do |state|
      reset_city_cubes(state)
      configure_two_city_outbreak(state)
      state.players.first.instance_variable_set(:@role, :quarantine_specialist)
      state.players.first.location = 'Houston'
    end

    events = []
    game_state.add_disease_cubes('Houston', :blue, 1, events)
    game_state.trigger_outbreak('Chicago', events)

    assert_equal 0, game_state.cities['Houston'].disease_cubes
    assert_equal 24, game_state.disease_cubes[:blue]

    game_state.players.first.location = 'Wuhan'
    game_state.cures[:blue] = true
    game_state.cities['Houston'].connections.clear
    game_state.add_disease_cubes('Houston', :blue, 1, events)
    game_state.trigger_outbreak('Chicago', events)

    assert_equal 0, game_state.cities['Houston'].disease_cubes
    assert_equal 24, game_state.disease_cubes[:blue]
  end

  def test_chained_outbreaks_do_not_revisit_a_city
    game_state = create_game_with_custom_state do |state|
      reset_city_cubes(state)
      state.cities['Chicago'].connections.replace(['Houston'])
      state.cities['Houston'].connections.replace(['Chicago'])
      state.cities['Chicago'].disease_cubes = 3
      state.cities['Houston'].disease_cubes = 3
      disable_quarantine_specialists(state)
    end

    events = []
    result = game_state.trigger_outbreak('Chicago', events)

    assert_equal [:outbreak, :outbreak], events.map { |event| event[:type] }
    assert_equal 2, game_state.outbreak_count
    assert_equal ['Chicago', 'Houston'], result[:outbreak_chain]
    refute game_state.game_over
  end

  def test_outbreak_game_over_is_propagated_at_outbreak_limit
    game_state = create_game_with_custom_state do |state|
      reset_city_cubes(state)
      state.instance_variable_set(:@outbreak_count, GameStateConfig::MAX_OUTBREAKS - 1)
      state.cities['Chicago'].disease_cubes = 3
      disable_quarantine_specialists(state)
    end

    events = []
    result = game_state.trigger_outbreak('Chicago', events)

    assert_equal({ type: :game_over, reason: :too_many_outbreaks }, result)
    assert game_state.game_over
    assert_equal :too_many_outbreaks, game_state.game_over_reason
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

  def configure_two_city_outbreak(state)
    state.cities['Chicago'].connections.replace(['Houston'])
    state.cities['Houston'].connections.replace(['Chicago'])
    state.cities['Chicago'].disease_cubes = 3
    state.cities['Houston'].disease_cubes = 0
    disable_quarantine_specialists(state)
  end
end
