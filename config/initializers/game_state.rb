# Game state initialization
Rails.application.configure do
  # Load game state logic
  require Rails.root.join('app', 'game_state')

  # Parse command line options for game configuration
  options = {
    difficulty: Rails.application.config.default_difficulty,
    new_game: false
  }

  # Only parse command line arguments when running the server directly
  if defined?(Rails::Server)
    require 'optparse'

    OptionParser.new do |opts|
      opts.banner = "Usage: rails server [options]"

      opts.on("-d", "--difficulty DIFFICULTY", [:introductory, :normal, :heroic],
              "Set game difficulty (introductory, normal, heroic)") do |d|
        options[:difficulty] = d
        Rails.application.config.default_difficulty = d
      end

      opts.on("-n", "--new", "Start a new game (ignore saved state)") do
        options[:new_game] = true
      end

      opts.on("-h", "--help", "Show this help message") do
        puts opts
        exit
      end
    end.parse!(ARGV)

    puts "Game Settings:"
    puts "  Difficulty: #{options[:difficulty]}"
    puts "  New Game: #{options[:new_game]}"

    # Initialize game state based on options if new game requested
    if options[:new_game]
      puts "Starting new game with difficulty: #{options[:difficulty]}"
      game_state = GameState.new(Rails.application.config.default_players, options[:difficulty])
      game_state.save_game_state
    end
  end
end
