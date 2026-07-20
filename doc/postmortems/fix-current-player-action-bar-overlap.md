# Fix Current Player Action Bar Overlap

## What went right

The fix stayed narrowly scoped to the current player layout. On desktop, the current-player control now participates in the action bar's flex layout instead of using fixed positioning, so it reserves its own space beside the action buttons. The mobile behavior remains fixed and compact, preserving the existing small-screen interaction model.

A focused regression test was added for the CSS contract. It verifies that desktop layout uses static positioning with a stable flex width, and that mobile layout keeps the fixed placement and bottom offset.

## What went wrong

The original desktop fixed positioning let the current-player control visually collide with nearby action buttons because it did not reserve space in the normal layout flow. The CSS had separate desktop and mobile needs, so the fix had to avoid solving the desktop overlap by accidentally changing the mobile placement.

## Final thoughts

This was a small layout bug, but the stable test is useful because the regression is easy to reintroduce with CSS-only changes. Future action bar changes should treat desktop and mobile positioning as separate contracts.
