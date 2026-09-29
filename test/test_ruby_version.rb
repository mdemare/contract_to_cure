require 'test_helper'

class TestRubyVersion < Minitest::Test
  ROOT = File.expand_path('..', __dir__)

  def test_ruby_version_file_pins_an_exact_release
    assert_match(/\A\d+\.\d+\.\d+\n\z/, read('.ruby-version'))
  end

  def test_running_ruby_matches_ruby_version_file
    assert_equal pinned_version, RUBY_VERSION
  end

  def test_gemfile_reads_ruby_version_file
    assert_match(/^ruby file: '\.ruby-version'$/, read('Gemfile'))
  end

  def test_lockfile_records_pinned_ruby
    ruby_section = read('Gemfile.lock')[/^RUBY VERSION\n\s+ruby (\S+)$/, 1]

    assert_equal pinned_version, ruby_section
  end

  def test_lockfile_uses_bundler_shipped_with_pinned_ruby
    bundled_with = Bundler::LockfileParser.bundled_with

    assert_equal Gem::Version.new(Bundler::VERSION).segments.first,
                 Gem::Version.new(bundled_with).segments.first
  end

  def test_docker_image_uses_pinned_ruby
    base_images = read('Dockerfile').scan(/^FROM\s+(\S+)/).flatten

    refute_empty base_images
    base_images.each do |image|
      assert_match(/\Aruby:#{Regexp.escape(pinned_version)}-/, image)
    end
  end

  def test_docker_copies_ruby_version_before_bundle_install
    dockerfile = read('Dockerfile')
    copy_index = dockerfile.index(/^COPY [^\n]*\.ruby-version/)
    install_index = dockerfile.index('bundle install')

    refute_nil copy_index, 'Gemfile reads .ruby-version, so the image must copy it'
    assert_operator copy_index, :<, install_index
  end

  def test_ci_uses_pinned_ruby
    versions = read('.github/workflows/test.yml').scan(/ruby-version:\s*'([^']+)'/).flatten

    refute_empty versions
    assert_equal [pinned_version], versions.uniq
  end

  private

  def pinned_version
    read('.ruby-version').strip
  end

  def read(path)
    File.read(File.join(ROOT, path))
require 'minitest/autorun'

# .ruby-version is the single source of the Ruby version; everything else
# that selects a Ruby or a Bundler must agree with it.
class TestRubyVersion < Minitest::Test
  ROOT = File.expand_path('..', __dir__)

  def ruby_version
    @ruby_version ||= File.read(File.join(ROOT, '.ruby-version')).strip
  end

  def read(path)
    File.read(File.join(ROOT, path))
  end

  def test_running_ruby_matches_ruby_version_file
    assert_equal ruby_version, RUBY_VERSION
  end

  def test_gemfile_reads_ruby_version_file
    assert_match(/^ruby file: ['"]\.ruby-version['"]$/, read('Gemfile'))
  end

  def test_lockfile_records_ruby_version
    locked_ruby = read('Gemfile.lock')[/^RUBY VERSION\n\s+ruby (\d+(?:\.\d+)*)/, 1]
    assert_equal ruby_version, locked_ruby
  end

  # The lockfile must be bundled with the Bundler that ships with the running
  # Ruby; older Bundlers redefine Gem::Platform constants under Ruby 4 (cc-277).
  def test_lockfile_bundled_with_matches_default_bundler
    default_specs = Dir[File.join(Gem.default_specifications_dir, 'bundler-*.gemspec')]
    default_bundler = default_specs.map { |spec| File.basename(spec, '.gemspec').delete_prefix('bundler-') }.max_by { Gem::Version.new(it) }
    bundled_with = read('Gemfile.lock')[/^BUNDLED WITH\n\s+(\S+)/, 1]
    assert_equal default_bundler, bundled_with
  end

  def test_dockerfile_uses_ruby_version
    dockerfile = read('Dockerfile')
    assert_match(/^FROM ruby:#{Regexp.escape(ruby_version)}-slim-bookworm$/, dockerfile)
    ruby_version_copy = dockerfile.index(/^COPY .*\.ruby-version/)
    bundle_install = dockerfile.index('bundle install')
    assert ruby_version_copy, 'Dockerfile must copy .ruby-version'
    assert ruby_version_copy < bundle_install, 'Dockerfile must copy .ruby-version before bundle install'
  end

  def test_ci_uses_ruby_version
    assert_match(/ruby-version: ['"]#{Regexp.escape(ruby_version)}['"]/, read('.github/workflows/test.yml'))
  end
end
