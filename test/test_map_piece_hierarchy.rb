require 'open3'
require 'test_helper'

class TestMapPieceHierarchy < Minitest::Test
  def setup
    @root = File.join(__dir__, '..')
    @css = File.read(File.join(@root, 'public', 'css', 'map.css'))
  end

  def test_dense_map_piece_rendering
    test_file = File.join(__dir__, 'js', 'map_piece_hierarchy_test.mjs')
    stdout, stderr, status = Open3.capture3(
      'node',
      '--experimental-default-type=module',
      '--test',
      test_file
    )

    assert status.success?, [stdout, stderr].reject(&:empty?).join("\n")
  end

  def test_city_hit_target_and_piece_layers_are_explicit
    city = @css.match(/\.map-inner \.city\s*\{(?<body>[^}]*)\}/m)[:body]
    pawns = @css.match(/\.pawns\s*\{(?<body>[^}]*)\}/m)[:body]
    cubes = @css.match(/\.map-inner \.city \.cubes\s*\{(?<body>[^}]*)\}/m)[:body]
    label = @css.match(/\.map-inner \.city-label\s*\{(?<body>[^}]*)\}/m)[:body]
    connections = @css.match(/\.connections-layer\s*\{(?<body>[^}]*)\}/m)[:body]

    assert_match(/width:\s*44px/, city)
    assert_match(/height:\s*44px/, city)
    assert_match(/z-index:\s*10/, city)
    assert_match(/z-index:\s*5/, connections)
    assert_match(/display:\s*flex/, pawns)
    assert_match(/gap:\s*2px/, pawns)
    assert_match(/z-index:\s*35/, pawns)
    assert_match(/display:\s*grid/, cubes)
    assert_match(/grid-template-columns:\s*repeat\(2, 9px\)/, cubes)
    assert_match(/gap:\s*2px/, cubes)
    assert_match(/z-index:\s*25/, cubes)
    assert_match(/z-index:\s*15/, label)
    assert_match(/background-color:\s*#f8fbff/, label)
    assert_match(/\.city\.is-current-city \.dot::after/, @css)
    assert_match(/\.pawn\.is-current-pawn::after/, @css)
  end

  def test_research_stations_use_rounded_square_city_markers
    station_marker = @css.match(/\.map-inner \.city\.has-station \.dot,\s*\.map-inner \.city\.has-station\.is-current-city \.dot::after\s*\{(?<body>[^}]*)\}/m)[:body]

    assert_match(/border-radius:\s*3px/, station_marker)
    refute_match(/\.research-station\s*\{/, @css)
  end
end
