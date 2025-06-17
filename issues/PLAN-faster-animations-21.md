# Plan for Faster Animations (Issue #21)

## Problem Statement
The current animations are too slow, particularly the wait period before the next turn starts. This makes the game feel sluggish and reduces player engagement.

## Analysis
After searching the codebase, I identified the key animation timing values:

### Primary Animation Files
1. **`public/js/end_turn_events.js`** - Main animation orchestrator
   - `delay(1200)` - Main animation delay (line 125)
   - `delay(600)` - Container hide delay (line 127)
   - `delay(500)` - Game over check delay (line 108)
   - `delay(1000)` - Card animation delays

2. **`public/css/card_animation.css`** - CSS animation definitions
   - Container transition: `opacity 5s ease` (line 18)
   - Card transform: `transform 2s cubic-bezier(0.34, 1.56, 0.64, 1)` (line 38)
   - Glow animations: `1.5s` and `3s` durations

## Proposed Solution

### Phase 1: Reduce JavaScript Delays (High Impact)
- Reduce main animation delay from 1200ms to 800ms
- Reduce container hide delay from 600ms to 400ms
- Reduce game over check delay from 500ms to 300ms
- Reduce card animation delays from 1000ms to 600ms

### Phase 2: Optimize CSS Transitions (Medium Impact)
- Reduce container opacity transition from 5s to 3s
- Reduce card transform transition from 2s to 1.5s
- Keep glow animations at current speed (they add visual appeal without blocking gameplay)

### Phase 3: Fast-track Turn Transitions (High Impact)
- Focus on the "wait period before next turn" mentioned in the issue
- Identify and reduce the final delay that blocks turn progression

## Implementation Plan
1. Update `end_turn_events.js` timing constants
2. Update `card_animation.css` transition durations
3. Test animations to ensure they still look good at faster speeds
4. Verify no timing conflicts between animations and game logic

## Risk Assessment
- **Low Risk**: Animation timing changes are isolated and reversible
- **Testing**: Will run existing tests to ensure game logic is unaffected
- **Visual QA**: May need minor adjustments if animations feel too rushed

## Expected Outcome
- 30-40% reduction in animation delays
- Faster turn transitions while maintaining visual quality
- Improved game pacing and player experience