# Plan for Issue #19: Operation Expert Move Tests

## Issue Summary
Write tests for the Operation Expert move ability. The Operations Expert can move from a research station to any city by discarding any city card, once per turn, when they are in a city with a station and have at least 1 city card.

## Current Implementation Analysis
Based on codebase analysis, the Operations Expert functionality is already implemented:

### Backend Implementation (`app/game_state/player_actions.rb`)
- Lines 13-26: Operations Expert special move logic
- Logic checks if player is Operations Expert, at a research station, and has city cards
- Handles card selection flow with `card_required` response
- Enforces once-per-turn limitation via `operations_expert_move_used` flag

### Frontend Implementation (`public/js/player_actions.js`)
- Lines 396-429: Operations Expert move UI handling
- Integrates with card selection modal system

## Missing Tests
Current test coverage in `test/test_api_endpoints.rb` includes basic movement tests but lacks specific Operations Expert move scenarios.

## Test Plan

### Test Cases to Implement

1. **Valid Operations Expert Move**
   - Setup: Operations Expert at research station with city cards
   - Action: Move to distant city with card discard
   - Verify: Player moves, card discarded, flag set

2. **Card Selection Flow**
   - Setup: Operations Expert at research station with multiple city cards
   - Action: Attempt move without specifying card
   - Verify: Returns `card_required` with movement_type

3. **Once Per Turn Limitation**
   - Setup: Operations Expert after using special move
   - Action: Attempt second special move in same turn
   - Verify: Move rejected with appropriate error

4. **Prerequisite Validation**
   - Test: Non-Operations Expert cannot use special move
   - Test: Operations Expert not at research station cannot use special move
   - Test: Operations Expert with no city cards cannot use special move

5. **Integration with Normal Moves**
   - Verify Operations Expert can still use standard movement types
   - Verify special move doesn't interfere with other abilities

### Implementation Strategy

1. **Add test methods to `test/test_api_endpoints.rb`**
   - `test_operations_expert_special_move_valid`
   - `test_operations_expert_special_move_card_selection`
   - `test_operations_expert_once_per_turn`
   - `test_operations_expert_prerequisites`
   - `test_operations_expert_integration`

2. **Use existing test infrastructure**
   - Leverage `create_test_game_state` helper
   - Follow existing test patterns from movement tests
   - Use similar setup to research station building tests

3. **Test data setup**
   - Create game state with Operations Expert player
   - Place player at city with research station
   - Give player city cards for move options
   - Verify initial state before each test

## Files to Modify
- `test/test_api_endpoints.rb` - Add Operations Expert move test methods

## Success Criteria
- All new tests pass
- Existing tests continue to pass
- Code coverage includes all Operations Expert move scenarios
- Tests validate both happy path and error conditions