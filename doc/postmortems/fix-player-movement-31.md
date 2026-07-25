# Fix Player Movement 31

## What went right

The movement rules were isolated enough that the fix could stay focused in the shared movement path. The backend now distinguishes the acting player from the pawn being moved, which let the Dispatcher rule be enforced without duplicating move logic for each movement type. The frontend also blocks stale selected-pawn movement mode for non-Dispatchers, giving players earlier feedback before the request reaches the server.

Endpoint tests were added for the affected behavior: non-Dispatchers cannot move another pawn, Dispatchers can move another pawn by normal movement, Dispatchers can gather pawns, and Dispatcher-paid flight cards are consumed from the Dispatcher rather than the moved pawn.

## What went wrong

The original movement implementation treated `player_index` as both the acting player and the moved pawn in several card-cost checks. That made normal current-player moves work, but it blurred the rules for role abilities that target another pawn. The client could also remain in selected-player movement mode without confirming the current player still had Dispatcher authority.

## Final thoughts

Movement actions need to keep actor, target pawn, and card payer explicit. The new tests cover the repaired Dispatcher paths, and future role abilities should follow the same separation so authorization and payment rules stay readable.
