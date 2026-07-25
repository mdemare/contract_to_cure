# Reject Invalid Destinations 33

## What went right

The existing movement endpoint tests already had helpers for building custom game states and asserting structured error responses, so the new coverage could stay focused on the invalid-destination contract. The added tests now cover the movement paths where an unknown destination could otherwise look like a valid card-paid or role-driven move: direct flight, charter flight, shuttle flight, and Dispatcher gather movement.

The tests also verify that rejected moves leave persistent game state unchanged. Player location, cards in hand, and remaining actions are checked after each failed request, which makes the expected failure mode explicit instead of only asserting the HTTP status.

## What went wrong

Invalid destination coverage was too narrow before this ticket. The generic invalid move test confirmed that the endpoint returned an error, but it did not prove validation happened before movement-specific side effects such as discarding a card or spending an action.

Some edge cases also depend on intentionally unusual setup, such as a player holding a card for an unknown city or a research station list containing an invalid destination. Those states are not expected during normal play, but they are useful regression fixtures because they force the server to validate destination identity before applying any movement branch.

## Final thoughts

Movement validation should reject unknown destinations before considering payment, role abilities, research stations, or pawn movement. The new regression tests document that ordering and protect against future changes that accidentally mutate game state while handling invalid movement requests.
