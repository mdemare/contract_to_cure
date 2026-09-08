# Compact Phase Action Bar

## What went right

The board and status region now flex into the height left by the action bar instead of being fixed at 80% of the viewport. The bar sizes itself from its visible content, records the active turn phase, and keeps the current-player summary, available controls, and hand in explicit layout areas. Player-action controls remain touch friendly, while the draw-cards and infect-cities controls use a shorter end-turn presentation.

On narrow screens the available controls scroll horizontally in a single row instead of wrapping into several rows. The current player stays in normal layout flow and the hand has its own row, preventing either element from covering the other. The player drawer follows the bar's measured height so it neither overlaps the controls nor leaves the old fixed gap.

Layout regression tests cover content-driven sizing, all phase hooks, touch-target minimums, narrow-screen overflow, hand separation, and drawer alignment. Existing current-player and action-card sizing coverage was updated to reflect the compact layout.

## What went wrong

The repository does not include browser-level viewport or screenshot tests. The automated coverage therefore protects the DOM and CSS layout contracts, but it cannot detect clipped controls, unexpected wrapping, overlap, or regressions in the actual amount of map space visible at specific viewport sizes. A follow-up bug records the missing browser scenarios.

## Final thoughts

Content-driven sizing makes the interface respond naturally as phases expose different numbers of actions. Keeping small-screen controls in one horizontally scrollable row preserves both map height and touch-target size, and measuring the final bar height gives the independent player drawer a reliable boundary. Browser-level geometry checks are the remaining useful layer of confidence.
