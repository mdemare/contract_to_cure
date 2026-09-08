# Preserve Production Commit Hash

## What went right

The player drawer already had a focused roster rendering module and a lightweight DOM test harness. Introducing a persistent scroll-area shell around a separately rendered roster kept the fix small and made the intended ownership boundary explicit: production metadata belongs to the drawer shell, while game-state updates own only player rows.

The resulting structure also preserves the roster's accessibility semantics. The element with `role="list"` now contains only player list items, and the commit hash remains at the top of the same scroll area without being deleted by roster updates. Automated coverage renders the roster repeatedly and verifies both the hash node's identity and the semantic list contents. The full test suite passes with 113 tests and 611 assertions.

## What went wrong

The earlier implementation appended the hash directly to the same element whose contents were cleared on every game-state render. Existing endpoint coverage only verified that development mode omitted the production data attribute, so it could not detect the production-only lifecycle failure.

The repository's lightweight DOM tests do not exercise an actual browser viewport. Ticket `cc-182` tracks browser-level coverage for update events, scrolling, drawer visibility, accessibility structure, and responsive layouts.

Validation also showed that revision discovery depends on the loose ref at `.git/refs/heads/trunk`. That path is not available in linked worktrees and may be absent with packed refs or deployment images without Git metadata. Ticket `cc-181` tracks making the revision source robust.

## Final thoughts

Separating persistent drawer chrome from replaceable game-state content prevents this class of lifecycle bug and leaves a clearer DOM contract for future player-panel work. The focused regression protects that boundary now; the follow-up browser coverage will validate the remaining layout and event-integration risks.
