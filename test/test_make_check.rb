require 'test_helper'
require 'open3'
require 'tmpdir'
require 'rbconfig'
require 'fileutils'

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

  def test_check_runs_javascript_even_when_check_file_exists
    stdout, stderr, status = run_javascript_check('assert.ok(true)')

    assert status.success?, [stdout, stderr].join("\n")
    assert_includes stdout, 'JavaScript check probe'
  end

  def test_check_propagates_javascript_failures
    stdout, stderr, status = run_javascript_check('assert.fail("JavaScript failure sentinel")')

    refute status.success?, [stdout, stderr].join("\n")
    assert_includes stdout, 'JavaScript failure sentinel'
  end

  private

  def run_javascript_check(assertion)
    root = File.expand_path('..', __dir__)
    Dir.mktmpdir('make-check') do |directory|
      FileUtils.cp(File.join(root, 'Makefile'), directory)
      FileUtils.mkdir_p(File.join(directory, 'test/js'))
      FileUtils.mkdir_p(File.join(directory, 'bin'))
      # Isolate the JavaScript stage; Ruby execution is covered by run_check.
      bundle = File.join(directory, 'bin/bundle')
      File.write(bundle, "#!/bin/sh\nexit 0\n")
      File.chmod(0755, bundle)
      File.write(File.join(directory, 'check'), '')
      File.write(File.join(directory, 'test/js/probe.mjs'), <<~JS)
        import test from 'node:test';
        import assert from 'node:assert/strict';
        test('JavaScript check probe', () => { #{assertion} });
      JS
      Open3.capture3(
        { 'PATH' => "#{directory}/bin:#{ENV.fetch('PATH')}" },
        'make', 'check', chdir: directory
      )
    end
  end

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
