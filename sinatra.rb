# frozen_string_literal: true

# app.rb
require 'sinatra'
require 'json'
require_relative 'game_state'

# Serve static files from the 'public' folder
set :public_folder, "#{File.dirname(__FILE__)}/public"

game_state = GameState.new(4, :normal)

# Serve game state as JSON
get '/game_state.json' do
  content_type :json
  game_state.to_json_state
end

# Update game state
post '/game_state.json' do
  request.body.rewind
  data = JSON.parse(request.body.read)

  # Save the updated game state
  File.write('game_state.json', JSON.pretty_generate(data))

  # Return success response
  content_type :json
  { status: 'success' }.to_json
end

# Move action endpoint
post '/move_drive_ferry' do
  content_type :json
  request.body.rewind
  data = JSON.parse(request.body.read)

  player_index = data['player_index'].to_i
  destination = data['destination']

  # Validate required parameters
  return { status: 'error', message: 'Missing required parameters' }.to_json unless player_index && destination

  # Perform the move and get result
  game_state.move_drive_ferry(player_index, destination).to_json
end

# Move action endpoint
post '/move_direct_flight' do
  content_type :json
  request.body.rewind
  data = JSON.parse(request.body.read)

  player_index = data['player_index'].to_i
  destination = data['destination']

  # Validate required parameters
  return { status: 'error', message: 'Missing required parameters' }.to_json unless player_index && destination

  # Perform the move and get result
  game_state.move_direct_flight(player_index, destination).to_json
end

# Move action endpoint
post '/treat' do
  content_type :json
  request.body.rewind
  data = JSON.parse(request.body.read)

  player_index = data['player_index'].to_i

  # Validate required parameters
  return { status: 'error', message: 'Missing required parameters' }.to_json unless player_index

  # Perform the move and get result
  game_state.treat_disease(player_index).to_json
end
