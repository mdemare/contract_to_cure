# PLAN: Operation Expert Move Requires Card (#27)

## Issue Description
Operation Expert move should be answered with a request for a card.

## Current Analysis
After analyzing the codebase, I found that the Operation Expert move functionality is **already correctly implemented**:

### Backend Implementation (`app/game_state/player_actions.rb:13-26`)
- When an Operations Expert attempts to move from a research station without providing a card name:
  - Returns `status: 'card_required'` 
  - Returns `movement_type: 'operations_expert_special'`
  - Shows appropriate message: "Operations Expert requires a city card to move from a research station to any city"

### Frontend Implementation (`public/js/player_actions.js:396-429`)
- Handles the `card_required` response by showing a card selection modal
- Allows player to select any city card from their hand
- Re-submits the move request with the selected card name

### Controller Implementation (`app/controllers/game_controller.rb:10-25`)
- Accepts `card_name` parameter in move requests
- Properly handles Operation Expert special moves

## Investigation Results
The functionality appears to be working as designed:

1. ✅ Operation Expert at research station can move to any city by discarding any city card
2. ✅ When no card is provided, system requests card selection
3. ✅ Frontend shows card selection modal for Operations Expert moves
4. ✅ Selected card is properly discarded and move is executed

## Possible Issues to Investigate

### 1. Missing Test Coverage
- No specific tests for Operation Expert move functionality
- Existing tests don't cover the card requirement flow

### 2. Potential Edge Cases
- What happens if Operation Expert has no city cards?
- What happens if Operation Expert is not at a research station?
- Are error messages clear and consistent?

### 3. User Experience
- Is the card selection modal intuitive?
- Are users properly informed about the Operation Expert ability?

## Proposed Solution

Since the core functionality appears to be implemented correctly, I will:

1. **Add comprehensive tests** to verify Operation Expert move behavior
2. **Test edge cases** to ensure proper error handling  
3. **Review user experience** to ensure clarity
4. **Verify the issue** by testing the actual gameplay flow

If no bugs are found, the issue may already be resolved and just needs verification.

## Implementation Plan

1. Write tests for Operation Expert move scenarios
2. Test the functionality manually if possible
3. Check for any subtle bugs or edge cases
4. Document the correct behavior
5. Close issue if functionality is working correctly

## Files to Modify
- `test/test_game_state.rb` - Add Operation Expert move tests
- Potentially fix any discovered edge cases