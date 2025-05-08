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
post '/move' do
  content_type :json
  request.body.rewind
  data = JSON.parse(request.body.read)

  player_index = data['player_index'].to_i
  destination = data['destination']
  card_index = data['card_index']&.to_i

  puts data.inspect

  # Validate required parameters
  return { status: 'error', message: 'Missing required parameters' }.to_json unless player_index && destination

  # Perform the move and get result
  game_state.move(player_index, destination, card_index).to_json
end

# Treat disease endpoint
post '/treat' do
  content_type :json

  game_state.treat_disease.to_json
end

# Treat disease endpoint
post '/cure_disease' do
  content_type :json

  request.body.rewind
  data = JSON.parse(request.body.read)

  color = data['color'].to_sym
  indices = data['card_indices']

  game_state.cure_disease(color, indices).to_json
end

# Share knowledge endpoint
post '/share_knowledge' do
  content_type :json
  request.body.rewind
  data = JSON.parse(request.body.read)

  giving_player_index = data['giving_player_index'].to_i
  receiving_player_index = data['receiving_player_index'].to_i
  city_name = data['city_name']

  # Validate required parameters
  unless giving_player_index && receiving_player_index && city_name
    return { status: 'error', message: 'Missing required parameters' }.to_json
  end

  # Perform the action and get result
  game_state.share_knowledge(giving_player_index, receiving_player_index, city_name).to_json
end

# Build research station endpoint
post '/pass' do
  content_type :json

  # Perform the action and get result
  game_state.pass.to_json
end

# Build research station endpoint
post '/build_research_station' do
  content_type :json

  # Perform the action and get result
  game_state.build_research_station.to_json
end

# Restart game endpoint
post '/restart_game' do
  content_type :json

  request.body.rewind
  data = JSON.parse(request.body.read) rescue {}

  # Extract difficulty level from request if provided, otherwise use current difficulty
  difficulty_level = data['difficulty_level'] ? data['difficulty_level'].to_sym : nil

  # Restart the game and return result
  game_state.reset_game(difficulty_level).to_json
end
