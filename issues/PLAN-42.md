# PLAN-42: Fix Missing Role Styles for Quarantine Specialist and Operations Expert

## Issue Description
The CSS styles for the `quarantine_specialist` and `operation_expert` player pawns are missing because of a mismatch between:
- The role names from the backend (using underscores: `operations_expert`, `quarantine_specialist`)
- The CSS class names (using hyphens: `operations-expert`, `quarantine-specialist`)
- The JavaScript code that only replaces spaces with hyphens, not underscores

## Root Cause
In both `player_panel.js` (line 129) and `current_player.js` (line 31), the code uses:
```javascript
roleName.replace(' ', '-')
```
This only replaces spaces with hyphens, but the role names from the backend use underscores.

## Solution
Update the JavaScript files to replace both spaces AND underscores with hyphens when generating CSS class names:
```javascript
roleName.replace(/[ _]/g, '-')
```

## Files to Modify
1. `/public/js/player_panel.js` - Line 129
2. `/public/js/current_player.js` - Line 31

## Testing Plan
1. Verify that all player roles display correctly with their appropriate colors
2. Test with a game that includes quarantine specialist and operations expert roles
3. Ensure no regression for other roles (medic, scientist, researcher, dispatcher, contingency planner)