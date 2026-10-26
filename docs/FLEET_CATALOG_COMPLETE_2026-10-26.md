# Complete Ship Catalog - Local Visual Candidate

This completes and supersedes the initial four-role art pass for the current
14-class ship catalog. It does not certify the whole game or mainnet readiness.

## Delivered

- Unique transparent artwork for all fourteen canonical SHIPS keys: both cargo
  ships, both fighters, cruiser, battleship, battlecruiser, bomber, destroyer,
  deathstar, recycler, espionage probe, colony ship and solar satellite.
- Generated orbital hangar backdrop; existing deep-space plate reused.
- Shared catalog feeds the public page, game shipyard/hangar art, mission art
  and fleet-selection imagery. Shipyard background layers preserve whole hulls.
- Distinct lightweight navigation geometry for all fourteen classes, with shared
  materials, panel texture and bounded distant silhouettes. These are stylized
  navigable models, not high-poly reconstructions of the detailed renderings.
- When chain mission counts exist, the map selects a real representative class.
  Missing composition retains role fallback; satellites are never inferred in
  flight. Aggregated routes retain representative hulls, not an inventory count.
- Gameplay prices, prerequisites, balances, ownership, route timing, authorities
  and transaction instructions remain unchanged.

## Files And Performance

Originals: `src/assets/fleet/*.png`. Optimized delivery copies: matching WebP
files. Catalog mapping: `src/ship-catalog.ts`. All 14 keys are tested against
the canonical SHIPS array, with no missing, duplicate or invented classes.

Fifteen original PNGs (14 ships + hangar): **36,666,214 bytes**. Fifteen delivery
WebPs: **2,541,852 bytes**, about 93% smaller. The delivery images are 1024px
wide, quality 86, with transparency retained. PNG originals were preserved.
Encoding used a temporary sharp-cli utility, not a project dependency change.
Built-in image generation was used; prompts/specifications are retained in
`test-runs/fleet-catalog-2026-10-26/generation-specifications.json` and the initial
four-asset report. No API credential was added to the repository.

## Verification

- Final full local frontend/server suite: **482 passed, 0 failed/skipped**,
  45,282 ms. Includes exact catalog coverage, geometry/mesh budgets, mission-count
  classification, snapshot propagation, return/endpoints and 10,000-mission grouping.
- TypeScript + production build passed. Existing Vite configuration, chunk-size
  and CryptoUfos dynamic-import warnings remain.
- Desktop 1440x900 and emulated phone 390x844: public catalog, hangar artwork,
  shipyard presentation and deep-space specialist cards checked. All 14 images
  loaded, no document horizontal overflow; public headings/descriptions fit.
- Captured all 14 phone navigation models. Bright model-region pixel samples
  ranged from 264 to 4377; bright geometry stayed within x=66..324/y=263..545
  on the 390px viewport, with no clipped bright hull edges.
- Shipyard review uses game styles, resolver and CommandActionButton with
  disabled actions. It is a presentation fixture, not an authenticated wallet
  gameplay acceptance run. Physical-device touch/GPU testing is not claimed.
- Earlier local traffic fixture checks retain system/galaxy/universe evidence.
  Geometry-only changes require no devnet program upgrade.

Screenshots and model captures: `docs/test-runs/fleet-catalog-2026-10-26/`.
Local review: http://127.0.0.1:4197/fleet-assets
Public page: http://127.0.0.1:4197/#fleet

## Release Boundary

No commit/push, Vercel publication, program deployment, funding, wallet approval
or mainnet action was performed. Scheduled automation is untouched. This dirty
checkout also holds unrelated security/gameplay changes: do not publish the
entire checkout as an unreviewed cosmetic release. Existing security-release
configuration gates remain separate.
