require 'open3'
require 'rbconfig'
require 'test_helper'

# The test environment does not eager load, so file/constant mismatches under
# autoload roots such as app/game_state only surface when production boots.
class TestEagerLoad < Minitest::Test
  def test_application_eager_loads
    Rails.application.eager_load!
  end

  def test_production_environment_boots
    application = File.expand_path('../config/environment', __dir__)
    script = <<~RUBY
      require #{application.inspect}
      puts "eager_load=\#{Rails.application.config.eager_load}"
    RUBY

    stdout, stderr, status = Bundler.with_unbundled_env do
      Open3.capture3(
        {
          'RAILS_ENV' => 'production',
          'SECRET_KEY_BASE' => 'test-secret-key-base',
          'BUNDLE_GEMFILE' => File.expand_path('../Gemfile', __dir__),
          'BUNDLE_LOCKFILE' => File.expand_path('../Gemfile.lock', __dir__)
        },
        RbConfig.ruby,
        '-rbundler/setup',
        '-e',
        script
      )
    end

    assert status.success?, [stdout, stderr].reject(&:empty?).join("\n")
    assert_includes stdout, 'eager_load=true'
  end
end
