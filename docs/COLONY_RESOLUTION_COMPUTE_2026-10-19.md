# Colony arrival compute-limit correction

## Observed live failure

The original account's Homeworld 9:427:13 still displayed its ready colonize
mission to 9:427:14. The error dialog reported an unsigned sponsored-transaction
simulation failure. The game program completed after consuming 183,336 of its
remaining 183,463 units, but the enclosing Lazor program exhausted the outer
200,000-unit limit. This attempt was rejected before submission.

## Local correction

Colony initialization now receives an explicit 400,000-unit top-level limit,
outside the Lazor CPI bundle. Quick Play preflight and submission use the same
budgeted instruction list. Passkey submission also receives the limit. Other
commands are unchanged. Existing outer limits are replaced, not duplicated;
priority-price instructions are preserved.

## Verification boundary

Focused budget, command-preflight, expired-session and sponsor-policy tests
passed (66 tests). The full frontend/server regression run passed all 394 tests
after updating three source-layout assertions. Type checking and the production
build also passed (existing chunk-size/dynamic-import warnings remain).
The budget fixture serializes below the packet limit, but is
not the actual player's signed packet. This is not proof of a resolved colony.
No colony retry, relaunch, purchase, program upgrade or publication was performed.
Live validation must resolve the existing mission once, then verify the colony,
source mission slot and receipt. Automated work remains paused.
