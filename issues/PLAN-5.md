# Plan for Issue #5: Visibility retrieve button

## Issue Description
The retrieve button is visible when playing as the contingency planner at the end of the turn. It should not be visible during the draw cards and infect cities phases.

## Root Cause
The `updateRetrieveButtonState()` function in `public/js/retrieve_card.js` only checks if:
1. The current player is the contingency planner
2. There are discarded action cards available
3. The player doesn't already have a stored card

It does NOT check the current game phase, so the button remains visible during non-action phases.

## Solution
Add a phase check to the `updateRetrieveButtonState()` function to ensure the retrieve button is only visible during the `player_actions` phase.

## Implementation Steps
1. Modify `public/js/retrieve_card.js` line 36-37 to include phase check:
   ```javascript
   if (currentPlayer && currentPlayer.role === 'contingency_planner' && gameState.gameStatus.phase === 'player_actions') {
   ```

2. This aligns with how other action buttons are handled in `action_buttons.js`, which hide during `draw_cards` and `infect_cities` phases.

## Testing Plan
1. Start a game with a contingency planner
2. Play actions until end of turn
3. Verify retrieve button disappears during draw cards phase
4. Verify retrieve button disappears during infect cities phase
5. Verify retrieve button reappears during next player's action phase (if they are contingency planner)