require_relative 'test_helper'

class TestSentry < TestHelper
  def test_smoke_test_page_has_both_error_controls
    previous_dsn = ENV.delete('SENTRY_DSN')

    get '/test-sentry'
    assert_successful_response(last_response)
    assert_includes last_response.body, 'Simulate frontend error'
    assert_includes last_response.body, 'Simulate backend error'
    assert_includes last_response.body, 'Sentry is not configured because SENTRY_DSN is not set.'
  ensure
    restore_env_value('SENTRY_DSN', previous_dsn)
  end

  def test_smoke_test_page_loads_frontend_sentry_when_configured
    previous_dsn = ENV['SENTRY_DSN']
    ENV['SENTRY_DSN'] = 'https://public@example.ingest.sentry.io/123'

    get '/test-sentry'

    assert_successful_response(last_response)
    assert_includes last_response.body, 'name="sentry-dsn"'
    assert_includes last_response.body, '/js/error_reporting.js'
    assert_includes last_response.body, 'browser.sentry-cdn.com'
  ensure
    restore_env_value('SENTRY_DSN', previous_dsn)
  end

  def test_backend_smoke_test_explicitly_captures_a_reportable_error
    captured_error = nil
    original_capture_exception = Sentry.method(:capture_exception)
    Sentry.define_singleton_method(:capture_exception) do |error, *, **|
      captured_error ||= error
      nil
    end

    post '/test-sentry/backend-error'

    assert_equal 500, last_response.status
    assert_instance_of RuntimeError, captured_error
    assert_equal 'Sentry backend test error', captured_error.message
    assert_equal({
      'error' => 'Sentry backend test error',
      'sentry_event_id' => nil
    }, parse_json_response(last_response))
  ensure
    Sentry.define_singleton_method(:capture_exception, original_capture_exception) if original_capture_exception
  end

  def test_sentry_initializer_does_not_require_a_dsn
    assert_nil Sentry.configuration.dsn
  end
end
