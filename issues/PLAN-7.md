# Fix Final Events Issue #7

## Problem
When game-over conditions are triggered during end-of-turn event processing, the game over dialog appears immediately. Instead, all end-of-turn events should be processed first, followed by a special "Game Over" event that triggers the dialog.

## Current Behavior
- End-turn events are processed in `draw_cards()` and `infect_cities()` phases
- Game-over conditions are checked immediately when detected:
  - No player cards: `app/game_state/end_turn.rb:draw_player_card()`
  - Too many outbreaks: `app/game_state/end_turn_events.rb:trigger_outbreak()`
  - No disease cubes: `app/game_state/end_turn_events.rb:add_disease_cubes()`
- When game-over is detected, `game_over!(reason)` is called which immediately sets the game state

## Desired Behavior
1. Continue processing all end-of-turn events even when game-over conditions are detected
2. Queue a special "Game Over" event to be processed last
3. Show the game over dialog only when the "Game Over" event is processed

## Implementation Plan

### Backend Changes (Ruby)

1. **Modify game_over! method in `app/game_state.rb`**:
   - Instead of immediately setting game over, set a flag to defer game over
   - Add method to create final game over event

2. **Update end-turn event methods**:
   - In `app/game_state/end_turn.rb`: Continue processing after game-over conditions
   - In `app/game_state/end_turn_events.rb`: Continue processing after game-over conditions
   - Queue game-over events instead of immediately triggering

3. **Add finalization logic**:
   - After all end-turn events are processed, check if game-over was deferred
   - Add the final "Game Over" event to the event list

### Frontend Changes (JavaScript)

1. **Update `public/js/end_turn_events.js`**:
   - Handle the new "Game Over" event type
   - Process it last in the event sequence

2. **Update `public/js/game_over.js`**:
   - Ensure game over dialog only triggers on the special event
   - Maintain existing game over dialog functionality

## Files to Modify
- `app/game_state.rb`
- `app/game_state/end_turn.rb`
- `app/game_state/end_turn_events.rb`
- `public/js/end_turn_events.js`
- `public/js/game_over.js`

## Testing Strategy
- Test all three game-over conditions during end-turn processing
- Verify events continue processing after game-over conditions are met
- Confirm game over dialog appears only after all events are processed
- Ensure existing game functionality remains intact