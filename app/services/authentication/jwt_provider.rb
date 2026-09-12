module Authentication
  class JwtProvider
    def initialize(cookie_name: 'auth_token', secret: nil, service_url: nil, return_url: nil, cookie_domain: nil)
      @cookie_name = cookie_name
      @secret = secret
      @service_url = service_url
      @return_url = return_url
      @cookie_domain = cookie_domain
    end

    def authenticate(request)
      token = request.cookies[@cookie_name]
      return nil if token.blank?

      secret = @secret || ENV.fetch('JWT_SECRET') { Rails.application.credentials.jwt_secret }
      payload = JWT.decode(token, secret, true, algorithm: 'HS256').first
      user = payload.is_a?(Hash) && payload['user']
      unless user.is_a?(Hash) && user['id'].present?
        raise InvalidCredentials, 'Invalid authentication token'
      end

      { uid: user['id'].to_s, email: user['email'], name: user['name'] }
    rescue JWT::ExpiredSignature
      raise InvalidCredentials, 'Authentication token has expired'
    rescue JWT::DecodeError
      raise InvalidCredentials, 'Invalid authentication token'
    end

    def login_url
      service_url = @service_url || ENV.fetch('AUTH_SERVICE_URL')
      return_url = @return_url || "https://#{ENV.fetch('SUBDOMAIN')}.#{ENV.fetch('DOMAIN_NAME')}"
      "#{service_url.chomp('/')}/login?return_url=#{CGI.escape(return_url)}"
    end

    def logout(cookies)
      domain = @cookie_domain || ENV['DOMAIN_NAME'].presence&.then { |name| ".#{name}" }
      cookies.delete(@cookie_name, **(domain ? { domain: domain } : {}))
    end
  end
end
