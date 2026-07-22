# Enforce End-Turn Phases

## What went right

The fix stayed focused on the two server endpoints that advance end-turn state. `draw_cards` now only runs during the draw-cards phase, and `infect_cities` now only runs during the infect-cities phase. This preserves the intended sequence without changing the broader action flow.

Regression coverage was added around both failure modes: skipping directly to infection before drawing player cards, and replaying the draw-card endpoint after the phase has already advanced. The tests also verify that rejected calls leave the persisted game state unchanged.

## What went wrong

The phase field already existed in the end-turn model, but it was not exposed through `GameState` accessors and the API endpoints did not check it before mutating state. That meant a client or repeated request could execute end-turn steps out of order.

The earlier endpoint tests only covered successful calls, so they did not catch invalid sequencing or replay attempts.

## Final thoughts

Server-side phase enforcement is now the source of truth for end-turn sequencing. The UI can still guide users through the expected flow, but duplicate or out-of-order API calls are rejected before they can draw extra cards, skip draw resolution, or advance infection early.
