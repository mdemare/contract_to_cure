require 'open3'
require 'rbconfig'
require 'test_helper'

class TestDependencyBoot < Minitest::Test
  def test_application_boots_when_ruby_four_json_is_already_activated
    application = File.expand_path('../config/environment', __dir__)
    script = <<~RUBY
      gem 'json', '= 3.0.0'
      require 'json'
      require #{application.inspect}
      decoded = ActiveSupport::JSON.decode('{"booted":true}')
      puts "json=\#{JSON::VERSION} rails=\#{Rails.version} decoded=\#{decoded.fetch('booted')}"
    RUBY

    stdout, stderr, status = Open3.capture3(
      { 'RAILS_ENV' => 'test' },
      RbConfig.ruby,
      '-e',
      script
    )

    assert status.success?, [stdout, stderr].reject(&:empty?).join("\n")
    assert_match(/json=3\.0\.0 rails=8\.1\.3\.1 decoded=true/, stdout)
  end
end
