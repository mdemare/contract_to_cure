# Enforce Turn Phases

## What went right

The turn phase model was already explicit in `GameState`, so the API fix could stay narrow: reject end-turn endpoints before mutating state when the game is not in the expected phase. The regression coverage now checks that invalid `/draw_cards` calls return a structured 422 response and leave the persisted phase and action count untouched.

The existing endpoint test helpers made it straightforward to reproduce phase-specific states and verify the Redis-backed game state after failed requests.

## What went wrong

The original coverage focused on skipping infection and replaying draw cards after a successful draw, but it missed the simpler early `/draw_cards` request from `player_actions`. That left one out-of-order entry point without an explicit regression test.

The documentation cards had also drifted toward prior tickets, so the wrap-up needed to restate the current functional and technical expectations for end-turn sequencing.

## Final thoughts

Server-side phase checks are the right boundary for enforcing turn order. The frontend can suppress impossible controls, but every end-turn mutation must still prove the saved game is in the matching phase before it changes cards, infection state, or pending discard state.
