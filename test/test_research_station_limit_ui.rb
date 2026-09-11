require 'test_helper'

class TestResearchStationLimitUI < Minitest::Test
  def setup
    @action_buttons_js = File.read(File.join(__dir__, '..', 'public', 'js', 'action_buttons.js'))
    @ordinary_player_actions_js = File.read(File.join(__dir__, '..', 'public', 'js', 'ordinary_player_actions.js'))
  end

  def test_build_button_warns_and_disables_when_research_station_limit_is_reached
    assert_match(/stationsAvailable\s*<=\s*0/, @action_buttons_js)
    assert_match(/Maximum number of research stations reached\./, @action_buttons_js)
    assert_match(/button\.title\s*=\s*reason/, @action_buttons_js)
    assert_match(/button\.dataset\.disabledReason\s*=\s*reason/, @action_buttons_js)
  end

  def test_enable_all_buttons_preserves_buttons_with_disabled_reason
    assert_match(/if\s*\(button\.dataset\.disabledReason\)\s*\{\s*return;\s*\}/m, @action_buttons_js)
  end

  def test_build_click_handler_rejects_stale_clicks_at_research_station_limit
    assert_match(/gameState\.researchStations\?\.available\s*<=\s*0/, @ordinary_player_actions_js)
    assert_match(/showInvalidActionMessage\('Maximum number of research stations reached\.'\)/, @ordinary_player_actions_js)
  end
end
