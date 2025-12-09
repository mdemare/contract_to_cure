# Plan: Ruby Code Check - Bug Fixes and Improvements

## Issue Summary
Comprehensive code review to identify and fix bugs and other problems in the Ruby codebase.

## Findings

### Critical Bugs

1. **app/game_state/end_turn_events.rb:10** - Non-local exit from iterator
   - **Location**: `draw_cards` method
   - **Issue**: Using `return` inside a block (`2.times do |i|`) which causes non-local exit
   - **Impact**: This can cause unexpected behavior when trying to exit from within the iterator
   - **Fix**: Use `next` or refactor to avoid return from block

2. **app/game_state/player_actions.rb:13** - Logic error with `current_player`
   - **Location**: `move` method line 13
   - **Issue**: References `current_player.role` but should check if it matches the player being moved
   - **Impact**: Operations Expert special move is checking the wrong player
   - **Fix**: Should check `player.role` not `current_player.role` since we're moving `player`

3. **app/game_state/player_actions.rb:19** - Using wrong player variable
   - **Location**: Same `move` method
   - **Issue**: Uses `current_player.city_cards` instead of `player.city_cards`
   - **Impact**: Operations Expert move checks wrong player's cards
   - **Fix**: Change to `player.city_cards`

4. **app/game_state/end_turn_events.rb:162** - Potential cube count underflow
   - **Location**: `add_disease_cubes` method
   - **Issue**: Line checks `if count >= disease_cubes[color]` but then adds cubes anyway
   - **Impact**: Could cause negative cube counts in supply
   - **Fix**: Need to ensure proper bounds checking

5. **app/game_state/end_turn_events.rb:172** - Incorrect cube calculation
   - **Location**: `add_disease_cubes` method line 172
   - **Issue**: `disease_cubes[color] -= 3 - city.disease_cubes` is wrong
   - **Impact**: Incorrect number of cubes removed from supply
   - **Fix**: Should calculate the actual cubes added, not assume 3

### Security Issues

6. **Security/MarshalLoad warnings** (3 locations)
   - **Locations**:
     - app/game_state.rb:50
     - test/test_api_endpoints.rb:290
     - test/test_game_state.rb:72, 112
   - **Issue**: Using `Marshal.load` which can lead to remote code execution
   - **Impact**: Security vulnerability if untrusted data is loaded
   - **Fix**: Use safer serialization (already has YAML fallback, should remove Marshal entirely)

### Code Quality Issues

7. **app/game_state.rb:242** - Non-idiomatic predicate method
   - **Location**: `discard_player_card_by_name` method
   - **Issue**: Method returns boolean but doesn't end with `?`
   - **Impact**: Confusing API design
   - **Fix**: Either rename to `discard_player_card_by_name?` or change return type

8. **app/game_state.rb:242** - Optional boolean parameter
   - **Location**: Same method
   - **Issue**: Uses `retrieved = false` instead of keyword argument
   - **Impact**: Less readable at call sites
   - **Fix**: Change to `retrieved: false`

9. **app/game_state/action_cards.rb:110, 204** - Redundant else clauses
   - **Location**: `use_resilient_population` and `use_government_grant` methods
   - **Issue**: Empty else clauses that add no value
   - **Impact**: Code clutter
   - **Fix**: Remove the else clauses

10. **app/game_state/end_turn.rb:9** - Short parameter name
    - **Location**: `draw_player_card` method
    - **Issue**: Parameter named `i` instead of descriptive name
    - **Impact**: Reduced code readability
    - **Fix**: Rename to `card_index` or similar

11. **app/game_state/player_actions.rb:40** - Deep nesting
    - **Location**: `move` method
    - **Issue**: More than 3 levels of block nesting
    - **Impact**: Reduced readability
    - **Fix**: Refactor to reduce nesting (extract methods)

12. **app/controllers/sessions_controller.rb:37** - Extra empty line
    - **Location**: End of SessionsController class
    - **Issue**: Extra empty line at class body end
    - **Impact**: Style inconsistency
    - **Fix**: Remove empty line (autocorrectable)

### Potential Logic Issues

13. **app/game_state.rb:83** - Confusing check_action method
    - **Location**: `check_action` method
    - **Issue**: Returns nil when phase IS 'player_actions', returns error array otherwise
    - **Impact**: Non-intuitive return values, easy to misuse
    - **Fix**: Clarify logic or add better documentation

14. **app/game_state/player_actions.rb:36-72** - Complex move logic
    - **Location**: `move` method
    - **Issue**: Very complex conditional logic that's hard to follow
    - **Impact**: Difficult to maintain, potential for bugs
    - **Fix**: Extract into smaller, well-named helper methods

15. **app/game_state/card.rb:6** - Duplicate comment
    - **Location**: Card class initialization
    - **Issue**: Comment says `:action` twice: `:city, :action, :epidemic, :action`
    - **Impact**: Confusing documentation
    - **Fix**: Correct to `:city, :action, :epidemic, :infection`

## Implementation Plan

### Phase 1: Critical Bug Fixes (Priority: HIGH)
1. Fix non-local exit from iterator in end_turn_events.rb
2. Fix Operations Expert move logic to check correct player
3. Fix cube counting logic in add_disease_cubes
4. Remove Marshal.load usage for security

### Phase 2: Code Quality Improvements (Priority: MEDIUM)
1. Run `rubocop -A` to auto-fix style issues
2. Fix remaining rubocop violations manually
3. Refactor complex move method
4. Improve parameter naming and method signatures

### Phase 3: Testing (Priority: HIGH)
1. Run existing test suite to verify fixes
2. Add specific tests for bug fixes if needed
3. Verify game logic works correctly

### Phase 4: Documentation
1. Update comments where needed
2. Ensure all fixes are documented in commit messages

## Risk Assessment
- **Low Risk**: Style fixes, renaming
- **Medium Risk**: Refactoring complex methods
- **High Risk**: Cube counting logic, iterator fixes (need careful testing)

## Success Criteria
1. All tests pass
2. No critical rubocop violations remain
3. Security issues resolved
4. Game logic bugs fixed and verified
