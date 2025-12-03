# Plan: Code Quality Check - Issue #77

## Summary
Comprehensive code quality analysis of Ruby code in the project, identifying style issues, potential bugs, security concerns, and code smells.

## Problems Identified

### Critical Issues

#### 1. **Inconsistent player_index usage in move method** (app/game_state/player_actions.rb:36-69)
- **Severity**: HIGH - Potential Logic Bug
- **Location**: `app/game_state/player_actions.rb:36-69`
- **Issue**: The `move` method receives `player_index` as a parameter but uses `@current_player_idx` for card checks, creating inconsistency
- **Problem**: Lines 36-45 check `has_city_card?(@current_player_idx, ...)` and `discard_player_card_by_name(@current_player_idx, ...)` while lines 65-69 use `player_index`
- **Impact**: This could allow the dispatcher to move other players using the current player's cards instead of the moved player's cards
- **Fix**: Use consistent `player_index` throughout the method

#### 2. **Security: Marshal.load usage** (app/game_state.rb:50)
- **Severity**: HIGH - Security Issue
- **Locations**:
  - `app/game_state.rb:50`
  - `test/test_api_endpoints.rb:290`
  - `test/test_game_state.rb:72, 112`
- **Issue**: Using `Marshal.load` on potentially untrusted data
- **Impact**: Can lead to arbitrary code execution if malicious data is provided
- **Fix**: Use safer serialization (YAML with permitted classes is already implemented as fallback)

#### 3. **Bare raise statements without error messages** (app/game_state/setup.rb:9, 16, 76, 34, 47, 52)
- **Severity**: MEDIUM - Poor Error Handling
- **Locations**: `app/game_state/setup.rb:9, 16, 76` and lines 34, 47, 52
- **Issue**: Multiple `raise unless` statements without descriptive error messages
- **Impact**: Makes debugging difficult when these assertions fail
- **Fix**: Add descriptive error messages to all raise statements

#### 4. **Bare raise in medic_ability method** (app/game_state.rb:347)
- **Severity**: MEDIUM - Poor Error Handling
- **Location**: `app/game_state.rb:347`
- **Issue**: `raise unless requested_player.is_a?(Player)` without error message
- **Impact**: Unclear error when method is called incorrectly
- **Fix**: Add descriptive error message

### Style and Convention Issues (Rubocop)

#### 5. **Extra empty line at class body end** (app/controllers/sessions_controller.rb:37)
- **Severity**: LOW - Style
- **Auto-correctable**: Yes
- **Fix**: Remove extra blank line

#### 6. **Redundant else-clauses** (app/game_state/action_cards.rb:110, 204)
- **Severity**: LOW - Style
- **Locations**: `app/game_state/action_cards.rb:110, 204`
- **Issue**: Empty else clauses that serve no purpose
- **Fix**: Remove redundant `else nil` statements

#### 7. **Method parameter name too short** (app/game_state/end_turn.rb:9)
- **Severity**: LOW - Naming Convention
- **Location**: `app/game_state/end_turn.rb:9` - parameter `i`
- **Issue**: Parameter name must be at least 3 characters
- **Fix**: Rename `i` to more descriptive name like `card_num` or `draw_index`

#### 8. **Predicate method naming** (app/game_state.rb:242)
- **Severity**: LOW - Naming Convention
- **Location**: `app/game_state.rb:242`
- **Issue**: Method `discard_player_card_by_name` returns boolean but doesn't end with `?`
- **Note**: This is acceptable as the method also has side effects, not just a predicate

#### 9. **Optional boolean parameter** (app/game_state.rb:242)
- **Severity**: LOW - API Design
- **Location**: `app/game_state.rb:242`
- **Issue**: Method has `retrieved = false` parameter
- **Fix**: Consider using keyword argument: `retrieved: false`

#### 10. **Non-local exit from iterator** (app/game_state/end_turn_events.rb:10)
- **Severity**: MEDIUM - Code Smell
- **Location**: `app/game_state/end_turn_events.rb:10`
- **Issue**: Using `return` inside `.times` block
- **Impact**: Can lead to unexpected control flow
- **Fix**: Use `break` or restructure code

#### 11. **Excessive block nesting** (app/game_state/player_actions.rb:40)
- **Severity**: MEDIUM - Code Complexity
- **Location**: `app/game_state/player_actions.rb:40`
- **Issue**: More than 3 levels of block nesting
- **Impact**: Reduces readability and maintainability
- **Fix**: Extract nested logic into separate methods

### Code Quality Issues

#### 12. **Debug output left in production code** (app/game_state/end_turn.rb:29)
- **Severity**: LOW - Code Cleanliness
- **Location**: `app/game_state/end_turn.rb:29`
- **Issue**: `puts event.inspect` statement
- **Impact**: Unwanted console output in production
- **Fix**: Remove or replace with proper logging using Rails.logger

#### 13. **TODO comment** (app/game_state/end_turn.rb:78)
- **Severity**: INFO
- **Location**: `app/game_state/end_turn.rb:78`
- **Issue**: `# TODO` comment suggests incomplete work
- **Action**: Review if TODO is still needed or can be completed

#### 14. **Duplicate color check in trigger_outbreak** (app/game_state/end_turn_events.rb:107-109)
- **Severity**: LOW - Code Duplication
- **Location**: `app/game_state/end_turn_events.rb:107-109`
- **Issue**: Color check and quarantine specialist check appear twice
- **Fix**: Remove duplicate conditions

## Implementation Plan

### Phase 1: Critical Fixes
1. Fix inconsistent player_index usage in move method
2. Add error messages to all bare raise statements
3. Fix non-local exit from iterator

### Phase 2: Security and Best Practices
1. Remove or document Marshal.load usage in tests
2. Fix excessive block nesting in player_actions.rb
3. Remove debug puts statement

### Phase 3: Style Fixes
1. Run `rubocop -A` to auto-fix correctable issues
2. Manually fix remaining rubocop offenses
3. Remove redundant else clauses
4. Rename short parameter names

### Phase 4: Code Cleanup
1. Review and address TODO comment
2. Remove duplicate conditions
3. Consider refactoring complex methods

## Testing Strategy
1. Run existing test suite after each fix
2. Verify no behavioral changes for style fixes
3. Test move method thoroughly with dispatcher role
4. Ensure game state persistence still works correctly

## Files to Modify
- `app/game_state/player_actions.rb` - Fix player_index inconsistency, block nesting
- `app/game_state/setup.rb` - Add error messages to raise statements
- `app/game_state.rb` - Add error message to medic_ability raise
- `app/game_state/action_cards.rb` - Remove redundant else clauses
- `app/game_state/end_turn.rb` - Rename parameter, remove puts
- `app/game_state/end_turn_events.rb` - Fix non-local exit, remove duplicates
- `app/controllers/sessions_controller.rb` - Remove extra blank line

## Success Criteria
- All rubocop offenses resolved
- All tests passing
- No behavioral changes to game logic
- Improved code readability and maintainability
- Security concerns documented or addressed
