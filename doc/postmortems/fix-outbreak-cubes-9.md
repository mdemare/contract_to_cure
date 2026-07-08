# Fix Outbreak Cube Supply Accounting

## What went right

The defect was isolated to disease cube placement during end-turn infection events. The fix stayed small and now calculates how many cubes can actually be placed before checking the remaining disease cube supply. Focused regression tests cover exact-supply placement and the outbreak path where one cube is placed before the outbreak is triggered.

## What went wrong

The previous logic compared the requested cube count against the remaining supply before accounting for the city's available cube slots. It also subtracted the outbreak placement after setting the city to three cubes, which meant the placed cube was not deducted correctly. That allowed exact supply placement to end the game incorrectly and left supply accounting wrong during outbreak-triggering infections.

## Final thoughts

The corrected behavior matches the board-game flow more closely: place only the cubes that fit, deduct those cubes from supply, then trigger the outbreak when the requested infection exceeds the city limit. The full test suite passes, and no additional follow-up bugs were found while wrapping up the ticket.
