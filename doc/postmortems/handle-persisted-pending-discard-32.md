# Handle Persisted Pending Discard

## What went right

The frontend now recovers when the saved game state is already in `pending_discard`.
Loading a state with `gameStatus.pending_hand_limit` opens the discard prompt for the
required player even when the browser did not receive the original overflow response.

The prompt path is keyed so repeated state refreshes do not stack duplicate discard
dialogs. Normal player actions are also suppressed while the pending discard is
unresolved, while action cards remain reachable for the cases where rules allow them
to be played during the discard window.

## What went wrong

This bug existed because the earlier client flow relied too heavily on transient API
response fields such as `exceeded_hand_limit`. Once hand-limit overflow became durable
backend state, refresh and reconnect behavior needed an explicit persisted-state
recovery path.

The change touches asynchronous frontend behavior and modal prompting, which is hard
to validate completely with the existing automated coverage. Follow-up test ticket
`cc-132` tracks browser/integration coverage for refresh recovery, duplicate-prompt
prevention, blocked normal actions, and allowed pending-discard action-card use.

## Final thoughts

The frontend now matches the backend rules model more closely: `pending_discard` is a
real phase the UI can enter from saved state, not just a momentary response handler.
The remaining risk is mostly around regressions in prompt timing and interaction
blocking, so targeted automated UI coverage is the next useful hardening step.
