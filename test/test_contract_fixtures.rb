require_relative 'test_helper'
require_relative 'contract_fixtures'

# Replays every committed API contract fixture in testdata/contract against
# the Rails app. Regenerate them with `bundle exec rake contract:record`.
class TestContractFixtures < TestHelper
  include ContractFixtures

  def setup
    super
    @previous_skip_auth = ENV.delete('SKIP_AUTH')
  end

  def teardown
    restore_env_value('SKIP_AUTH', @previous_skip_auth)
    super
  end

  if ENV['CONTRACT_RECORD'] == '1'
    def test_record_contract_fixtures
      record_contract_fixtures
      assert_equal SCENARIOS.size, Dir.children(SCENARIOS_DIR).size
    end
  else
    def test_fixtures_match_the_scenario_list
      recorded = Dir.children(SCENARIOS_DIR).sort
      assert_equal SCENARIOS.map { |scenario| scenario[:name] }.sort, recorded,
                   'Run `bundle exec rake contract:record` after changing the scenario list'
    end

    def test_committed_states_match_their_builders
      ContractFixtures.build_states.each do |name, yaml|
        assert_equal yaml, read_contract_file(contract_state_path(name)), "states/#{name}.yaml is out of date"
      end
    end

    def test_readme_has_no_test_runner_output
      readme = read_contract_file('README.md')
      refute readme.match?(/^(Run options: --seed|# Running:|Finished in .* runs\/s|\d+ runs, \d+ assertions)/),
             'testdata/contract/README.md contains Minitest output'
    end

    SCENARIOS.each do |scenario|
      define_method("test_contract_#{scenario[:name]}") do
        path = "scenarios/#{scenario[:name]}/scenario.json"
        expected = read_contract_file(path)
        recorded = JSON.parse(expected)

        document, after = run_contract_request(
          name: recorded['name'],
          description: recorded['description'],
          request: recorded['request'],
          save_before: recorded['save_before'],
          concurrent_save: recorded['concurrent_save']
        )

        assert_equal expected, contract_json(document), "#{path} no longer matches the Rails response"
        expected_after = if recorded['save_after'] == 'unchanged'
                           read_contract_file(recorded['save_before'])
                         else
                           read_contract_file(recorded['save_after'])
                         end
        assert_equal expected_after, after, "Redis save after #{scenario[:name]} changed"
      end
    end
  end
end
