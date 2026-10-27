# Verified Travel Liveries

Status: local implementation and verification complete. No publication, program
upgrade, devnet/mainnet transaction, token spending or authority change. Scheduled
checklist automation remains PAUSED.

## Behavior

- Mission snapshots carry their source commander's full public address, including
  on the return leg. The viewer, destination owner and truncated wallet labels
  are never used to select a skin.
- System, galaxy and universe routes share `TravelFleetVessel`, which resolves
  the ship class's equipped skin from a verified cosmetic inventory.
- Reads validate program ownership, derived inventory address, discriminator,
  commander, complete layout and the owned-skin bit before using equipment.
- Missing, malformed, mismatched, unowned or unavailable loadouts render Standard.
  The ship itself remains visible with its original geometry and size.
- Active owners are deduplicated and read in one batch, capped at 32. Refresh is
  every 15 seconds while visible and on foreground focus. Stale responses from
  a previous connection or owner set cannot replace the current scene's data.
- Mainnet never reads cosmetic inventories. No purchase or wallet signing flow
  is involved in displaying a skin.
- Travel grouping now separates commanders and ship classes. Different owners'
  liveries and differently sized ships cannot become one misleading marker.
  The existing 32-route draw cap and complete traffic counts remain intact.
- Hull geometry, normalized class sizes, compact mesh budgets, route timing,
  collision avoidance, mission colors and friend/foe cues are unchanged.

## Verification

- Full frontend/server regression suite: 501 passed, zero failures/skips.
- Focused ownership, grouping, geometry, motion and scene suite: 31 passed.
- Production build passed; existing chunk-size/deprecated-import warnings remain.
- Direct isolated-validator readback confirmed Player One's Battlecruiser uses
  Solar, Player Two's Cruiser uses Scarlet, Player One's unequipped Light Fighter
  remains Standard, and an unknown owner uses Standard on a Deathstar.
- A mismatched commander record is rejected; the viewer cannot lend a skin to
  another player's fleet. Existing test balances stayed at 14 and 17 tokens.
- Desktop 1280x900 and mobile 390x844 were checked at all three travel scales:
  nonblank visible models, correct palette, coherent class hierarchy, working
  scene selection, no horizontal overflow and visible endpoint travel paths.
- Screenshot pixel checks confirm Solar/Scarlet visibility and the large-hull
  hierarchy in all six view/viewport combinations. Two desktop system frames
  also show ship movement. Exact size ratios remain covered by geometry tests,
  rather than inferred from perspective-dependent screenshot dimensions.

Evidence: `docs/test-runs/travel-cosmetics-2026-10-27/`.
Tests: `docs/test-runs/travel-cosmetics-focused-2026-10-27.log` and
`docs/test-runs/travel-cosmetics-full-2026-10-27.log`.
Build: `docs/test-runs/travel-cosmetics-build-2026-10-27.log`.

## Local Review

`http://127.0.0.1:4198/travel-cosmetics-local`

The development-only review uses the actual three game route components with
clearly labeled route fixtures. Skin records are read from the previously tested
isolated local validator, not invented ownership. Its loopback endpoint is
read-only and exposes no signing keys. No real missions were launched. The QA
route and local endpoint are excluded from the production bundle.

The public game is unchanged. Actual devnet/Lazor verification still requires a
separately approved cosmetics program upgrade/configuration and frontend release.
