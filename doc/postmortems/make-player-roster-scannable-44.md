# Make Player Roster Scannable

## What went right

The roster was separated into a small rendering module, which made the player summary and hand disclosure behavior testable without coupling it to game-state fetching. Each player now has a compact, stable summary containing player number, role, location, turn status, and hand count. Full card names remain available through native buttons with linked ARIA state, so the interaction works with keyboard, pointer, and touch input.

The active player receives both visual and semantic emphasis and is brought into view when the turn changes. Expanded hands survive normal game-state rerenders, while bounded hand scrolling and a conditional drawer scroll cue keep unusually large rosters understandable.

Automated coverage exercises the maximum supported four-player roster with twelve-card hands. It checks collapsed summaries, active-player state, card-name access, disclosure semantics, and expansion persistence.

## What went wrong

The original drawer rendered every card name for every player at all times. That made card details dominate the layout and pushed later players, including important roles, below an unmarked scroll boundary.

The repository does not currently have browser-level UI test infrastructure. The new tests validate rendered DOM behavior with a lightweight Node fixture and assert critical CSS overflow contracts, but they cannot verify actual viewport geometry, touch behavior, focus rendering, or visual contrast. A follow-up test ticket tracks those scenarios.

Review also exposed an unrelated production-only issue: the git hash is inserted into the player list and then removed by the first roster render. Bug `cc-178` tracks that defect separately.

## Final thoughts

The drawer now prioritizes the team overview while retaining coordination details on demand. Keeping the roster summaries compact and the hand disclosures native makes the interaction easier to scan and more accessible. Browser-level regression tests are the next useful layer of confidence because the remaining risks are primarily viewport and interaction details rather than rendering logic.
