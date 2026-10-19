# Quick Play expiry status fix - October 19, 2026

## Implemented

- Refresh current on-chain session status after successful and failed commands.
- Recheck on focus, visible-tab return and every 30 seconds while visible.
- Skip hidden tabs, overlapping background reads and pending activation/revocation.
- Discard stale account/revision responses; current RPC failure cannot certify ON.
- Remove listeners/timer on cleanup. Keep per-account keys and the existing
  eight-hour on-chain authorization unchanged. No automatic renewal.

## Verified

- Final full frontend/server/API suite: 373 passed, zero failed/skipped.
- Thirteen hook/regression tests cover refresh restoration, expiry/revocation,
  idle expiry, tab visibility, failed command refresh, activation races, cleanup,
  RPC failure/recovery and stale-account responses.
- Local production build and isolated Vercel Preview build passed.
- Preview: https://frontend-jvqwtdgfq-srmessisols-projects.vercel.app
- Stable QA alias points to that Preview; public game remains unchanged.
- Live QA restored NewAccount with Quick Play OFF after the update, as expected
  for its expired authorization. No fresh passkey permission was inferred.

## Completed Live Gate

Default signed in and the expired session correctly restored OFF. A renewal
initially hit a blocked later popup; the user completed renewal directly in QA.
Quick Play then restored ON after page reload without another approval. The
same account and commander portrait #513 restored. Quick Play stayed ON after
collection. Desktop 1280x900 and mobile 390x844 account modal checks passed;
mobile document scroll width was 390 (no horizontal overflow).

The existing ready Colony Ship was collected once through Quick Play:

- Finalized signature: `4rdLC4pjAHQ8oY2yopMBmzHs8VVrs9gAHyKJm3afBhRkfM1SGx4TkjjurrF8v2hxTYPJajEuNsCTQdmwJ2X6kXQF`.
- Transaction slot: 512865656; finalized account checkpoint: 512865697.
- Inventory colonyShip=1, shipBuildItem=255, shipBuildQty=0,
  shipBuildFinishTs=0, activeMissions=0.
- UI vessel total increased from 23 to 24 and the ready queue disappeared.
- Duplicate collection unsigned simulation rejected with NoShipBuild (6022),
  with unchanged planet data. It did not submit a second transaction.

No USDC or AM was spent; network fees were sponsored. No new ship build,
program upgrade or authority change occurred. Collection is signed live evidence;
duplicate rejection is unsigned program-rule evidence, not authentication proof.

Automated expiry tests are not a live eight-hour elapsed-time test. Public
publication details are recorded separately after the release smoke check.

## Published

- GitHub source commit: `9a39a83`, branch `feat/crypto-ufos-wallet-link`.
- Final Production build: https://frontend-5q3kb02xs-srmessisols-projects.vercel.app
- Both public and stable QA aliases point to this build. Asset index-bknaIRKr.js
  and devnet genesis were verified through the public alias after publication.
- QA restored Quick Play ON across both the post-collection reload and the
  Preview-to-final-build update, without renewal. Public game restored Default
  and #513. QA authorization is origin-bound; it is not copied to the public
  origin, whose previously expired permission must not be silently renewed.
- Finalized receipt confirms FinishShipBuildVault, fee 10,000 lamports paid by
  sponsor F8HniT2KZspe6AGDQKvVrmkFt9LwZkctPVVQF8XZz6ub.
