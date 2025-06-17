# Plan for Issue #34: Disease Status Layout

## Problem
The current disease status layout is poorly designed with:
- Cramped 2x2 grid layout
- Tiny colored circles (16x16px) that are hard to see
- Very small font size (0.8rem) making text difficult to read
- Insufficient spacing between elements
- Poor visual hierarchy
- Background color that blends with the interface

## Current Structure
**Files involved:**
- `app/views/application/index.html.erb` (lines 78-98) - HTML structure
- `public/css/interface.css` (lines 77-125) - Disease status styling
- `public/js/ui.js` (lines 108-129) - Update logic

## Proposed Solution

### 1. Improve Visual Design
- **Larger colored indicators**: Increase from 16x16px to 24x24px circles
- **Better font size**: Increase from 0.8rem to 1rem for readability
- **Enhanced spacing**: Increase gaps and padding for better visual separation
- **Improved contrast**: Better background colors and borders

### 2. Layout Improvements
- **Maintain 2x2 grid** but with better proportions
- **Add visual hierarchy** with better title styling
- **Improve responsive behavior** for mobile devices
- **Better alignment** of elements within each disease item

### 3. Visual Enhancements
- **Subtle shadows** or borders for depth
- **Better color contrast** for accessibility
- **Consistent spacing** throughout the component
- **Professional appearance** that matches the game's aesthetic

## Implementation Steps

1. **Update CSS styling** in `interface.css`:
   - Increase `.cure-color` size to 24x24px
   - Increase `.cure-label` font-size to 1rem
   - Improve gap spacing in `.cure-grid`
   - Enhance `.cure-item` padding and appearance
   - Add subtle visual improvements (shadows, borders)

2. **Test the changes**:
   - Verify visual appearance in browser
   - Check responsive behavior
   - Ensure functionality remains intact

3. **Validate with existing tests**:
   - Run `rake test` to ensure no regressions
   - Add any necessary tests if UI testing exists

## Expected Outcome
A clean, professional-looking disease status display that:
- Is easy to read and understand at a glance
- Has proper visual hierarchy
- Maintains functionality while improving aesthetics
- Provides better user experience