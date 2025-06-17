Rails.application.config.middleware.use OmniAuth::Builder do
  provider :google_oauth2,
           ENV.fetch('GOOGLE_CLIENT_ID', nil),
           ENV.fetch('GOOGLE_CLIENT_SECRET', nil),
           {
             scope: 'email,profile',
             prompt: 'select_account',
             image_aspect_ratio: 'square',
             image_size: 200,
             access_type: 'online',
             callback_path: '/auth/google_oauth2/callback'
           }
end

OmniAuth.config.allowed_request_methods = [:post, :get]
