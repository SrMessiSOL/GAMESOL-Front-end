# Restored Fleet Artwork And Original-Shape Models

Release baseline: `9c1e69e` on `feat/crypto-ufos-wallet-link`.
Prepared in the existing isolated release checkout, not the dirty development
workspace. Preserves the published commander-artwork fix and all API,
dependency, wallet, transaction, economy and gameplay program code.

Scope: restore all fourteen original optimized UI ship images, adjust their
framing, replace travel hulls with original-shape low-poly interpretations,
retain bounded compact geometry and add the desktop/mobile visual evidence.
No program upgrade or authority change is part of this release.

429 isolated frontend/server tests passed, zero failures/skips. Production
TypeScript/Vite build passed with existing bundler warnings. No dependency
manifest or lockfile changes. The test count describes the isolated published
baseline, not the larger unpublished development/security test suite.

Local 1280x900 desktop and measured 390x844 emulated-mobile evidence:
[original-shape model verification](ORIGINAL_HULL_3D_VISUALS_2026-10-26.md).
All 42 detailed/compact rendered regions are nonblank and fully framed;
rotation was confirmed by 1,363 changed sampled pixels. Physical-device,
signed live flight and mainnet testing are not claimed.

## Published Release

Application commit: `21bea54d75b0b1ef8ecf8b145ab0086f5e3113a2`, pushed to the
existing `feat/crypto-ufos-wallet-link` branch in
`SrMessiSOL/GAMESOL-Front-end`.

Immutable production: https://frontend-5b6267t5q-srmessisols-projects.vercel.app.
Main URL: https://chained-universe.vercel.app, explicitly assigned to that
deployment after candidate verification.

[Production receipt](test-runs/restored-fleet-production-2026-10-26.json): all
43 application script/style/image assets have identical hashes between the
immutable deployment and main alias. All fourteen delivered original WebPs
match source bytes. All application JS/CSS match the reproduced build after
linked chunk filename hashes are normalized. Public Vercel metadata and the
existing public-setting line-ending encoding were reproduced in memory only;
no Vercel environment setting was changed. The original asset-host safeguard
was retained: a premature local Vercel build correctly rejected a missing
immutable hostname, so the release used Vercel's hosted build instead.

Shared 3D module: `FleetVessel-C9j4s5-0.js`, SHA256
`b3eb2ec94e4ac3b1b35bd2b570f92be65dd07bf90721567d6e528ed16a6fd06b`.
The read-only RPC genesis check still identifies Solana devnet.

## Live Browser Checks

- Public desktop catalog: all fourteen original images loaded and visibly
  rendered; screenshot inspected, no horizontal overflow.
- Public mobile at measured 390x845 CSS pixels: all fourteen images loaded,
  bounding/layout checks show no horizontal overflow. Scrolled screenshots
  remained blank in the browser tool even after foregrounding; a clean reload
  rendered the mobile hero. Do not count the public mobile fleet screenshot as
  a completed visual pass. No application paint failure was established.
- Existing G6tR...7s6r session restored without sign-in or Quick Play renewal.
  Actual shipyard inspected on desktop and at measured 390x845 mobile width.
  All fourteen blueprint artwork bindings use the restored originals. Mobile
  modal width 374px at x=8px; scrolling and original-image framing verified.
- Main game reported zero in-flight routes and one mission awaiting resolution.
  It was left untouched. No new live moving-fleet receipt is claimed. The 3D
  module is verified by build comparison plus the prior 42-capture local checks.
- Browser control subsequently requested a Chrome extension update, blocking
  further captures and the attempted final viewport reset. Temporary test tabs
  are not production configuration changes.

Screenshots actually verified:
[public desktop](test-runs/restored-fleet-live-2026-10-26/public-desktop.png),
[desktop shipyard](test-runs/restored-fleet-live-2026-10-26/game-shipyard-desktop.png),
[mobile shipyard](test-runs/restored-fleet-live-2026-10-26/game-shipyard-mobile.png).

Final isolated suite rerun: 429 passed, zero failed/skipped. Hosted production
build passed. Deployment/source changes contain no API, dependency manifest,
lockfile, wallet, transaction, economy or program changes. Scheduled automation
was re-read as PAUSED and left unchanged. Zero spending, game transactions,
program upgrades, authority changes or mainnet actions.
