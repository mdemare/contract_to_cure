require 'open3'
require 'test_helper'

class TestGameStatusHud < Minitest::Test
  def setup
    root = File.join(__dir__, '..')
    @view = File.read(File.join(root, 'app', 'views', 'application', 'index.html.erb'))
    @css = File.read(File.join(root, 'public', 'css', 'interface.css'))
    @javascript = File.read(File.join(root, 'public', 'js', 'game_status.js'))
  end

  def test_warning_thresholds
    test_file = File.join(__dir__, 'js', 'game_status_test.mjs')
    stdout, stderr, status = Open3.capture3(
      'node',
      '--experimental-default-type=module',
      '--test',
      test_file
    )

    assert status.success?, [stdout, stderr].reject(&:empty?).join("\n")
  end

  def test_actions_and_outbreaks_have_visual_and_exact_status
    assert_match(/class="action-pips" aria-hidden="true"/, @view)
    assert_equal 4, @view.scan(/class="action-pip"/).length
    assert_match(/id="outbreak-meter"[^>]*role="progressbar"/m, @view)
    assert_match(/<strong id="outbreak-counter">0<\/strong><span> \/ 8<\/span>/, @view)
    assert_match(/setAttribute\('aria-label', `\$\{outbreaks\} of \$\{MAX_OUTBREAKS\} outbreaks`\)/, @javascript)
  end

  def test_disease_rows_expose_name_state_supply_and_meter
    assert_match(/class="disease-name"/, @view)
    assert_match(/class="cure-label">Not cured/, @view)
    assert_match(/class="cube-count">24 of 24 cubes/, @view)
    assert_match(/class="cube-meter" role="progressbar"/, @view)
    assert_match(/aria-label="24 of 24 .* disease cubes remaining"/, @view)
  end

  def test_hud_uses_text_and_patterns_in_addition_to_warning_color
    assert_match(/\.risk-label/, @css)
    assert_match(/\.supply-warning/, @css)
    assert_match(/repeating-linear-gradient/, @css)
    assert_match(/dataset\.risk = risk/, @javascript)
  end

  def test_narrow_layout_places_hud_above_full_width_board
    responsive = @css.match(/@media \(max-width: 768px\) \{(?<body>.*)\}\s*\z/m)[:body]

    assert_match(/\.top-view\s*\{[^}]*flex-direction:\s*column/m, responsive)
    assert_match(/\.left-view\s*\{[^}]*width:\s*100%/m, responsive)
    assert_match(/\.right-view\s*\{[^}]*width:\s*100%/m, responsive)
    assert_match(/\.game-status\s*\{[^}]*overflow-x:\s*auto/m, responsive)
  end
end
