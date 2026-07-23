# Player Action Phase Error Shape Postmortem

## What went right

The fix stayed focused on the player-action endpoints that share the same phase guard. `GameState#check_action` now returns a plain error hash, and `GameController` renders that error with a 422 status through one helper path. This keeps the API response shape consistent with the rest of the error handling code.

Regression coverage was added across all protected player-action endpoints. The test drives each endpoint outside the `player_actions` phase and verifies that the response is a JSON object with the expected `status` and `message`, rather than a nested or encoded status/body tuple.

## What went wrong

The original guard mixed controller concerns into game-state logic by returning a Rack-style status/body pair with an already encoded JSON string. The controller then rendered that pair as JSON, which produced the wrong response shape for clients.

The duplicated endpoint guard made the issue easy to repeat across endpoints. Every protected action had its own inline render call, so there was no single place that made the intended response contract obvious.

## Final thoughts

Keeping game-state validation results as structured Ruby data and leaving HTTP rendering to the controller gives the API a clearer boundary. The shared helper also makes future player-action phase checks less likely to drift endpoint by endpoint.
