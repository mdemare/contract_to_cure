# Enforce Hand Limit

## What went right

The backend now treats the seven-card hand limit as a persisted rules state instead of a transient response hint. Draw-card and Share Knowledge flows can enter `pending_discard`, the required player and discard count are saved with the game state, and turn progression is blocked until the excess is resolved. The API also rejects unsolicited, wrong-player, wrong-count, and missing-card discard requests.

Focused API and game-state coverage was added for the main hand-limit paths: draw-card overflow before infection, Share Knowledge overflow, exact discard resolution, invalid discard attempts, and action-card play reducing the hand back under the limit.

## What went wrong

The frontend still primarily reacts to `exceeded_hand_limit` in the immediate response/event stream. Because the backend now persists `pending_hand_limit`, a refresh or reconnect during `pending_discard` needs a separate client recovery path. Follow-up bug `cc-129` and test ticket `cc-131` track that work.

During wrap-up, an existing invalid-destination movement test failed because `NonExistentCity` was accepted by `/move`. That is unrelated to the hand-limit change but should be fixed; follow-up bug `cc-130` tracks it.

## Final thoughts

The rules model is in a better place now: hand-limit pressure is durable, phase-aware, and validated server-side. The remaining risk is mostly client recovery and broader validation hardening, both of which are now captured as follow-up tickets.
