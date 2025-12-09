# Ruby Code Review - Contract to Cure

This document contains the findings from a comprehensive code review of the Ruby files in the codebase.

## Summary

The codebase is generally well-structured with clear separation of concerns using modules. However, there are several areas that need improvement for better code quality, security, maintainability, and robustness.

## Issues Found

### 1. Security Issues

#### 1.1 CSRF Protection Completely Disabled
**File:** `app/controllers/application_controller.rb:5`
**Severity:** Critical
**Issue:** The line `protect_from_forgery with: :exception, unless: -> { true }` completely disables CSRF protection for all requests.
**Recommendation:** Remove the `unless: -> { true }` or use proper API authentication tokens.

#### 1.2 Hardcoded Development Email
**File:** `app/controllers/application_controller.rb:37`
**Severity:** Medium
**Issue:** Hardcoded email 'merloen@gmail.com' in development mode.
**Recommendation:** Use environment variables or configuration files instead of hardcoded emails.

### 2. Error Handling Issues

#### 2.1 Bare Raises Without Error Messages
**File:** `app/game_state.rb:347`
**Severity:** Medium
**Issue:** `raise unless requested_player.is_a?(Player)` provides no error context.
**Recommendation:** Use descriptive error messages: `raise ArgumentError, "Expected Player object, got #{requested_player.class}"`

**Files with similar issues:**
- `app/game_state/setup.rb:9` - `raise unless @cities.size == 48`
- `app/game_state/setup.rb:16` - `raise unless @cities.size == 48`
- `app/game_state/setup.rb:34` - `raise cities_data unless cities_data.size == 48`
- `app/game_state/setup.rb:76` - `raise unless @cities.size == 48`

#### 2.2 Inconsistent Error Handling
**File:** `app/game_state.rb:65-69`
**Severity:** Low
**Issue:** Error logging uses `puts` instead of proper logging.
**Recommendation:** Use Rails.logger consistently throughout the application.

### 3. Code Quality Issues

#### 3.1 Incorrect Parameter Validation
**File:** `app/controllers/game_controller.rb:18`
**Severity:** Medium
**Issue:** `unless player_index && destination` doesn't properly validate that player_index is 0, as 0 is falsy in Ruby.
**Recommendation:** Use `unless player_index.nil? && destination.nil?` or check for nil explicitly.

#### 3.2 Mixed Concerns in Check Action
**File:** `app/game_state.rb:82-86`
**Severity:** Medium
**Issue:** The `check_action` method returns different types (nil or array with HTTP status), mixing controller concerns into the model.
**Recommendation:** Separate HTTP response formatting from business logic. Return a simple boolean or error object.

#### 3.3 Unnecessary Duplicate Code
**File:** `app/game_state/end_turn_events.rb:99-109`
**Severity:** Low
**Issue:** Multiple duplicate checks for quarantine specialist and cured diseases.
**Recommendation:** Consolidate the early return checks to avoid duplication.

#### 3.4 Inconsistent Return Values
**File:** `app/game_state/end_turn.rb:44`
**Severity:** Low
**Issue:** Method returns `nil` explicitly in some cases and implicitly in others.
**Recommendation:** Be consistent with return values throughout methods.

### 4. Data Integrity Issues

#### 4.1 Unsafe YAML Loading
**File:** `app/game_state.rb:52`
**Severity:** Medium
**Issue:** YAML.load with permitted_classes could still be vulnerable if the class list is not comprehensive.
**Recommendation:** Consider using JSON for serialization instead, or ensure all edge cases are handled.

#### 4.2 No Validation on Card Order Size
**File:** `app/game_state/action_cards.rb:69-72`
**Severity:** Low
**Issue:** The validation could be more explicit about what's wrong when validation fails.
**Recommendation:** Provide detailed error messages about expected vs actual card counts.

### 5. Logic Issues

