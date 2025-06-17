# PLAN: Fix No Discard Dialog After Draw Cards Phase (Issue #26)

## Problem Analysis

The discard dialog is not appearing after the draw cards phase when a player exceeds the hand limit (7 cards). 

### Root Cause
There's a **data structure mismatch** between backend and frontend:

**Backend** (`app/game_state/end_turn.rb:24-29`):
```ruby
event[:exceeded_hand_limit] = true
event[:discard_count] = current_player.hand.size - 7
event[:player_index] = @game_state.current_player_idx
```

**Frontend** (`public/js/end_turn_events.js:162-168`):
```javascript
const nrCardsToDiscard = eventToAnimate.exceeded_hand_limit.discard_count;
const playerIndex = eventToAnimate.exceeded_hand_limit.player_index;
```

The backend sets `exceeded_hand_limit` as a boolean flag with separate `discard_count` and `player_index` properties, but the frontend expects `exceeded_hand_limit` to be an object containing `discard_count` and `player_index`.

## Solution

Fix the backend to structure the `exceeded_hand_limit` data as an object that matches frontend expectations.

### Changes Required

1. **Backend Fix** (`app/game_state/end_turn.rb`):
   - Change the data structure to nest `discard_count` and `player_index` under `exceeded_hand_limit`

2. **Testing**:
   - Verify hand limit logic works correctly during draw cards phase
   - Test discard dialog appearance and functionality
   - Ensure game continues properly after discarding

### Implementation Plan

1. Modify `app/game_state/end_turn.rb` to structure the exceeded hand limit data correctly
2. Run tests to ensure no regressions
3. Manual testing of the discard flow during end turn

## Expected Outcome

When a player draws cards at the end of their turn and exceeds the 7-card hand limit, a discard dialog should appear allowing them to select cards to discard before the infection phase begins.