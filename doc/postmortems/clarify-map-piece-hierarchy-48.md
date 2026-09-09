# Clarify Map Piece Hierarchy

## What went right

The board now has a deliberate visual and interaction hierarchy. Cities retain circular markers and fixed coordinate-centered hit targets, research stations have a separate building silhouette, disease groups combine individually countable cubes with an explicit count, and pawns no longer collapse into overlapping font glyphs. Keeping player identity in copied presentation data made current-pawn and current-city emphasis possible without mutating authoritative game state. Dense-city label placement and explicit piece layers address the most collision-prone map regions.

The player roster converged on a compact, information-complete layout. Every player's full hand is always rendered, seven-card hands use two columns, and the four-player production layout has a tested 498-pixel height budget. One outer scrolling region remains available for exceptional over-limit hands. The complete Rake suite and focused JavaScript DOM tests caught regressions throughout the iterations.

## What went wrong

The first roster implementation followed the earlier design documentation and kept hands behind disclosure controls. That no longer matched the product requirement. Simply opening every hand then made the drawer require scrolling because the layout still used tall summaries, one card column, nested hand limits, and reserved scroll-hint padding. The available 500-pixel height and normal four-player, seven-card case needed to be treated as an explicit layout budget earlier.

The staging verification also exposed a dependency mismatch: Ruby 4 had already activated JSON 3.0.0 while the lockfile required JSON 2.21.2. Aligning the version revealed a second incompatibility because Rails 8.1 passes parser options using the JSON 2 positional API. A conditional ActiveSupport compatibility layer was necessary, and the full suite was essential; a boot-only check would have missed widespread request-parsing failures.

Static CSS and lightweight DOM tests provide fast coverage but cannot prove the visual result across browsers, browser zoom levels, and narrow viewports. The three rendered wraparound map panels also create duplicate semantic city buttons, which needs dedicated keyboard-navigation work.

## Final thoughts

Concrete viewport budgets and fully populated states should be acceptance inputs for dense interfaces, not late review details. Future board and roster changes should start with four players, seven visible cards each, maximum colocated pieces, and the closest city pairs. Browser-level coverage should complement the current structural tests. The JSON compatibility initializer should remain narrowly scoped and be removed when Rails supports JSON 3 directly; the follow-up tickets record both that lifecycle and the remaining browser and accessibility work.
