# Test Suite Implementation Plan - Issue #14

## Problem
Create a comprehensive test suite for the JSON API endpoints in the Pandemic board game application.

## Requirements
- Test all API endpoints defined in sinatra.rb
- Use fixtures by storing game state in Redis with randomized key names
- Set Redis key expiry to 5 minutes for tests
- Test all player actions and game mechanics

## API Endpoints to Test

### GET Endpoints
- `GET /` - Root redirect to index.html
- `GET /game_state.json` - Game state retrieval

### POST Endpoints
- `POST /move` - Player movement action
- `POST /treat` - Treat disease action
- `POST /cure_disease` - Cure disease action
- `POST /retrieve` - Retrieve action card (contingency planner)
- `POST /share_knowledge` - Share knowledge between players
- `POST /pass` - Pass turn action
- `POST /draw_cards` - Draw cards at end of turn
- `POST /infect_cities` - Infect cities at end of turn
- `POST /build_research_station` - Build research station
- `POST /discard_cards` - Discard cards for hand limit
- `POST /action_card` - Use action cards (Airlift, One Quiet Night, etc.)
- `POST /restart_game` - Restart game with optional difficulty

## Implementation Strategy

1. **Test Framework Setup**
   - Use Minitest (already in Gemfile)
   - Create test helper with Redis fixture management
   - Implement randomized Redis key generation with 5-minute expiry

2. **Test Structure**
   - Create `test/` directory
   - Implement `test_helper.rb` with Redis fixture utilities
   - Create separate test files for different endpoint categories

3. **Fixture Management**
   - Create method to save game state to Redis with random key
   - Implement cleanup after tests
   - Use different game states for different test scenarios

4. **Test Categories**
   - Basic endpoint accessibility tests
   - Valid request/response format tests
   - Game logic validation tests
   - Error handling tests
   - Edge case tests

5. **Test Data**
   - Create various game state fixtures
   - Test different difficulty levels
   - Test game-over scenarios
   - Test forecast active scenarios

## Files to Create
- `test/test_helper.rb` - Test utilities and Redis fixture management
- `test/test_api_endpoints.rb` - Main API endpoint tests
- `test/test_game_actions.rb` - Game action logic tests
- `test/test_error_handling.rb` - Error scenario tests