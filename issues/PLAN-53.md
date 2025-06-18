# PLAN-53: Operations Expert Special Move Status Code Fix

## Problem Description
When an Operations Expert attempts a special move from a research station without specifying a card, the backend correctly responds with `{"status": "card_required"}` but incorrectly returns this with a 422 HTTP status code instead of 200. This causes the frontend to potentially not display the card selection dialog properly.

## Root Cause Analysis
1. **Backend Issue**: In `app/game_state/player_actions.rb` (lines 20-26), the Operations Expert special move logic returns `{success: false, status: 'card_required', ...}` when a card is required.

2. **Controller Issue**: In `app/controllers/game_controller.rb` (line 202), the `render_game_result` method treats ANY result with `success: false` as an error and returns it with status 422.

3. **Frontend Expectation**: In `public/js/player_action_utils.js` (lines 93-102), the frontend correctly handles `result.status === 'card_required'` for move operations, expecting it to be a valid response that triggers card selection UI.

## Proposed Solution
Modify the controller's `render_game_result` method to distinguish between actual errors and valid "card_required" responses. When `status: 'card_required'`, return HTTP 200 instead of 422.

## Implementation Plan
1. **Modify `render_game_result` method** in `app/controllers/game_controller.rb`:
   - Check if `result[:status] == 'card_required'`
   - Return HTTP 200 for card_required responses
   - Keep 422 for actual errors (status: 'error', etc.)

2. **Test the fix**:
   - Create/update test case for Operations Expert special move
   - Verify 200 status code is returned for card_required responses
   - Verify 422 is still returned for actual errors

3. **Verify frontend behavior**:
   - Test that card selection dialog appears correctly
   - Ensure no regression in error handling

## Files to Modify
- `app/controllers/game_controller.rb` - Update `render_game_result` method
- `test/test_api_endpoints.rb` - Add/update test cases

## Expected Outcome
- Operations Expert special move will return HTTP 200 with `{"status": "card_required"}`
- Frontend will properly display card selection dialog
- Error responses will still return appropriate 422 status codes
- No regression in existing functionality