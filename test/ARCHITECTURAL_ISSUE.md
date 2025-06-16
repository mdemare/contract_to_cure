# Architectural Issue Found and Fixed During Testing

## Issue: Game State Not Reloaded from Redis (FIXED)

During test implementation, we discovered that the Sinatra application loads the game state from Redis only once at startup and keeps it in memory. This created several potential issues:

### Problems Found:
1. **Multi-process inconsistency**: If running multiple app instances, changes made by one instance won't be visible to others
2. **Test isolation**: Tests that modify game state in Redis can't test the app's behavior because the app doesn't reload the state
3. **Potential data loss**: If the app crashes, any in-memory changes not yet saved to Redis would be lost

### Evidence:
- The `test_forecast_blocking_other_actions` test sets `forecast_active = true` in Redis
- The app's `before` filter should block actions when forecast is active
- But the test failed because the app still had the old game state in memory

### Solution Implemented:
1. **Reload on each request**: Modified the app to load game state from Redis at the beginning of each request
2. **Stateless design**: The app now clears `@game_state` in the `before` filter, forcing a reload from Redis
3. **Helper method**: Created a `game_state` helper that loads from Redis on demand

### Code Changes:
- Moved game state initialization into a helper method
- Added `@game_state = nil` in the `before` filter to force reload
- Game state is now loaded fresh from Redis for each request

This ensures the app always has the latest game state and works correctly in multi-process environments.