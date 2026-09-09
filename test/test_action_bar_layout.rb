require 'test_helper'

class TestActionBarLayout < Minitest::Test
  def setup
    root = File.join(__dir__, '..')
    @interface_css = File.read(File.join(root, 'public', 'css', 'interface.css'))
    @buttons_css = File.read(File.join(root, 'public', 'css', 'buttons.css'))
    @panel_css = File.read(File.join(root, 'public', 'css', 'player_panel.css'))
    @javascript = File.read(File.join(root, 'public', 'js', 'action_buttons.js'))
    @view = File.read(File.join(root, 'app', 'views', 'application', 'index.html.erb'))
  end

  def test_board_uses_height_left_by_content_driven_action_bar
    top_view = @interface_css.match(/\.top-view\s*\{(?<body>[^}]*)\}/m)[:body]
    action_bar = @interface_css.match(/\.action-buttons\s*\{(?<body>[^}]*)\}/m)[:body]

    assert_match(/flex:\s*1\s+1\s+auto/, top_view)
    assert_match(/min-height:\s*0/, top_view)
    refute_match(/height:\s*80vh/, top_view)
    assert_match(/min-height:\s*0/, action_bar)
    refute_match(/height:\s*20vh/, action_bar)
  end

  def test_current_player_actions_and_hand_have_separate_layout_areas
    assert_match(/grid-template-areas:[^;]*"current actions"[^;]*"hand hand"/m, @interface_css)
    assert_match(/\.player-hand-container\s*\{[^}]*position:\s*static/m, @interface_css)
    assert_match(/<div class="phase-actions" aria-label="Available actions">/, @view)
  end

  def test_phase_and_narrow_screen_layouts_remain_compact_and_touch_friendly
    assert_match(/actionBar\.dataset\.phase\s*=\s*phase/, @javascript)
    assert_match(/data-phase="draw_cards"/, @buttons_css)
    assert_match(/data-phase="infect_cities"/, @buttons_css)
    assert_match(/\.action-btn\s*\{[^}]*min-height:\s*72px/m, @buttons_css)
    assert_match(/@media\s*\(max-width:\s*768px\)[^{]*\{.*?\.action-btn\s*\{[^}]*min-height:\s*64px/m, @buttons_css)
    assert_match(/\.phase-actions\s*\{[^}]*overflow-x:\s*auto/m, @interface_css)
  end

  def test_draw_cards_button_uses_its_content_width
    draw_cards = @buttons_css.match(
      /\.action-buttons\[data-phase="draw_cards"\] \.draw-cards\s*\{(?<body>[^}]*)\}/m
    )[:body]

    assert_match(/width:\s*fit-content/, draw_cards)
    assert_match(/min-width:\s*0/, draw_cards)
    assert_match(/max-width:\s*100%/, draw_cards)
    refute_match(/min-width:\s*132px/, draw_cards)
  end

  def test_player_drawer_tracks_the_measured_action_bar_height
    assert_match(/ResizeObserver/, @javascript)
    assert_match(/--action-bar-height/, @javascript)
    assert_match(/bottom:\s*var\(--action-bar-height/, @panel_css)
  end
end
