require_relative 'test_helper'
require 'puma/configuration'

class PumaConfigurationTest < ActiveSupport::TestCase
  def test_uses_single_mode_when_web_concurrency_is_set
    previous_web_concurrency = ENV['WEB_CONCURRENCY']
    ENV['WEB_CONCURRENCY'] = '4'

    configuration = Puma::Configuration.new
    configuration.clamp

    assert_equal 0, configuration.options[:workers]
  ensure
    if previous_web_concurrency.nil?
      ENV.delete('WEB_CONCURRENCY')
    else
      ENV['WEB_CONCURRENCY'] = previous_web_concurrency
    end
  end
end
