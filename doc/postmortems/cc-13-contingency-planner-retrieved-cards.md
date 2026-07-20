# Contingency Planner Retrieved Cards Postmortem

## What went right

The fix stayed narrowly focused on the lifecycle of action cards retrieved by the Contingency Planner. The implementation now keeps the retrieved marker with the actual card object, serializes that marker only when needed, and rehydrates cards through one helper path so hands and decks behave consistently after API state round trips.

Regression coverage was added at both the model and API levels. The API test exercises the user-visible flow: retrieve an action card from the discard pile, play it, and verify that it does not return to the discard pile.

## What went wrong

The original flow lost retrieved-card state while rebuilding cards from serialized hashes. That made the action-card discard path treat retrieved cards like normal player cards after a save/load boundary.

The card model also allowed arbitrary values for the retrieved flag, which made it easier for persistence bugs to hide behind truthy or falsey coercion.

## Final thoughts

This bug came from card metadata living outside the normal card identity assumptions. Keeping that state on the card object and validating it makes the special Contingency Planner rule explicit, while preserving the existing discard behavior for normal action cards.
