# Disable Build At Research Station Limit

## What went right

The frontend now derives the build research station button state from the same station availability data shown in game state. When the station supply is exhausted, the button is disabled with a specific tooltip, and direct clicks are still rejected with the same message if the UI state is stale.

The change also tightened the build button enablement path so global button re-enabling does not accidentally override a rule-specific disabled state. This keeps action refreshes from making an unavailable build action look valid.

## What went wrong

The original UI condition only checked whether the player had the matching city card and whether the current city already had a research station. It did not account for the global research station supply, so the client could present the build action as available after all stations were placed.

The added automated coverage is useful as a regression guard, but it is source-level coverage rather than an end-to-end browser test. It confirms the expected checks remain in place, but it does not prove the rendered button, tooltip, and click handling work together through the full UI.

## Final thoughts

The rule belongs in backend validation, but the client still needs to prevent obviously invalid actions from being offered. The final behavior now communicates why building is unavailable and guards against stale clicks, with a follow-up needed for browser-level interaction coverage.
