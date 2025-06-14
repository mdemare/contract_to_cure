# Puma configuration file
# For more information see: https://puma.io/puma/

# Set the working directory to the root of the project
directory File.expand_path('..', __dir__)

# Specify the rackup file
rackup 'config.ru'

# Bind to all interfaces on port 4567 (Sinatra default) or 3000 (for Docker)
port_number = ENV['PORT'] || '4567'
bind "tcp://0.0.0.0:#{port_number}"

# Number of worker processes
# Use single mode (0 workers) for development
workers ENV.fetch("WEB_CONCURRENCY") { 0 }

# Minimum and maximum number of threads per worker
threads_count = Integer(ENV['PUMA_THREADS'] || 5)
threads threads_count, threads_count

# Preload the application for better memory usage
preload_app!

# Restart command
restart_command 'bundle exec puma -C config/puma.rb'

# Environment
environment ENV['RACK_ENV'] || 'development'

# Process ID file
pidfile 'tmp/pids/puma.pid'

# State file
state_path 'tmp/pids/puma.state'

# Logging
stdout_redirect 'log/puma.stdout.log', 'log/puma.stderr.log', true

# Create necessary directories
FileUtils.mkdir_p 'tmp/pids'
FileUtils.mkdir_p 'log'
