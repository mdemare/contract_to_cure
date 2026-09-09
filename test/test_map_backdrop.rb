require 'test_helper'

class TestMapBackdrop < Minitest::Test
  MAP_WIDTH = 1_300
  MAP_HEIGHT = 650

  def setup
    root = File.join(__dir__, '..')
    @css = File.read(File.join(root, 'public', 'css', 'map.css'))
    @javascript = File.read(File.join(root, 'public', 'js', 'map.js'))
    @svg = File.read(File.join(root, 'public', 'world-map.svg'))
  end

  def test_backdrop_uses_the_board_transform_and_wrap_width
    backdrop_append = @javascript.index('mapInner.appendChild(createMapBackdrop())')
    connections_append = @javascript.index('mapInner.appendChild(svgLayer)')

    assert backdrop_append < connections_append, 'backdrop should sit below connections'
    assert_match(/\.map-backdrop\s*\{[^}]*width:\s*3900px/m, @css)
    assert_match(/background-size:\s*1300px 650px/, @css)
    assert_match(/background-repeat:\s*repeat-x/, @css)
  end

  def test_backdrop_is_noninteractive_and_below_game_pieces
    assert_match(/aria-hidden/, @javascript)
    assert_match(/\.map-backdrop\s*\{[^}]*z-index:\s*0/m, @css)
    assert_match(/\.map-backdrop\s*\{[^}]*pointer-events:\s*none/m, @css)
    assert_match(/\.connections-layer\s*\{[^}]*z-index:\s*5/m, @css)
    assert_match(/\.map-inner \.city\s*\{[^}]*z-index:\s*10/m, @css)
  end

  def test_vector_asset_matches_one_board_panel
    svg_root = @svg.match(/<svg\s+(?<attributes>[^>]*)>/)[:attributes]

    assert_match(/width="#{MAP_WIDTH}"/, svg_root)
    assert_match(/height="#{MAP_HEIGHT}"/, svg_root)
    assert_match(/viewBox="0 0 #{MAP_WIDTH} #{MAP_HEIGHT}"/, svg_root)
  end

  def test_vector_uses_recognizable_coastline_data
    assert_match(/Natural Earth 1:110m land/, @svg)
    assert_operator @svg.scan(/\d+,\d+/).length, :>, 1_000
    assert_match(/fill-rule="evenodd"/, @svg)
  end

  def test_constrained_devices_have_a_no_download_fallback
    assert_match(/connection\?\.saveData/, @javascript)
    assert_match(/navigator\.deviceMemory <= 2/, @javascript)
    assert_match(/\.map-backdrop--lightweight\s*\{[^}]*radial-gradient/m, @css)
    assert_match(/prefers-reduced-data:\s*reduce/, @css)
    assert_match(/update:\s*slow/, @css)
  end
end
