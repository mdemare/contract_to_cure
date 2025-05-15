require 'sinatra'
require 'json'
require_relative 'game_state'
require 'optparse'

# Parse command line options
options = {
  difficulty: :heroic,  # Default to heroic difficulty
  new_game: false       # Default to loading from saved state if available
}

OptionParser.new do |opts|
  opts.banner = "Usage: ruby sinatra.rb [options]"

  opts.on("-d", "--difficulty DIFFICULTY", [:introductory, :normal, :heroic],
          "Set game difficulty (introductory, normal, heroic)") do |d|
    options[:difficulty] = d
  end

  opts.on("-n", "--new", "Start a new game (ignore saved state)") do
    options[:new_game] = true
  end

  opts.on("-h", "--help", "Show this help message") do
    puts opts
    exit
  end
end.parse!

puts "Game Settings:"
puts "  Difficulty: #{options[:difficulty]}"
puts "  New Game: #{options[:new_game]}"

# Serve static files from the 'public' folder
set :public_folder, "/Users/mdemare/iCloud/proj/contract_to_cure/public"

# Initialize game state based on options
if options[:new_game] || !File.exist?('current_game.yaml')
  puts "Starting new game with difficulty: #{options[:difficulty]}"
  game_state = GameState.new(4, options[:difficulty])
else
  puts "Loading game from saved state"
  game_state = GameState.load_from_yaml || GameState.new(4, options[:difficulty])
end

# Serve game state as JSON
get '/game_state.json' do
  content_type :json
  game_state.to_json_state.to_json
end

# Move action endpoint
post '/move' do
  content_type :json
  request.body.rewind
  data = JSON.parse(request.body.read)

  player_index = data['player_index'].to_i
  destination = data['destination']
  card_index = data['card_index']&.to_i

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

# Retrieve action card endpoint for contingency planner
post '/retrieve' do
  content_type :json
  request.body.rewind
  data = JSON.parse(request.body.read)

  action_card_name = data['action_card_name']

  # Validate required parameters
  return { status: 'error', message: 'Missing required parameters' }.to_json unless action_card_name

  # Perform the action and get result
  game_state.retrieve(action_card_name).to_json
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

# Discard card endpoint for hand limit
post '/discard_cards' do
  content_type :json
  request.body.rewind
  data = JSON.parse(request.body.read)

  player_index = data['player_index'].to_i
  card_indices = data['card_indices']

  # Validate required parameters
  return { status: 'error', message: 'Missing required parameters' }.to_json unless player_index.is_a?(Integer) && card_indices.is_a?(Array)

  # Sort indices in descending order to avoid issues when removing from array
  card_indices.sort.reverse.each do |card_index|
    game_state.discard_player_card(player_index, card_index.to_i)
  end

  # Return success response
  { status: 'success', message: "Successfully discarded #{card_indices.length} card(s)" }.to_json
end

# Action Card endpoint
post '/action_card' do
  content_type :json

  request.body.rewind
  data = JSON.parse(request.body.read)

  card_name = data['card']
  city_name = data['city']

  # Validate required parameters
  return { status: 'error', message: 'Missing required parameters' }.to_json unless card_name

  result = case card_name.split(?:).last
  when 'One Quiet Night'
    game_state.quiet_night!
  when 'Government Grant'
    # Add a research station to the specified city without using a city card
    game_state.use_government_grant(city_name)
  # Add cases for other action cards as they are implemented
  else
    { status: 'error', message: "Unknown action card: #{card_name}" }
  end

  result.to_json
end

# Restart game endpoint
post '/restart_game' do
  content_type :json

  request.body.rewind
  data = JSON.parse(request.body.read) rescue {}

  # Extract difficulty level from request if provided, otherwise use current difficulty
  difficulty_level = data['difficulty_level'] ? data['difficulty_level'].to_sym : nil

  # Restart the game and return result
  result = game_state.reset_game(difficulty_level)

  result.to_json
end
