# Game state initialization
Rails.application.configure do
  # Load game state logic
  require Rails.root.join('app', 'game_state')
  
  # Game will use default difficulty (heroic) and load from saved state if available
  # No command-line parsing needed in Rails environment
end
