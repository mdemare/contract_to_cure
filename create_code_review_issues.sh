#!/bin/bash
# Script to create Beads issues for code review findings

# Check if bd command is available
if ! command -v bd &> /dev/null; then
    echo "Error: bd command not found. Please install Beads first:"
    echo "curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash"
    exit 1
fi

echo "Creating code review issues..."

# High Priority Issues

bd create "Fix CSRF protection vulnerability in ApplicationController" \
    --priority high \
    --body "CSRF protection is completely disabled in application_controller.rb:5 with 'unless: -> { true }'. This is a critical security vulnerability. Remove the unless clause or implement proper API authentication."

bd create "Fix player_index validation that fails for index 0" \
    --priority high \
    --body "In game_controller.rb:18, the validation 'unless player_index && destination' will fail when player_index is 0 because 0 is falsy in Ruby. Use 'unless player_index.nil? || destination.nil?' instead."

bd create "Add descriptive error messages to all bare raises" \
    --priority high \
    --body "Multiple files contain 'raise unless' statements without error messages. Files affected: game_state.rb:347, setup.rb:9,16,34,76. Replace with descriptive ArgumentError messages."

bd create "Refactor complex outbreak chain logic" \
    --priority high \
    --body "The trigger_outbreak method in end_turn_events.rb:75-148 is overly complex with multiple early returns and nested conditions. Refactor into smaller, testable methods and extract game over checks."

# Medium Priority Issues

bd create "Remove hardcoded development email" \
    --priority medium \
    --body "The email 'merloen@gmail.com' is hardcoded in application_controller.rb:37. Use environment variables or configuration files instead."

bd create "Standardize error handling and logging" \
    --priority medium \
    --body "Error handling uses 'puts' in some places (game_state.rb:65-69) instead of Rails.logger. Standardize logging throughout the application."

bd create "Separate HTTP concerns from GameState model" \
    --priority medium \
    --body "The check_action method in game_state.rb:82-86 returns HTTP status codes, mixing controller concerns into the model. Refactor to return simple boolean or error objects."

bd create "Review YAML serialization security" \
    --priority medium \
    --body "YAML.load with permitted_classes in game_state.rb:52 could still be vulnerable. Consider using JSON for serialization or ensure all edge cases are handled."

bd create "Fix inconsistent return values in infect_city" \
    --priority medium \
    --body "The infect_city method in end_turn.rb:44 returns nil explicitly in some cases and implicitly in others. Be consistent with return values."

# Low Priority Issues

bd create "Extract hand limit magic number to constant" \
    --priority low \
    --body "Hand limit of 7 is hardcoded in multiple places: end_turn_events.rb:24, player_actions.rb:149,219. Add HAND_LIMIT constant to GameStateConfig."

bd create "Fix deprecated File.dirname usage" \
    --priority low \
    --body "setup.rb:31 uses 'File.dirname(__FILE__, 2)' which is deprecated. Use 'File.expand_path' or Rails path helpers instead."

bd create "Remove debug puts statement from production code" \
    --priority low \
    --body "end_turn.rb:29 contains 'puts event.inspect' which should not be in production code. Remove or replace with proper logging."

bd create "Remove or complete TODO comment" \
    --priority low \
    --body "end_turn_events.rb:78 has a TODO comment with no description. Either complete the TODO or remove it if not needed."

bd create "Consolidate duplicate quarantine specialist checks" \
    --priority low \
    --body "end_turn_events.rb:99-109 has duplicate checks for quarantine specialist protection and cured diseases. Consolidate the early return checks."

bd create "Add documentation to complex methods" \
    --priority low \
    --body "Complex methods like trigger_outbreak, add_disease_cubes, and load_state_from_hash lack documentation. Add YARD or RDoc comments explaining parameters, return values, and side effects."

bd create "Improve variable naming in setup.rb" \
    --priority low \
    --body "setup.rb uses abbreviation 'cc' for connected_city which is not descriptive. Use full variable names for better readability."

bd create "Refactor complex conditional in add_disease_cubes" \
    --priority low \
    --body "The add_disease_cubes method in end_turn_events.rb:162-179 has complex nested conditionals. Extract some conditions into well-named private methods."

echo ""
echo "✓ All code review issues created successfully!"
echo ""
echo "To view issues, run: bd list"
