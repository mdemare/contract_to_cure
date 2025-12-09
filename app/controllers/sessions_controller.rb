class SessionsController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:destroy]

  def new
    # Redirect to auth service
    auth_url = build_auth_url
    redirect_to auth_url, allow_other_host: true
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
    # Return the domain for cookies, allowing them to work across subdomains
    # Use .domain_name format to share cookies across subdomains
    domain_name = ENV.fetch('DOMAIN_NAME', nil)
    domain_name ? ".#{domain_name}" : nil
  end

end
