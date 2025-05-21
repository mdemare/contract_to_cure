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
set :public_folder, "/Users/mdemare/projects/contract_to_cure/public"
set :bind, '0.0.0.0'

# Initialize game state based on options
if options[:new_game] || !File.exist?('current_game.yaml')
  puts "Starting new game with difficulty: #{options[:difficulty]}"
  game_state = GameState.new(4, options[:difficulty])
else
  puts "Loading game from saved state"
  game_state = GameState.load_from_yaml || GameState.new(4, options[:difficulty])
end

before do
  # Skip this check for specific routes:
  # - GET routes (like game_state.json) should remain accessible
  # - The action_card endpoint needs special handling for forecast completion
  pass if request.get? || request.path_info == '/action_card'

  # Check if forecast is active
  if game_state.forecast_active
    content_type :json
    halt 422, { status: 'error', message: 'Cannot perform action while Forecast is active. Please complete the Forecast action first.' }.to_json
  end
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
  card_name = data['card_name']  # Changed from card_index to card_name

  # Validate required parameters
  return [500, { status: 'error', message: 'Missing required parameters' }.to_json] unless player_index && destination

  # Perform the move and get result
  game_state.move(player_index, destination, card_name).to_json
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
  card_names = data['card_names']  # Changed from card_indices to card_names

  game_state.cure_disease(color, card_names).to_json
end

# Retrieve action card endpoint for contingency planner
post '/retrieve' do
  content_type :json
  request.body.rewind
  data = JSON.parse(request.body.read)

  action_card_name = data['action_card_name']

  # Validate required parameters
  return [500, { status: 'error', message: 'Missing required parameters' }.to_json] unless action_card_name

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
    return [500, { status: 'error', message: 'Missing required parameters' }.to_json]
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

post '/draw_cards' do
  # Handle end of turn if no actions remaining
  if game_state.actions_remaining.zero?
    response = game_state.after_action_response(nil, {})
    response[:end_turn_events] = game_state.draw_cards
    response[:game_state] = game_state.to_json_state
    response.to_json
  else
    {"status": "success"}.to_json
  end
end

post '/infect_cities' do
  # Handle end of turn if no actions remaining
  if game_state.actions_remaining.zero?
    response = game_state.after_action_response(nil, {})
    response[:end_turn_events] = game_state.infect_cities
    response[:game_state] = game_state.to_json_state
    response.to_json
  else
    {"status": "success"}.to_json
  end
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
  card_names = data['card_names']  # Changed from card_indices to card_names

  # Validate required parameters
  return [500, { status: 'error', message: 'Missing required parameters' }.to_json] unless player_index.is_a?(Integer) && card_names.is_a?(Array)

  # Discard each card by name
  discarded_count = 0
  card_names.each do |card_name|
    if game_state.discard_player_card_by_name(player_index, card_name)
      discarded_count += 1
    end
  end

  game_state.save_game_state

  # Return success response
  { status: 'success', message: "Successfully discarded #{discarded_count} card(s)" }.to_json
end

post '/action_card' do
  content_type :json

  request.body.rewind
  data = JSON.parse(request.body.read)

  card_name = data['card']
  city_name = data['city']

  # Validate required parameters
  return { status: 'error', message: 'Missing required parameters' }.to_json unless card_name

  # Special handling for Forecast
  if game_state.forecast_active
    # Only allow Forecast with card_order when forecast is active
    if card_name == 'Forecast' && data['card_order']
      return game_state.apply_forecast(data['card_order']).to_json
    else
      return { status: 'error', message: 'Cannot perform action while Forecast is active. Please complete the Forecast action first.' }.to_json
    end
  end

  # Normal action card processing when forecast is not active
  result = case card_name
  when 'Airlift'
    game_state.use_airlift(data['player_index'].to_i, city_name)
  when 'One Quiet Night'
    game_state.quiet_night!
  when 'Resilient Population'
    # Remove a card from the infection discard pile by city name
    city_name = data['city']
    game_state.use_resilient_population(city_name)
  when 'Government Grant'
    # Add a research station to the specified city without using a city card
    game_state.use_government_grant(city_name)
  when 'Forecast'
    # Initial Forecast call
    game_state.use_forecast
  # Add cases for other action cards as they are implemented
  else
    [500, { status: 'error', message: "Unknown action card: #{card_name}" }]
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
