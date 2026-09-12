module Authentication
  class InvalidCredentials < StandardError; end

  # Providers are ordered: the first successful identity wins. A rejected
  # credential does not prevent another provider from authenticating the request.
  def self.providers
    Rails.application.config.x.authentication.providers || { 'jwt' => JwtProvider.new }
  end

  def self.authenticate(request)
    error = nil
    providers.each_value do |provider|
      begin
        user = provider.authenticate(request)
        return [user, nil] if user
      rescue InvalidCredentials => exception
        error ||= exception.message
      end
    end
    [nil, error]
  end
end
