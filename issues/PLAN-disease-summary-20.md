# Plan for Issue #20: Disease Summary

## Problem
The current disease summary shows:
1. "Infection Cards" count which needs to be removed
2. Disease status only shows cure/eradicated status, but not remaining cubes per disease

## Required Changes

### 1. Remove Infection Cards Count
- **File**: `app/views/application/index.html.erb` (lines 72-75)
- **Action**: Remove the "Infection Cards" status item from the game status panel

### 2. Add Remaining Cubes Display
- **File**: `app/views/application/index.html.erb` (Disease Status section, lines 78-98)
- **Action**: Add cube count display for each disease color in the cure-item divs

### 3. Update Frontend JavaScript  
- **File**: `public/js/ui.js` (lines 92-95)
- **Action**: Remove the infection cards count update logic
- **File**: `public/js/ui.js` (updateCureStatus function, lines 109-129)
- **Action**: Update to also display remaining cube counts per disease

### 4. Backend Data Already Available
- The `json_generator.rb` already provides `inSupply` data in the `diseaseCubes` object
- No backend changes needed - just need to use existing data in frontend

## Implementation Steps
1. Remove infection cards HTML element and update JavaScript
2. Add cube count display elements to HTML for each disease
3. Update JavaScript to populate cube counts from existing game state data
4. Test that cube counts update correctly as game progresses

## Files to Modify
- `app/views/application/index.html.erb`
- `public/js/ui.js`