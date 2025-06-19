# Plan for Issue #36: Disease Status Layout Fix

## Problem Description
The disease status display currently shows 4 diseases in a 2x2 grid layout, but:
1. Disease cube counts are not currently displayed in the UI
2. When implemented, cube counts should appear below the disease status (not to the right)
3. Both columns in the 2x2 grid should be fully visible

## Analysis
- **Current Implementation**: Disease status shows only cure status ("Not Cured", "CURED", "ERADICATED")
- **Available Data**: `gameState.diseaseCubes[color].remaining` contains cube count data
- **Layout Issue**: Current 2x2 grid with horizontal flex items needs to be modified for vertical layout

## Solution Plan

### 1. Update HTML Structure
- Modify each `.cure-item` in `app/views/application/index.html.erb` to include cube count elements
- Add container for cube count display below the cure status

### 2. Update CSS Layout
- Modify `.cure-item` in `public/css/interface.css` to use vertical layout (`flex-direction: column`)
- Add styling for cube count display elements
- Ensure both columns remain fully visible with proper spacing

### 3. Update JavaScript Logic
- Modify `updateCureStatus()` function in `public/js/ui.js` to display cube counts
- Extract and display `gameState.diseaseCubes[color].remaining` values
- Update cube count displays when game state changes

### 4. Testing
- Verify cube counts display correctly for each disease color
- Ensure layout works properly in both columns
- Test responsiveness and visibility of all elements

## Files to Modify
1. `app/views/application/index.html.erb` - Add cube count elements
2. `public/css/interface.css` - Update layout and styling
3. `public/js/ui.js` - Add cube count display logic

## Expected Outcome
- Disease status will show both cure status and cube count for each disease
- Cube counts will appear below (not beside) the disease status
- Both columns of the 2x2 grid will be fully visible
- Layout will be clean and functional on narrow screens