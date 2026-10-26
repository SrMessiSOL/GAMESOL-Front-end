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

Production deployment, immutable/main-alias checks and live browser results
will be recorded separately after publication. Scheduled automation stays
PAUSED. No token spending, game transaction or mainnet action authorized.
