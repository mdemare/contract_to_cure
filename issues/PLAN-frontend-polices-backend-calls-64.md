# Plan: Frontend Polices Backend Calls (Issue #64)

## Problem
The frontend currently allows players to click on cities even when they have 0 remaining actions during the "draw cards" or "infect cities" phases. This results in unnecessary backend API calls that will fail with validation errors.

## Current Behavior
- City clicks are always processed in `handleCityClick()` function in `/public/js/player_actions.js`
- The function makes backend API calls for movement or treatment without checking:
  - Current game phase
  - Remaining actions
- Backend validates and returns errors, but this creates unnecessary network traffic

## Solution
Add frontend validation in the `handleCityClick` function to prevent backend calls when:
1. `gameStatus.actions_remaining === 0`
2. `gameStatus.phase` is either `"draw_cards"` or `"infect_cities"`

## Implementation Steps

1. **Modify `handleCityClick` function** in `/public/js/player_actions.js`:
   - Add validation at the beginning of the function
   - Check game state for remaining actions and current phase
   - Return early (no-op) if conditions are met
   - This prevents any backend calls from being made

2. **Visual feedback** (optional enhancement):
   - Could add cursor style changes to indicate cities are not clickable
   - Could add tooltip explaining why action is not available

## Code Changes

The main change will be in `/public/js/player_actions.js`:

```javascript
async function handleCityClick(event) {
  // Get the clicked city's name
  const cityName = event.currentTarget.dataset.cityName;
  if (!cityName) { return; }

  // NEW: Check if clicks should be ignored
  const gameState = getCurrentGameState();
  if (gameState.gameStatus.actions_remaining === 0 && 
      (gameState.gameStatus.phase === 'draw_cards' || 
       gameState.gameStatus.phase === 'infect_cities')) {
    // No-op - ignore the click
    return;
  }

  // Get the current player
  const currentPlayer = getCurrentPlayer();
  
  // ... rest of the existing function
}
```

## Testing
1. Verify city clicks work normally when actions > 0
2. Verify city clicks work normally during player_actions phase
3. Verify city clicks are ignored (no backend calls) when:
   - actions_remaining = 0 AND phase = "draw_cards"
   - actions_remaining = 0 AND phase = "infect_cities"
4. Check special modes (governmentGrant, airlift, moveSelectedPlayer) still work correctly

## Benefits
- Reduces unnecessary network traffic
- Prevents error messages from failed backend validations
- Improves user experience by making the UI more responsive to game state