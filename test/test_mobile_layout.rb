require 'test_helper'

class TestMobileLayout < Minitest::Test
  def setup
    css_directory = File.join(__dir__, '..', 'public', 'css')
    @interface_css = File.read(File.join(css_directory, 'interface.css'))
    @buttons_css = File.read(File.join(css_directory, 'buttons.css'))
    @player_panel_css = File.read(File.join(css_directory, 'player_panel.css'))
  end

  def test_mobile_interface_uses_full_width_map_and_fixed_height_action_tray
    mobile_css = mobile_rules(@interface_css)

    assert_match(/grid-template-rows:\s*var\(--mobile-status-height\)\s+minmax\(0,\s*1fr\)/, mobile_css)
    assert_match(/\.right-view\s*\{[^}]*width:\s*100%/m, mobile_css)
    assert_match(/\.action-buttons\s*\{[^}]*height:\s*var\(--mobile-action-height\)/m, mobile_css)
    assert_match(/\.action-buttons\s*\{[^}]*overflow-x:\s*auto/m, mobile_css)
    assert_match(/\.action-buttons\s*\{[^}]*flex-wrap:\s*nowrap/m, mobile_css)
  end

  def test_mobile_action_buttons_are_compact_touch_targets
    mobile_css = mobile_rules(@buttons_css)

    assert_match(/\.action-btn\s*\{[^}]*flex:\s*0\s+0\s+72px/m, mobile_css)
    assert_match(/\.action-btn\s*\{[^}]*height:\s*72px/m, mobile_css)
    assert_match(/\.action-btn\.special-action\s*\{[^}]*position:\s*static/m, mobile_css)
  end

  def test_mobile_player_panel_clears_status_and_action_trays
    mobile_css = mobile_rules(@player_panel_css)

    assert_match(/\.player-panel\s*\{[^}]*top:\s*var\(--mobile-status-height\)/m, mobile_css)
    assert_match(/\.player-panel\s*\{[^}]*bottom:\s*var\(--mobile-action-height\)/m, mobile_css)
    assert_match(/\.player-panel\.hidden\s*\{[^}]*translateX\(100%\)/m, mobile_css)
  end

  private

  def mobile_rules(css)
    css.split('@media (max-width: 768px)', 2).last || ''
  end
end
