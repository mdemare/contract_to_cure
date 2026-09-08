require 'open3'
require 'test_helper'

class TestPlayerRoster < Minitest::Test
  def test_maximum_roster_with_large_hands
    test_file = File.join(__dir__, 'js', 'player_roster_test.mjs')
    stdout, stderr, status = Open3.capture3(
      'node',
      '--experimental-default-type=module',
      '--test',
      test_file
    )

    assert status.success?, [stdout, stderr].reject(&:empty?).join("\n")
  end

  def test_roster_has_bounded_hand_and_visible_scroll_affordance
    css = File.read(File.join(__dir__, '..', 'public', 'css', 'player_panel.css'))
    javascript = File.read(File.join(__dir__, '..', 'public', 'js', 'player_panel.js'))

    assert_match(/\.player-hand-details\s*\{[^}]*max-height:[^;}]+;[^}]*overflow-y:\s*auto/m, css)
    assert_match(/\.player-panel-scroll-hint/, css)
    assert_match(/scrollHeight\s*-\s*playerList\.scrollTop\s*-\s*playerList\.clientHeight/, javascript)
    assert_match(/scrollIntoView\(\{\s*block:\s*'nearest'\s*\}\)/, javascript)
  end
end
