# Plan for Issue #2: End of Turn Actions

## Issue Summary
Action cards should be playable during the end of turn phases (draw cards and infect cities phases), but currently the Action Cards button is being hidden.

## Root Cause Analysis
1. **Type Mismatch Bug**: In `public/js/action_buttons.js` line 108, the code checks for `card.type === 'event'` but the actual card type is `'action'` (as defined in `action_cards.js`).
2. **Phase-Based Visibility**: The Action Cards button is being hidden during non-player_actions phases due to the incorrect type check, which always returns false.

## Solution Plan

### 1. Fix the card type check in action_buttons.js
- Change line 108 from `card.type === 'event'` to `card.type === 'action'`
- This will ensure the Action Cards button is shown when players have action cards in their hand

### 2. Verify the button visibility logic
- The existing logic already attempts to keep the Action Cards button visible during all phases (see comment on line 105)
- Once the type check is fixed, the button should remain visible during draw_cards and infect_cities phases

### 3. Test the fix
- Verify that the Action Cards button appears when players have action cards
- Confirm it remains visible during all game phases (player_actions, draw_cards, infect_cities)
- Test that action cards can be played during end of turn phases

## Files to Modify
- `public/js/action_buttons.js` - Fix the card type check on line 108

## Expected Outcome
After this fix, players will be able to see and use the Action Cards button during the draw cards and infect cities phases, allowing them to play action cards at any point during the game.