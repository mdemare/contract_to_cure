require 'minitest/autorun'
require 'yaml'

# CI must validate through make check so it gets the pinned bundle and the
# JavaScript suite, which needs Node.js 22+ (cc-288).
class TestCiWorkflow < Minitest::Test
  WORKFLOW = File.expand_path('../.github/workflows/test.yml', __dir__)

  def steps
    YAML.safe_load_file(WORKFLOW).fetch('jobs').values.flat_map { it.fetch('steps', []) }
  end

  def run_commands
    steps.filter_map { it['run'] }.flat_map(&:lines).map(&:strip)
  end

  def test_ci_runs_make_check
    assert_includes run_commands, 'make check'
  end

  def test_ci_does_not_bypass_make_check
    refute(run_commands.any? { it.include?('rake test') }, 'CI must run tests through make check')
  end

  def test_ci_sets_up_node_22_or_newer_before_make_check
    node_index = steps.index { it['uses'].to_s.start_with?('actions/setup-node@') }
    check_index = steps.index { it['run'].to_s.lines.map(&:strip).include?('make check') }
    assert node_index, 'CI must set up Node.js'
    assert check_index, 'CI must run make check'
    assert node_index < check_index, 'Node.js must be set up before make check'

    node_version = steps[node_index].fetch('with', {})['node-version'].to_s
    assert_operator node_version[/\A\d+/].to_i, :>=, 22
  end
end
