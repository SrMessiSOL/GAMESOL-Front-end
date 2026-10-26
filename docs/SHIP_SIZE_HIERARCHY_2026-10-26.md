# Ship Size Hierarchy - Local Candidate

Travel models previously used similar authoring dimensions. Added a single
visual-length table and normalized each class against its complete geometry
bounds. The same per-class multiplier applies to detailed and compact models,
public flights and system/galaxy/universe travel renderers. Existing strategic
camera scaling, route grouping, coordinates and return directions are retained.

| Class | Relative Display Length |
| --- | ---: |
| Espionage Probe | 0.40 |
| Light Fighter | 0.75 |
| Solar Satellite | 0.85 |
| Heavy Fighter | 1.00 |
| Small Cargo | 1.25 |
| Recycler | 1.80 |
| Large Cargo | 2.25 |
| Cruiser | 2.50 |
| Colony Ship | 2.70 |
| Bomber | 2.75 |
| Battlecruiser | 3.00 |
| Battleship | 3.25 |
| Destroyer | 4.25 |
| Deathstar | 8.00 |

These are readable strategic display lengths, not literal kilometres. The
Deathstar is about 10.67 times a Light Fighter's length and 20 times a probe's.
Single-model inspection deliberately stays screen-fitted for examining details;
the DEV review's Scale mode compares a Light Fighter and selected class using
the actual shared fleet hierarchy and one camera.

## Checks

40 fleet, travel visibility/grouping, scene-motion, public-entry and cargo tests
passed. Assertions cover all fourteen normalized dimensions, detailed/compact
scale equality, hierarchy, unchanged shared resources and compact geometry
budgets. Final production TypeScript/Vite build passed after the mobile CSS
correction, with the existing bundler warnings.

Desktop comparison at 1280x900 and emulated mobile at measured 390x844 were
visually checked. The first mobile comparison clipped the Deathstar because
the canvas stayed too tall; fixed the mobile comparison aspect without
altering either ship's relative scale. Final rendered-region samples were
nonblank and clear of canvas edges: 21,919 desktop and 6,039 mobile samples.

Evidence: `test-runs/ship-size-hierarchy-2026-10-26/` and
`test-runs/ship-size-hierarchy-2026-10-26.log`.
This is a local visual candidate, not a new signed flight or live release.
No store changes, purchases, program upgrade, publication or deployment.
Scheduled automation was re-read as PAUSED and left unchanged.

## Cosmetics Concept - Not Implemented

Potential shop items: class-specific hull liveries/material finishes, engine
effects and approved partner decals. Keep class silhouettes, size hierarchy,
mission/friend-or-foe indicators and all gameplay stats unchanged. Start with
fixed, reviewed asset definitions, not user-provided shaders or external models.

Purchases and equipped choices should be recorded on-chain and exposed through
the same player/agent APIs, with duplicate-payment and ownership checks. No
database-only or browser-storage purchase entitlement. Partner-branded packs
require the brand's approval and must not imply an existing partnership.
No Phantom/Solflare art or store inventory was added by this size change.
