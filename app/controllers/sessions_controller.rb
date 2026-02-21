class SessionsController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:destroy]

  def new
    # Redirect to auth service
    auth_url = build_auth_url
    redirect_to auth_url, allow_other_host: true
  end

  def destroy
    # Clear the auth_token cookie
    delete_options = cookie_domain ? { domain: cookie_domain } : {}
    cookies.delete(:auth_token, **delete_options)

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
    domain_name = ENV['DOMAIN_NAME']
    return nil if domain_name.blank?

    ".#{domain_name}"
  end
end
