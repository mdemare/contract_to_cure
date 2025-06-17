class SessionsController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:destroy]

  def create
    auth = request.env['omniauth.auth']

    redis = Redis.new(url: ENV['REDIS_URL'] || 'redis://localhost:6379')

    user_key = "google_user:#{auth.uid}"
    user_data = {
      uid: auth.uid,
      email: auth.info.email,
      name: auth.info.name,
      image: auth.info.image,
      provider: auth.provider
    }

    redis.hset(user_key, user_data.map { |k, v| [k.to_s, v.to_s] }.flatten)
    redis.expire(user_key, 30.days.to_i)

    session[:user_id] = auth.uid
    session[:user_email] = auth.info.email
    session[:user_name] = auth.info.name

    Rails.logger.info "User #{auth.info.email} logged in successfully"

    redirect_to root_path, notice: 'Signed in successfully!'
  rescue StandardError => e
    Rails.logger.error "Authentication error: #{e.message}"
    redirect_to root_path, alert: 'Authentication failed'
  end

  def destroy
    user_email = session[:user_email]
    reset_session

    Rails.logger.info "User #{user_email} logged out"

    redirect_to root_path, notice: 'Signed out successfully!'
  end

  def failure
    Rails.logger.error "Authentication failure: #{params[:message]}"
    redirect_to root_path, alert: "Authentication failed: #{params[:message]}"
  end
end
