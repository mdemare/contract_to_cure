source 'https://rubygems.org'

ruby file: '.ruby-version'

# Rails
gem 'rails', '~> 8.0'

# Boot performance
gem 'bootsnap', require: false

# Core gems
gem 'awesome_print'
gem 'json', '~> 3.0'
gem 'like_1999'
gem 'redis', '~> 5.0'
gem 'connection_pool', '~> 3.0'

# Server gems
gem 'puma', '~> 8.0'
gem 'sentry-rails', '~> 7.0'

# Authentication gems
gem 'jwt'
gem 'dry-schema', '~> 1.14'

# Development gems
group :development do
  gem 'rerun', '~> 0.14.0' # Auto-restart server when files change
end

group :test do
  gem 'minitest'
  gem 'rack-test'
  gem 'rake'
  gem 'mock_redis', '~> 0.55.0'
end
