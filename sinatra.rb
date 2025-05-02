# app.rb
require 'sinatra'
require 'json'
require_relative 'game_state'

# Serve static files from the 'public' folder
set :public_folder, File.dirname(__FILE__) + '/public'

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
  { status: "success" }.to_json
end
