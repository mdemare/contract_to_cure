# Improve Map Rework

## What went right

The attached populated-board screenshot made the composition problem concrete. Replacing the nearest-neighbor left-or-right heuristic with deterministic eight-position label placement addressed the whole dense region rather than individual city pairs. The layout now scores other labels, city markers, pawns, research stations, disease cubes, and panel boundaries while leaving labels in their familiar centered-below position when no collision exists.

Compact two-column cube groups and smaller piece silhouettes restored map context without removing individually rendered game pieces, fixed city hit targets, or current-player emphasis. The follow-up request also exposed the actual connection-line layering issue: transformed city controls create stacking contexts, so child z-index values could not lift labels above the SVG layer. Raising each city stacking context and using opaque labels fixed the problem directly.

The regression fixture uses the real city map with densely populated European, African, and Asian cities. It verifies label, marker, and piece separation; panel-edge bounds; absence of visual cube counters; accessible cube totals; and the intended connection, label, cube, pawn, and current-player layer ordering. The full suite remained green throughout the revisions.

## What went wrong

The earlier map rework tested each visual ingredient structurally but did not test their combined footprint in a representative game state. Its binary label direction could point multiple neighboring labels into the same corridor, horizontal cube rows became disproportionately wide, and numeric badges repeated information already visible in the cubes. The resulting map technically preserved every piece but made city relationships harder to scan.

The first correction retained numeric counters because the prior design documentation called for them. Product feedback clarified that individual cubes were sufficient visually. It also described labels as being obscured by edges, which required separating two concerns: avoiding clipped panel boundaries and ensuring graph connection edges paint below transformed city stacking contexts. Static DOM and CSS tests still cannot prove rendering across browsers and zoom levels, so browser-level visual coverage remains follow-up work.

## Final thoughts

Dense board interfaces need acceptance fixtures that combine maximum local occupancy with the closest map coordinates. Layer tests must account for stacking-context boundaries, not only descendant z-index values. Accessible descriptions are a better home for redundant numeric detail when the visual pieces are already countable. Future map work should pair pure geometry tests with browser screenshots at multiple viewport sizes and zoom levels, and should expose only one semantic control for each logical city despite the three visual wraparound panels.
