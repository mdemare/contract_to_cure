class ApplicationController < ActionController::Base
  require_relative '../game_state'

  # Skip CSRF protection for API endpoints
  protect_from_forgery with: :exception, unless: -> { true }

  before_action :load_game_state
  before_action :check_forecast_active, except: [:index, :state, :action_card]

  rescue_from JSON::ParserError, with: :handle_invalid_json
  rescue_from StandardError, with: :handle_standard_error if Rails.env.production?

  helper_method :current_user, :logged_in?

  # Render the main game page
  def index
    render 'index'
  end

  private

  def current_user
    @current_user ||= if !Rails.env.production? && ENV['SKIP_AUTH'] == 'true'
      {
        uid: 'dev_user',
        email: 'dev@example.com',
        name: 'Development User'
      }
    elsif session[:user_id]
      {
        uid: session[:user_id],
        email: session[:user_email],
        name: session[:user_name]
      }
    end
  end

  def logged_in?
    !!current_user
  end

  def require_authentication
    return if logged_in?

    respond_to do |format|
      format.html { redirect_to login_path, alert: 'Please log in to continue' }
      format.json { render json: { error: 'Authentication required' }, status: :unauthorized }
    end
  end

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
