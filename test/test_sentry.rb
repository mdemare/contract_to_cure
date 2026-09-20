require_relative 'test_helper'

class TestSentry < TestHelper
  def test_smoke_test_page_has_both_error_controls
    get '/test-sentry'
    assert_successful_response(last_response)
    assert_includes last_response.body, 'Simulate frontend error'
    assert_includes last_response.body, 'Simulate backend error'
  end

  def test_backend_smoke_test_raises_a_reportable_error
    assert_raises(RuntimeError) { post '/test-sentry/backend-error' }
  end

  def test_sentry_initializer_does_not_require_a_dsn
    assert_nil Sentry.configuration.dsn
  end
end
