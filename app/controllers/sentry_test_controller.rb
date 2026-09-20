class SentryTestController < ApplicationController
  skip_before_action :load_game_state
  skip_before_action :check_forecast_active

  def show
    render :show
  end

  def backend_error
    error = RuntimeError.new('Sentry backend test error')
    error.set_backtrace(caller)
    event = Sentry.capture_exception(error)
    Sentry.get_current_client&.flush if event

    render json: {
      error: error.message,
      sentry_event_id: event&.event_id
    }, status: :internal_server_error
  end
end
