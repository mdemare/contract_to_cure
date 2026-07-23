# Invalid Move Validation Flake Postmortem

## What went right

The fix was isolated to move validation for the Operations Expert special move path. `PlayerActions#move` now consistently uses the request's `player_index` and resolved player when checking and discarding city cards, so validation no longer accidentally depends on the current-player instance variables.

A focused regression test covers the previously flaky path: an Operations Expert at a research station with a city card attempts to move to an unknown destination. The endpoint now reliably returns the expected `422` unknown-destination error instead of entering the Operations Expert card-selection branch.

## What went wrong

The move action mixed two player references in the same validation branch. Most move paths used the resolved `player` and `player_index`, but the Operations Expert branch still referenced `current_player` and `@current_player_idx`. That made behavior depend on implicit current-turn state and allowed invalid destinations to be interpreted as a possible special move prompt.

The existing error-handling coverage checked invalid destinations for normal movement, but it did not exercise the Operations Expert-at-research-station branch where the stale references lived.

## Final thoughts

Player-action validation is easier to reason about when each request path uses one player source consistently. The new regression test keeps the invalid-destination contract covered for the role-specific movement branch that previously escaped the general endpoint tests.
