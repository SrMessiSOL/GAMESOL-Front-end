# GAMESOL Fleet Assets V1 - Local Candidate

## Scope

Four mission-role visual families: combat, cargo, colony and scout. These are
representative mission hulls, not fourteen individually reconstructed inventory
classes. Fleet composition, ship statistics, mission timing, ownership and
transaction instructions are unchanged. No publication or deployment occurred.

## Assets

Built-in image generation produced four transparent 1536x1024 PNGs, saved in
`src/assets/fleet/` without overwriting the previous UI assets:

- `gamesol-battlecruiser-v1.png`
- `gamesol-cargo-v1.png`
- `gamesol-colony-v1.png`
- `gamesol-scout-v1.png`

All four have actual alpha transparency (corner alpha 0). The artwork is used
in the public fleet showcase with contain framing and lazy loading. The combat
asset also replaces the old cropped marketing ship image. The game does not
load these large PNGs per travelling fleet.

## Generation Prompt Set

Common direction: one complete original GAMESOL spacecraft in three-quarter
overhead view, bow upper right and stern lower left. Off-white ceramic armor,
graphite frame, yellow hazard markings, amber navigation lamps, recessed cyan
ion engines. Premium hard-surface PBR render, clean readable silhouette, real
transparent alpha. No text, branding, borders, collage, stars, planets, floor or
ground-shadow plane. Full ship inside the image with empty margins.

1. Combat: heavy exploration battlecruiser, tapered central prow, layered armor,
   swept armored outriggers, four stern engines, recessed weapon housings and
   antennas. Not an aircraft or an existing franchise design.
2. Cargo: use combat image only as style reference; compact armored tug bridge,
   structural spine, six rectangular freight modules and heavy twin engines.
   No weapons or aircraft wings.
3. Colony: use combat image only as style reference; broad rounded bow, two
   cylindrical habitat modules, folded solar panels, compact reactor and twin
   engines. Peaceful settlement vessel, no weapons.
4. Scout: use combat image only as style reference; small unmanned needle-shaped
   sensor craft, two swept instrument fins, sensor dome, antenna and one engine.
   No bridge tower, containers or guns.

These specifications record the production prompt set; the original generated
files remain in the generator's output folder as well as the project copies.

## Navigable Models

`src/FleetVessel.tsx` supplies matching stylized low-poly representatives, not
automatically reconstructed versions of the detailed PNG artwork. They share
beveled hull geometry/materials, +Y bow alignment and distinct role silhouettes.
Detailed versions have cargo pods, habitat tanks, sensors or weapon hardpoints.
Compact versions use at most three meshes. No per-ship point lights, texture
loads, animation subscriptions or per-instance shared-resource allocations.

Integrated into the public 3D flight and existing system, galaxy and universe
route renderers. The original route positions/progress/return-direction logic
is retained. Strategic hull size is bounded and camera-distance aware, rather
than being an unreadable sphere. Existing route aggregation remains in place.

`/fleet-assets` is a DEV-only review route with rotation and distant-silhouette
toggles. It is not a new production game action.

## Checks

- 26 focused tests passed: hull geometry and triangle budgets, finite strategic
  scaling, compact mesh/resource reuse, source integration, existing 10000-mission
  grouping, endpoints, return directions, camera/transition and public-entry tests.
- Desktop and emulated phone model review; fixed grid intrinsic canvas overflow
  discovered on resize. Phone canvas is 390px wide with no horizontal overflow.
- Public artwork: all four images loaded, contain framing, no horizontal overflow
  at desktop 1280px and phone 390px widths.
- Existing DEV traffic fixture checked at system/galaxy/universe levels. This is
  simulated traffic, not signed devnet gameplay or a physical-device test.
- Screenshots: `docs/test-runs/fleet-assets-2026-10-26/`.
- Rendered screenshot pixel checks (excluding header/footer) found 516 bright
  scene samples in desktop detail, 548 in phone detail and 589 in phone compact
  mode. These confirm nonblank captured model regions, not direct GPU-buffer reads.
- Final TypeScript/production build passed, with the existing Vite configuration,
  chunk-size and CryptoUfos dynamic-import warnings. No build error.
- Original generated art is separate from the lightweight navigation geometry;
  neither asset generation nor local screenshots certify final art perfection.

Scheduled automation and release authority remain untouched. No wallet approval,
funding, game spending, authority change or mainnet action was performed.