#### 5.1 Complex Outbreak Chain Logic
**File:** `app/game_state/end_turn_events.rb:75-148`
**Severity:** Medium
**Issue:** The `trigger_outbreak` method is overly complex with multiple early returns and nested conditions. Game over conditions are checked in multiple places.
**Recommendation:** Refactor into smaller, more testable methods. Extract game over checks into a separate method.

#### 5.2 Potential Race Condition with Operations Expert Move
**File:** `app/game_state/player_actions.rb:14-24`
**Severity:** Low
**Issue:** The `@operations_expert_move_used` flag could be problematic in concurrent scenarios.
**Recommendation:** Ensure this is properly reset at turn boundaries and consider adding validation.

#### 5.3 Inconsistent Phase Checking
**File:** `app/game_state.rb:83`
**Severity:** Low
**Issue:** Phase check uses `!=` which returns early if phase is not 'player_actions', but the method name suggests checking if action is allowed.
**Recommendation:** Rename method or invert the logic for clarity.

### 6. Maintainability Issues

#### 6.1 Magic Numbers
**File:** `app/game_state/end_turn_events.rb:24`
**Severity:** Low
**Issue:** Hand limit of 7 is hardcoded multiple times.
**Recommendation:** Extract to a constant in GameStateConfig.

**Similar issues in:**
- `app/game_state/player_actions.rb:149, 219`

#### 6.2 File.dirname Usage
**File:** `app/game_state/setup.rb:31`
**Severity:** Low
**Issue:** `File.dirname(__FILE__, 2)` is deprecated and confusing.
**Recommendation:** Use `File.expand_path('../../public/cities.json', __FILE__)` or Rails path helpers.

#### 6.3 Unnecessary Comments
**File:** `app/game_state/end_turn_events.rb:78`
**Severity:** Low
**Issue:** `# TODO` comment with no description.
**Recommendation:** Either complete the TODO or remove it if not needed.

### 7. Testing Issues

#### 7.1 Debug Output in Production Code
**File:** `app/game_state/end_turn.rb:29`
**Severity:** Low
**Issue:** `puts event.inspect` should not be in production code.
**Recommendation:** Remove or replace with proper logging.

### 8. Code Style Issues

#### 8.1 Inconsistent Method Definitions
**File:** `app/game_state/card.rb:17`
**Severity:** Low
**Issue:** Using endless method definition `def retrieved? = @retrieved` which is a Ruby 3.0+ feature that may not be familiar to all developers.
**Recommendation:** Use conventional method definition for consistency, or ensure team is aware of Ruby 3.0 features.

#### 8.2 Complex Conditional Logic
**File:** `app/game_state/end_turn_events.rb:162-179`
**Severity:** Low
**Issue:** The `add_disease_cubes` method has complex nested conditionals.
**Recommendation:** Extract some conditions into well-named private methods.

### 9. Documentation Issues

#### 9.1 Missing Documentation
**Severity:** Low
**Issue:** Complex methods like `trigger_outbreak`, `add_disease_cubes`, and `load_state_from_hash` lack documentation.
**Recommendation:** Add YARD or RDoc comments explaining parameters, return values, and side effects.

#### 9.2 Confusing Variable Names
**File:** `app/game_state/player_actions.rb:13`
**Severity:** Low
**Issue:** `cc` is not a descriptive variable name.
**Recommendation:** Use full word like `connected_city`.

## Priority Recommendations

### High Priority
1. Fix CSRF protection vulnerability
2. Fix parameter validation for player_index that can be 0
3. Add proper error messages to all bare raises
4. Refactor complex outbreak logic for better testing

### Medium Priority
5. Remove hardcoded email in development
6. Standardize error handling and logging
7. Separate HTTP concerns from business logic
8. Review and improve YAML serialization security

### Low Priority
9. Extract magic numbers to constants
10. Remove debug puts statements
11. Add documentation to complex methods
12. Improve code style consistency

## Positive Aspects

1. Good use of modules for separation of concerns
2. Clear class responsibilities
3. Consistent naming conventions for most methods
4. Good test coverage based on test files present
