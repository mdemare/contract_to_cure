# Architectural Issue Found and Fixed During Testing

## Issue: Game State Not Reloaded from Redis (FIXED)

During test implementation, we discovered that the original Sinatra application loaded the game state from Redis only once at startup and kept it in memory. This created several potential issues:

### Problems Found:
1. **Multi-process inconsistency**: If running multiple app instances, changes made by one instance won't be visible to others
2. **Test isolation**: Tests that modify game state in Redis can't test the app's behavior because the app doesn't reload the state
3. **Potential data loss**: If the app crashes, any in-memory changes not yet saved to Redis would be lost

### Evidence:
- The `test_forecast_blocking_other_actions` test set `forecast_active = true` in Redis
- The app's `before` filter should have blocked actions when forecast was active
- But the test failed because the app still had the old game state in memory

### Solution Implemented:
1. **Reload on each request**: The app loads game state from Redis at the beginning of each request
2. **Stateless design**: No game state is kept in memory between requests

### Current Implementation (Go backend):
The Rails backend that followed kept this design (`load_game_state` plus an `around_action` atomic update), and the Go backend that replaced it (cut over in cc-427, Rails removed in cc-428) does the same:
- `gameHandler` in `src/web/game.go` runs every game request inside `store.AtomicUpdate`, which reads the save from Redis, and `game.Load` decodes it (or deals a new game when there is none)
- The commit uses WATCH/MULTI, so a request whose save changed in the meantime gets a 409 instead of overwriting it
- `TestForecastPersistsAcrossRequests` in `src/web/api_test.go` covers the original failure: a Forecast written to Redis blocks the next request

This ensures the app always has the latest game state and works correctly in multi-process environments.
