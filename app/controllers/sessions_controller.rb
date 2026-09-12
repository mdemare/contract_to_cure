class SessionsController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:destroy]

  def new
    providers = Authentication.providers
    provider_name = params[:provider].presence || providers.keys.first
    provider = providers[provider_name]
    return render plain: 'Unknown authentication provider', status: :bad_request unless provider

    redirect_to provider.login_url, allow_other_host: true
  end

  def destroy
    Authentication.providers.each_value { |provider| provider.logout(cookies) }

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

end
