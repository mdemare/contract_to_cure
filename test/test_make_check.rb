require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'open3'

class MakeCheckTest < Minitest::Test
  def setup
    @directory = Dir.mktmpdir('make-check')
    FileUtils.cp(File.expand_path('../Makefile', __dir__), @directory)
    FileUtils.mkdir_p(File.join(@directory, 'test/js'))
    File.write(File.join(@directory, 'test/js/example_test.mjs'), '')
    %w[bundle node].each do |command|
      path = File.join(@directory, command)
      File.write(path, <<~SH)
        #!/bin/sh
        echo "#{command} $*" >> commands.log
        if [ "$FAIL_COMMAND" = "#{command}" ]; then
          echo "#{command}: simulated test failure" >&2
          exit 1
        fi
      SH
      FileUtils.chmod(0755, path)
    end
  end

  def teardown
    FileUtils.remove_entry(@directory)
  end

  def test_runs_both_suites_even_when_check_file_exists
    File.write(File.join(@directory, 'check'), '')
    output, status = run_check

    assert status.success?, output
    assert_equal ['bundle exec rake test', 'node --test test/js/example_test.mjs'], commands
  end

  def test_ruby_failure_is_reported_and_stops_the_target
    output, status = run_check('bundle')

    refute status.success?
    assert_includes output, 'bundle: simulated test failure'
    assert_equal ['bundle exec rake test'], commands
  end

  def test_javascript_failure_is_reported
    output, status = run_check('node')

    refute status.success?
    assert_includes output, 'node: simulated test failure'
    assert_equal ['bundle exec rake test', 'node --test test/js/example_test.mjs'], commands
  end

  private

  def run_check(failure = nil)
    Open3.capture2e(
      { 'PATH' => "#{@directory}:#{ENV.fetch('PATH')}", 'FAIL_COMMAND' => failure,
        'MAKEFLAGS' => nil, 'MFLAGS' => nil, 'MAKELEVEL' => nil },
      'make', 'check', chdir: @directory
    )
  end

  def commands
    File.readlines(File.join(@directory, 'commands.log'), chomp: true)
  end
end
