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

  def test_roster_keeps_hands_open_with_one_visible_scroll_affordance
    css = File.read(File.join(__dir__, '..', 'public', 'css', 'player_panel.css'))
    card_css = File.read(File.join(__dir__, '..', 'public', 'css', 'player_cards.css'))
    javascript = File.read(File.join(__dir__, '..', 'public', 'js', 'player_panel.js'))
    hand_details = css.match(/\.player-hand-details\s*\{(?<body>[^}]*)\}/m)[:body]
    card_preview = card_css.match(/\.hand-card-preview\s*\{(?<body>[^}]*)\}/m)[:body]

    refute_match(/max-height|overflow-y|display:\s*none/, hand_details)
    assert_match(/min-height:\s*24px/, card_preview)
    refute_match(/white-space:\s*nowrap|overflow:\s*hidden|text-overflow/, card_preview)
    refute_match(/expandedPlayers/, javascript)
    assert_match(/\.player-panel-scroll-hint/, css)
    assert_match(/scrollHeight\s*-\s*playerList\.scrollTop\s*-\s*playerList\.clientHeight/, javascript)
    assert_match(/scrollIntoView\(\{\s*block:\s*'nearest'\s*\}\)/, javascript)
  end
end
