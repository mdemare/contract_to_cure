# Plan: Fix Action Card Button Missing During Infect Cities Phase

## Issue
GitHub Issue #57: Action Card Button Missing
- The action card button is not visible during the "Infect Cities" phase
- Players should be able to play event cards at any time, including during the infect cities phase

## Root Cause Analysis
After analyzing the codebase, I found the issue in `/public/js/action_buttons.js`:

1. The `updateButtonStates()` function controls button visibility based on the current game phase
2. During non-player action phases (like 'infect_cities'), the code hides all action buttons except the action cards button
3. However, there's a bug in the implementation: the action cards button is included in the `actionButtonsList` selector and gets hidden despite the conditional check trying to exclude it
4. The action cards button visibility is only properly updated later in the function, but by then it's already been hidden

## Implementation Plan

### 1. Fix the Button Visibility Logic
- Modify `/public/js/action_buttons.js` to ensure the action cards button remains visible during all phases if players have event cards
- The fix involves ensuring the action cards button is properly excluded from being hidden during phase transitions

### 2. Specific Changes
In `/public/js/action_buttons.js`, around lines 90-103:
- The current code tries to exclude the action cards button with `button.id !== 'action-cards-btn'`
- Need to verify this condition is working correctly or adjust the logic to ensure the button stays visible

### 3. Testing
- Test that the action cards button remains visible during the infect cities phase when players have event cards
- Test that the button is correctly hidden when no players have event cards
- Verify the fix doesn't affect button visibility during other game phases

## Files to Modify
1. `/public/js/action_buttons.js` - Main file containing the bug
2. Potentially `/public/js/action_cards.js` if we need to adjust when the button state is updated

## Success Criteria
- Action cards button is visible during the infect cities phase when players have event cards
- Button behavior remains consistent across all game phases
- No regression in other button visibility logic