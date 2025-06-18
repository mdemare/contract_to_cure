# PLAN-43: Move Git Commit Hash

## Issue Summary
Move git commit hash from the header to the top left of the `.player-list` element.

## Context
- PR #24 implemented git commit hash display in the header
- Issue #43 requests moving this display to the player list area
- The git commit hash currently shows the first 6 characters (e.g., bf3b98b)

## Implementation Plan

### 1. Locate Current Implementation
- [x] Find where git commit hash is currently displayed in header
- [x] Identify the current implementation code

### 2. Remove from Header
- [ ] Remove git commit hash display from header
- [ ] Clean up related CSS styling for header version

### 3. Add to Player List
- [ ] Modify player panel JavaScript to include git commit hash
- [ ] Add git commit hash to top left of `.player-list` element
- [ ] Style the commit hash appropriately (small, inconspicuous)

### 4. Implementation Details
- [ ] Update `public/js/player_panel.js` to add commit hash display
- [ ] Update `public/css/player_panel.css` to style the commit hash
- [ ] Ensure commit hash is visible but not prominent
- [ ] Position in top-left corner of player list

### 5. Testing
- [ ] Verify git commit hash appears in player list
- [ ] Verify git commit hash is removed from header
- [ ] Test visual positioning and styling
- [ ] Test in both development and production environments

## Expected Changes
- **Modified files**: 
  - `app/views/application/index.html.erb` (remove from header)
  - `public/js/player_panel.js` (add to player list)
  - `public/css/player_panel.css` (styling)

## Success Criteria
- Git commit hash (first 6 characters) displays in top-left of `.player-list`
- Git commit hash is removed from header
- Visual styling is clean and inconspicuous
- No regression in existing functionality