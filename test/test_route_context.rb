require 'open3'
require 'test_helper'

class TestRouteContext < Minitest::Test
  def test_contextual_routes
    stdout, stderr, status = Open3.capture3(
      'node', '--experimental-default-type=module', '--test',
      File.join(__dir__, 'js', 'route_context_test.mjs')
    )
    assert status.success?, [stdout, stderr].reject(&:empty?).join("\n")
  end
end
