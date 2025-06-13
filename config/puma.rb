# Puma configuration file
# For more information see: https://puma.io/puma/

# Change to the app directory
directory '/Users/mdemare/projects/contract_to_cure/app'

# Bind to all interfaces on port 4567 (Sinatra default) or 3000 (for Docker)
port_number = ENV['PORT'] || '4567'
bind "0.0.0.0:#{port_number}"

# Number of worker processes
workers 1

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