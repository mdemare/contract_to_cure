require 'test_helper'

class TestCurrentPlayerLayout < Minitest::Test
  def setup
    @css_file = File.read(File.join(__dir__, '..', 'public', 'css', 'current_player.css'))
  end

  def test_current_player_participates_in_desktop_action_bar_layout
    desktop_rule = @css_file.match(/\.current-player\s*\{(?<body>[^}]*)\}/m)[:body]

    assert_match(/position:\s*static/, desktop_rule,
                 'Current player should reserve space in the desktop action bar')
    assert_match(/flex:\s*0\s+0\s+auto/, desktop_rule,
                 'Current player should keep a stable width beside action buttons')
    refute_match(/position:\s*fixed/, desktop_rule,
                 'Fixed desktop positioning can overlap the move button')
  end

  def test_mobile_current_player_keeps_compact_fixed_position
    mobile_rule = @css_file.match(/@media\s*\(max-width:\s*768px\)\s*\{.*?\.current-player\s*\{(?<body>[^}]*)\}/m)[:body]

    assert_match(/position:\s*fixed/, mobile_rule,
                 'Mobile current player can remain detached from the wrapped action buttons')
    assert_match(/bottom:\s*80px/, mobile_rule)
  end
end
