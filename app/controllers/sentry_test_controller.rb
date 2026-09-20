class SentryTestController < ApplicationController
  skip_before_action :load_game_state
  skip_before_action :check_forecast_active

  def show
    render :show
  end

  def backend_error
    raise 'Sentry backend test error'
  end
end
