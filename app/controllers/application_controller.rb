class ApplicationController < ActionController::API
  require_relative '../game_state'

  before_action :load_game_state
  before_action :check_forecast_active, except: [:index, :state, :action_card]

  rescue_from JSON::ParserError, with: :handle_invalid_json
  rescue_from StandardError, with: :handle_standard_error

  # Redirect root URL to index.html
  def index
    redirect_to '/index.html'
  end

  private

  def load_game_state
    @game_state = GameState.load_from_redis
    return unless @game_state.nil?

    Rails.logger.info "No saved game found in Redis, starting new game with difficulty: #{Rails.application.config.default_difficulty}"
    @game_state = GameState.new(Rails.application.config.default_players, Rails.application.config.default_difficulty)
  end

  def check_forecast_active
    return unless @game_state.forecast_active

    render json: {
      status: 'error',
      message: 'Cannot perform action while Forecast is active. Please complete the Forecast action first.'
    }, status: 422
  end

  attr_reader :game_state

  def handle_invalid_json
    render json: { status: 'error', message: 'Invalid JSON' }, status: 400
  end

  def handle_standard_error(exception)
    Rails.logger.error "Error: #{exception.message}"
    Rails.logger.error exception.backtrace.join("\n")
    render json: { status: 'error', message: exception.message }, status: 500
  end
end
