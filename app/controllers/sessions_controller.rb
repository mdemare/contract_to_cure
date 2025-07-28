class SessionsController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:destroy]

  def new
    # Redirect to auth service
    auth_url = build_auth_url
    redirect_to auth_url, allow_other_host: true
  end

  def create
    auth = request.env['omniauth.auth']

    # Store user info in session
    session[:user_id] = auth.uid
    session[:user_email] = auth.info.email
    session[:user_name] = auth.info.name

    # Store in Redis if needed (for test compatibility)
    if defined?(Redis) && redis_available?
      redis = Redis.new(url: ENV['REDIS_URL'] || 'redis://localhost:6379')
      user_key = "#{auth.provider}_user:#{auth.uid}"
      redis.hset(user_key, 'email', auth.info.email)
      redis.hset(user_key, 'name', auth.info.name)
      redis.hset(user_key, 'image', auth.info.image) if auth.info.image
    end

    redirect_to root_path
  end

  def destroy
    # Clear the auth_token cookie
    cookies.delete(:auth_token, domain: cookie_domain)

    # Clear session for non-JWT auth
    session[:user_id] = nil
    session[:user_email] = nil
    session[:user_name] = nil

    redirect_to root_path, notice: 'Successfully logged out!'
  end

  def failure
    Rails.logger.error "Authentication failure: #{params[:message]}"
    redirect_to root_path, alert: "Authentication failed: #{params[:message]}"
  end

  private

  def build_auth_url
    auth_service_url = ENV.fetch('AUTH_SERVICE_URL')
    subdomain = ENV.fetch('SUBDOMAIN')
    domain_name = ENV.fetch('DOMAIN_NAME')
    return_url = "https://#{subdomain}.#{domain_name}"

    "#{auth_service_url}/login?return_url=#{CGI.escape(return_url)}"
  end

  def cookie_domain
    return nil if Rails.env.test? || Rails.env.development?

    ".#{ENV.fetch('DOMAIN_NAME', 'example.com')}"
  end

  def redis_available?
    true
  rescue
    false
  end
end
