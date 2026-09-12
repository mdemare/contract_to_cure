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
    player_list = css.match(/\.player-list\s*\{(?<body>[^}]*)\}/m)[:body]
    roster = css.match(/\.player-roster\s*\{(?<body>[^}]*)\}/m)[:body]
    summary = css.match(/\.player-summary\s*\{(?<body>[^}]*)\}/m)[:body]
    hand_details = css.match(/\.player-hand-details\s*\{(?<body>[^}]*)\}/m)[:body]
    hand_preview = css.match(/\.player-hand-preview\s*\{(?<body>[^}]*)\}/m)[:body]
    card_preview = card_css.match(/\.hand-card-preview\s*\{(?<body>[^}]*)\}/m)[:body]

    refute_match(/max-height|overflow-y|display:\s*none/, hand_details)
    assert_match(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, hand_preview)
    assert_match(/white-space:\s*normal/, card_preview)
    refute_match(/overflow:\s*hidden|text-overflow/, card_preview)
    refute_match(/expandedPlayers/, javascript)
    assert_match(/\.player-panel-scroll-hint/, css)
    assert_match(/scrollHeight\s*-\s*playerList\.scrollTop\s*-\s*playerList\.clientHeight/, javascript)
    assert_match(/scrollIntoView\(\{\s*block:\s*'nearest'\s*\}\)/, javascript)

    summary_height = summary[/min-height:\s*(\d+)px/, 1].to_i
    card_height = card_preview[/min-height:\s*(\d+)px/, 1].to_i
    card_gap = hand_preview[/gap:\s*(\d+)px/, 1].to_i
    roster_gap = roster[/gap:\s*(\d+)px/, 1].to_i
    list_padding = player_list[/padding:\s*(\d+)px/, 1].to_i * 2
    hand_padding = 7 # 3px top + 4px bottom
    metadata_height = 18 # 10px hash plus the player-list gap
    player_height = summary_height + 1 + (4 * card_height) + (3 * card_gap) + hand_padding + 2
    total_height = (4 * player_height) + (3 * roster_gap) + list_padding + metadata_height

    assert_operator total_height, :<=, 500
  end
end
