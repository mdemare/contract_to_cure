# Single-stage production build
FROM ruby:3.4-slim

# Install dependencies
RUN apt-get update -qq && apt-get install -y \
  build-essential \
  libpq-dev \
  libyaml-dev \
  curl \
  redis-tools \
  sqlite3 \
  libsqlite3-dev \
  && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 rails

WORKDIR /app

# Copy Gemfile first for better caching
COPY Gemfile Gemfile.lock ./

# Install gems
RUN bundle config set --local without 'development test' && \
    bundle install --jobs 4

# Change ownership to rails user
RUN chown -R rails:rails /usr/local/bundle

# Copy the rest of the application
COPY . .

# Change ownership to rails user
RUN chown -R rails:rails /app

# Switch to non-root user
USER rails

EXPOSE 3000
