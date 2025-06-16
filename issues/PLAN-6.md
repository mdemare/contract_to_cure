# Plan to Fix Issue #6: Discard After Gift

## Problem
After giving a card to a player with 7 cards, the discard dialog appears. After choosing a card to discard, an API call is made, but the card is not actually discarded.

## Root Cause
The JavaScript code in `select_cards.js` is sending `card_indices` to the `/discard_cards` API endpoint, but the Ruby backend expects `card_names`.

## Solution
Fix the API call in `select_cards.js` to send card names instead of card indices.

### Files to Modify
1. `public/js/select_cards.js` - Lines 315-328 in the `handleHandLimitCheck` method

### Changes Required
- Convert selected card indices to card names before sending to API
- Change the API request from `card_indices: selectedIndices` to `card_names: selectedCardNames`

### Implementation Steps
1. In the `handleHandLimitCheck` method, map selected indices to card names using the player's current hand
2. Send the card names array to the `/discard_cards` endpoint
3. Test the fix by triggering the discard scenario

## Testing Plan
1. Start a game with multiple players
2. Use share knowledge to give a card to a player who already has 6 cards
3. Verify the discard dialog appears
4. Select a card to discard
5. Confirm the card is actually removed from the player's hand