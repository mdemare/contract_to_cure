# Plan for Issue #39: Align player-panel

## Problem Analysis
The issue requests aligning the top of the player-panel with the top of the map-wrapper.

### Current State
- The `.player-panel` has `top: 80px` positioning it 80px from the viewport top
- The `.map-wrapper` starts immediately after the header with no top offset
- The header (`.game-header`) has padding of `15px 30px` and likely takes up around 80px of height

### Root Cause
The player panel is positioned using a fixed `top: 80px` value, but this doesn't necessarily align with where the map-wrapper actually starts.

## Solution
Change the player panel CSS positioning from `top: 80px` to align with the map-wrapper's actual position. Since the map-wrapper is inside `.game-interface` which comes directly after `.game-header`, I need to:

1. Calculate the header height more precisely, or
2. Use a CSS approach that automatically aligns with the map-wrapper position

## Implementation Plan
1. **Option A**: Change `top: 80px` to match the exact header height
2. **Option B**: Use relative positioning or CSS variables to make it more maintainable

I'll go with Option A and adjust the `top` value to properly align with the map-wrapper.

## Files to Modify
- `public/css/player_panel.css` - line 5: change `top: 80px` to the correct value

## Testing
- Verify player panel aligns with map-wrapper top
- Check responsive behavior on mobile (`@media` query at line 204)
- Ensure player panel toggle positioning remains correct