class ApplicationController < ActionController::Base
  require_relative '../game_state'

  protect_from_forgery with: :exception

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
    return @current_user if defined?(@current_user)

    @current_user = user_from_auth_token
    @current_user ||= fallback_user unless @authentication_error_message
    @current_user
  end

  def logged_in?
    !!current_user
  end

  def authenticate_request!
    return if auth_bypass_enabled?
    return if logged_in?

    render json: { status: 'error', message: authentication_error_message }, status: :unauthorized
  end

  def jwt_secret
    ENV.fetch('JWT_SECRET') do
      Rails.application.credentials.jwt_secret
    end
  end

  def user_from_auth_token
    token = request.cookies['auth_token']
    return nil if token.blank?

    decoded_token = JWT.decode(token, jwt_secret, true, algorithm: 'HS256')
    user_data = decoded_token[0]['user']
    if user_data.blank? || user_data['id'].blank?
      @authentication_error_message = 'Invalid authentication token'
      return nil
    end

    {
      uid: user_data['id'].to_s,
      email: user_data['email'],
      name: user_data['name']
    }
  rescue JWT::ExpiredSignature
    @authentication_error_message = 'Authentication token has expired'
    nil
  rescue JWT::DecodeError, NoMethodError
    @authentication_error_message = 'Invalid authentication token'
    nil
  end

  def fallback_user
    if ENV['SKIP_AUTH'] == 'true' || Rails.env.development?
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

  def auth_bypass_enabled?
    return false if ENV['REQUIRE_AUTH'] == 'true'

    ENV['SKIP_AUTH'] == 'true' || Rails.env.development? || Rails.env.test?
  end

  def authentication_error_message
    @authentication_error_message || 'Authentication required'
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
