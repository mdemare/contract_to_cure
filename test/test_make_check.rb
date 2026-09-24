require 'test_helper'
require 'open3'
require 'tmpdir'
require 'rbconfig'

class TestMakeCheck < Minitest::Test
  def test_check_uses_application_bundle_inside_a_foreign_bundle
    stdout, stderr, status = run_check('assert Rails.application.initialized?')

    assert status.success?, [stdout, stderr].join("\n")
    assert_match(/1 runs, 1 assertions, 0 failures, 0 errors/, stdout)
  end

  def test_check_propagates_test_failures
    stdout, stderr, status = run_check('flunk "check failure sentinel"')

    refute status.success?, [stdout, stderr].join("\n")
    assert_includes stdout, 'check failure sentinel'
  end

  private

  def run_check(assertion)
    root = File.expand_path('..', __dir__)
    Dir.mktmpdir('foreign-bundle') do |directory|
      gemfile = File.join(directory, 'Gemfile')
      File.write(gemfile, "source 'https://rubygems.org'\ngem 'rake'\n")
      # Run a real Rails test without recursively invoking this test suite.
      probe = File.join(directory, 'check_probe.rb')
      File.write(probe, <<~RUBY)
        require #{File.join(root, 'test/test_helper').inspect}
        class CheckProbe < Minitest::Test
          def test_application
            #{assertion}
          end
        end
      RUBY

      Bundler.with_unbundled_env do
        Open3.capture3(
          { 'BUNDLE_GEMFILE' => gemfile, 'TEST' => probe },
          'bundle', 'exec', RbConfig.ruby, '-e', 'exec "make", "check"',
          chdir: root
        )
      end
    end
  end
end
