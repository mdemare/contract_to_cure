require 'open3'
require 'rbconfig'
require 'test_helper'

class TestDependencyBoot < Minitest::Test
  def test_application_boots_when_json_is_already_activated
    application = File.expand_path('../config/environment', __dir__)
    script = <<~RUBY
      require 'json'
      require #{application.inspect}
      decoded = ActiveSupport::JSON.decode('{"booted":true}')
      puts "json=\#{JSON::VERSION} rails=\#{Rails.version} decoded=\#{decoded.fetch('booted')}"
    RUBY

    stdout, stderr, status = Bundler.with_unbundled_env do
      Open3.capture3(
        { 'RAILS_ENV' => 'test' },
        RbConfig.ruby,
        '-e',
        script
      )
    end

    assert status.success?, [stdout, stderr].reject(&:empty?).join("\n")
    locked_versions = Bundler.locked_gems.specs.to_h { |spec| [spec.name, spec.version] }
    expected = "json=#{locked_versions.fetch('json')} rails=#{locked_versions.fetch('rails')} decoded=true"
    assert_includes stdout, expected
  end
end
