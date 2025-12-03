# Plan: Ruby Code Check - Issue #79

## Summary
This document outlines the problems found in the Ruby codebase and the plan to fix them.

## Problems Identified

### 1. RuboCop Style Issues (12 offenses found)

#### Security Issues
- **app/game_state.rb:50** - `Security/MarshalLoad`: Using `Marshal.load` is a security risk
  - Location: `load_from_redis` method
  - Also in: test/test_api_endpoints.rb:290, test/test_game_state.rb:72, test/test_game_state.rb:112
  - **Severity: HIGH** - Marshal.load can execute arbitrary code if data is untrusted

#### Naming Conventions
- **app/game_state.rb:242** - `Naming/PredicateMethod`: Method name should end with `?`
  - Method: `discard_player_card_by_name` returns a boolean but doesn't end with `?`

- **app/game_state/end_turn.rb:9** - `Naming/MethodParameterName`: Parameter name `i` is too short
  - Method: `draw_player_card(i)` - should use a more descriptive name like `card_index`

#### Style Issues
- **app/game_state.rb:242** - `Style/OptionalBooleanParameter`: Boolean parameter with default value
  - Method: `discard_player_card_by_name(player_index, card_name, retrieved = false)`
  - Should use keyword arguments: `retrieved: false`

- **app/game_state/action_cards.rb:110, 204** - `Style/EmptyElse`: Redundant `else` clauses (2 instances)
  - Can be removed for cleaner code

- **app/controllers/sessions_controller.rb:37** - `Layout/EmptyLinesAroundClassBody`: Extra empty line at class body end

#### Logic Issues
- **app/game_state/player_actions.rb:40-52** - `Metrics/BlockNesting`: More than 3 levels of block nesting
  - Complex nested conditionals in the `move` method make it hard to read and maintain

- **app/game_state/end_turn_events.rb:10** - `Lint/NonLocalExitFromIterator`: Using `return` from iterator
  - In `draw_cards` method: `return if game_over` inside `times` block
  - Should use `break` or `next` instead

### 2. Logic and Code Quality Issues

#### Inconsistent Error Handling
- **app/game_state/setup.rb:9, 16, 34, 76** - Multiple bare `raise` statements without error messages
  - Makes debugging difficult
  - Should use descriptive error messages

#### Inconsistent Return Values
- **app/game_state.rb:83-86** - `check_action` method returns inconsistent values
  - Returns `nil` on success but an array `[422, {...}]` on error
  - Controllers expect hash format, not array format

#### Potential Nil Reference Issues
- **app/game_state/player_actions.rb:13** - Accessing `current_player.role` without nil check
  - `current_player` might be nil if `current_player_idx` is invalid

#### Method Parameter Validation
- **app/game_state/player_actions.rb:4-72** - `move` method lacks parameter validation
  - No check if `player_index` is valid
  - No check if `destination` city exists before accessing connections

#### Dead Code / Redundant Checks
- **app/game_state/end_turn_events.rb:107-109** - Redundant checks for quarantine specialist and disease eradication
  - Lines 99, 108 duplicate the same checks
  - Lines 102-104, 109 also duplicate checks

### 3. Potential Bugs

#### Card Type Comment Error
- **app/game_state/card.rb:6** - Comment lists `:action` twice
  - Comment: `# :city, :action, :epidemic, :action`
  - Should be: `# :city, :action, :epidemic, :infection` or similar

#### File Path Construction
- **app/game_state/setup.rb:31** - Incorrect use of `File.dirname`
  - `File.dirname(__FILE__, 2)` is not the correct API
  - Should use `File.expand_path` or proper path joining

#### Asymmetric Check Logic
- **app/game_state/setup.rb:50-54** - Iterating over cities inside cities.each is inefficient
  - Nested loop creates O(n²) complexity for what could be O(n)

## Fix Priority

### High Priority (Security & Bugs)
1. Fix `Marshal.load` security issue - replace with safe YAML loading or JSON
2. Fix `check_action` return value inconsistency
3. Fix `File.dirname(__FILE__, 2)` incorrect API usage
4. Add nil checks for `current_player` access
5. Add parameter validation in critical methods

### Medium Priority (Code Quality)
1. Fix `Lint/NonLocalExitFromIterator` - use proper control flow
2. Improve block nesting in `move` method - refactor for readability
3. Add error messages to bare `raise` statements
4. Remove redundant checks in outbreak handling
5. Fix method naming for boolean returns

### Low Priority (Style)
1. Use keyword arguments for boolean parameters
2. Remove empty else clauses
3. Fix parameter names (i -> card_index)
4. Fix comment typo in card.rb
5. Remove extra empty lines

## Implementation Steps

1. **Phase 1: Security & Critical Bugs**
   - Replace Marshal.load with safe deserialization
   - Fix check_action return value
   - Fix File.dirname usage
   - Add parameter validation and nil checks

2. **Phase 2: Logic Improvements**
   - Fix iterator exit pattern
   - Refactor move method for better readability
   - Add descriptive error messages
   - Remove redundant checks

3. **Phase 3: Style Fixes**
   - Run rubocop -A to auto-fix style issues
   - Manually fix remaining issues
   - Update method signatures for keyword arguments

4. **Phase 4: Testing**
   - Run test suite to ensure nothing breaks
   - Add tests for edge cases if needed
   - Verify all fixes work correctly

## Testing Strategy

- Run existing test suite after each phase
- Ensure all tests pass before moving to next phase
- Add specific tests for security fixes if needed
- Test Redis serialization/deserialization thoroughly

## Notes

- The project uses Rails 8.0, Ruby 3.4.4
- Game is a "Contract to Cure" (Pandemic-style board game)
- Redis is used for game state persistence
- JWT authentication is implemented
