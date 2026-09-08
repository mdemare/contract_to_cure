# Compact Phase Action Bar

## What changed

The board and status region now flex into the height left by the action bar instead of being fixed at 80% of the viewport. The bar sizes itself from its visible content, records the active turn phase, and keeps the current-player summary, available controls, and hand in explicit layout areas. Player-action controls remain touch friendly, while the draw-cards and infect-cities controls use a shorter end-turn presentation.

On narrow screens the available controls scroll horizontally in a single row instead of wrapping into several rows. The current player stays in normal layout flow and the hand has its own row, preventing either element from covering the other. The player drawer follows the bar's measured height so it neither overlaps the controls nor leaves the old fixed gap.

## Verification

Layout regression tests cover content-driven sizing, all phase hooks, touch-target minimums, narrow-screen overflow, hand separation, and drawer alignment. Existing current-player and action-card sizing coverage was updated to reflect the compact layout.

## Follow-up considerations

The repository does not include browser screenshot tests, so the coverage protects the layout contracts rather than pixel geometry. The action strip deliberately uses horizontal scrolling on small viewports to preserve map height and touch-target size as future actions are added.
