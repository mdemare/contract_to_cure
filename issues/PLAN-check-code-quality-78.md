# Plan: Fix Ruby Code Quality Issues

## Summary
This plan addresses code quality issues found in the Ruby codebase through RuboCop analysis and manual code review.

## Issues Found

### 1. Security Issues

#### 1.1 Marshal.load Usage (Security/MarshalLoad)
**Severity:** CRITICAL
**Location:**
- `app/game_state.rb:50`
- `test/test_api_endpoints.rb:290`
- `test/test_game_state.rb:72`
- `test/test_game_state.rb:112`

**Problem:** `Marshal.load` is a security vulnerability as it can execute arbitrary code if the data source is untrusted. This is particularly dangerous when loading data from Redis.

**Fix:** Since the code already has YAML fallback, we should:
- Remove the Marshal.load usage entirely
- Use only YAML serialization for Redis storage
- Update tests to use YAML instead of Marshal

#### 1.2 CSRF Protection Disabled Globally (application_controller.rb:5)
**Severity:** HIGH
**Location:** `app/controllers/application_controller.rb:5`

**Problem:** CSRF protection is completely disabled with `unless: -> { true }`, which means ALL endpoints are vulnerable to CSRF attacks, not just API endpoints.

**Fix:** Be more selective about which endpoints skip CSRF protection.

### 2. Code Style Issues

#### 2.1 Extra Empty Line (Layout/EmptyLinesAroundClassBody)
**Severity:** LOW
**Location:** `app/controllers/sessions_controller.rb:37`

**Problem:** Extra empty line at end of class body.

**Fix:** Automatically fixable with `rubocop -A`.

#### 2.2 Redundant else Clauses (Style/EmptyElse)
**Severity:** LOW
**Location:**
- `app/game_state/action_cards.rb:110`
- `app/game_state/action_cards.rb:204`

**Problem:** Empty `else` clauses that just return `nil` are redundant.

**Fix:** Remove the `else` clause since Ruby methods return `nil` by default.

#### 2.3 Optional Boolean Parameter (Style/OptionalBooleanParameter)
**Severity:** MEDIUM
**Location:** `app/game_state.rb:242`

**Problem:** Method `discard_player_card_by_name` uses boolean default parameter `retrieved = false` which can be confusing.

**Fix:** Convert to keyword argument: `retrieved: false`.

#### 2.4 Predicate Method Naming (Naming/PredicateMethod)
**Severity:** LOW
**Location:** `app/game_state.rb:242`

**Problem:** Method name doesn't end with `?` but is checking/validating something.

**Fix:** This is actually `discard_player_card_by_name`, not a predicate method. The cop may be misidentifying this.

#### 2.5 Short Parameter Name (Naming/MethodParameterName)
**Severity:** LOW
**Location:** `app/game_state/end_turn.rb:9`

**Problem:** Parameter `i` is less than 3 characters.

**Fix:** Rename to more descriptive name like `card_index`.

### 3. Logic Issues

#### 3.1 Non-Local Exit from Iterator (Lint/NonLocalExitFromIterator)
**Severity:** MEDIUM
**Location:** `app/game_state/end_turn_events.rb:10`

**Problem:** Using `return` inside an iterator block (`.times do |i|`) can cause unexpected behavior.

**Fix:** Use `next` or `break` instead, or refactor to avoid early return from iterator.

#### 3.2 Deep Block Nesting (Metrics/BlockNesting)
**Severity:** MEDIUM
**Location:** `app/game_state/player_actions.rb:40`

**Problem:** More than 3 levels of block nesting makes code hard to read and maintain.

**Fix:** Refactor the nested conditional logic in the `move` method to reduce nesting depth.

### 4. Code Smell Issues

#### 4.1 TODO Comment
**Severity:** LOW
**Location:** `app/game_state/end_turn.rb:78`

**Problem:** Incomplete TODO comment without explanation.

**Fix:** Either complete the TODO or remove it if it's no longer needed.

#### 4.2 Hardcoded Development Email
**Severity:** LOW
**Location:** `app/controllers/application_controller.rb:37`

**Problem:** Development user email is hardcoded.

**Fix:** This is acceptable for development mode, but should be noted.

#### 4.3 check_action Method Issues
**Severity:** MEDIUM
**Location:** `app/game_state.rb:82-86`

**Problem:**
- Method returns `nil` or an array `[422, {...}]` which is inconsistent
- The condition `@phase != 'player_actions'` uses `!=` but then returns when true (confusing logic)
- Returns both nil and array, which is inconsistent with the rest of the codebase

**Fix:** Refactor to return consistent hash format and clarify the logic.

## Implementation Plan

### Phase 1: Critical Security Fixes
1. **Remove Marshal.load usage**
   - Update `app/game_state.rb` to only use YAML
   - Update tests to use YAML serialization
   - Test that game state save/load still works correctly

2. **Fix CSRF protection**
   - Make CSRF protection more granular
   - Only skip for actual API endpoints, not all requests

### Phase 2: Code Quality Improvements
3. **Fix non-local exit from iterator** (app/game_state/end_turn_events.rb:10)
4. **Refactor deep nesting** in player_actions.rb move method
5. **Fix check_action method** inconsistent return type
6. **Remove redundant else clauses** in action_cards.rb
7. **Convert boolean parameter to keyword argument**
8. **Rename short parameter** `i` to `card_index`

### Phase 3: Auto-fix Style Issues
9. **Run `rubocop -A`** to automatically fix:
   - Layout/EmptyLinesAroundClassBody
   - Any other auto-correctable issues

### Phase 4: Testing
10. **Run full test suite** to ensure no regressions
11. **Verify game functionality** still works correctly

## Expected Outcomes

- All critical security issues resolved
- All RuboCop offenses fixed or explicitly acknowledged
- Improved code maintainability and readability
- No functional regressions
- All tests passing

## Testing Strategy

1. Run existing test suite before changes (baseline)
2. After each fix, run relevant tests
3. After all fixes, run full test suite
4. Manual verification of game state save/load functionality
5. Verify CSRF protection works correctly for appropriate endpoints
