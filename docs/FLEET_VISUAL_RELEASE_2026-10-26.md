# Fleet Visual Release Candidate

## Baseline And Scope

- Isolated checkout: `C:/solargrid-v9/releases/fleet-visual-2026-10-26`.
- GitHub baseline: `1cbde112a351b93ba7b201a75ac231f07dd446de`.
- Original dirty development checkout was not reset or committed.
- Includes public cinematic page, native-scroll fix, 14 optimized ship images,
  shared hangar/space artwork, class-specific lightweight navigation models,
  stable galaxy endpoints and bounded traffic rendering.
- Preserves published colony, protected-attack and defense guards.
- Does not copy unpublished API/security, dependency-migration or economy changes.
- The stale published defense-catalog test fixture was corrected to include item
  indices; an unsupported-missile regression was added. Runtime rules unchanged.

## Verification

- Exact baseline lockfile installed with npm ci; no package manifest changes.
- TypeScript and production build passed using Vite 8.0.16.
- Final candidate suite: 425 passed, zero failed/skipped; 96781.6793 ms.
- Initial run: 422/423 passed, with only the stale catalog fixture failing.
- Preview build succeeded:
  https://frontend-3mvbp1azo-srmessisols-projects.vercel.app/
- Preview desktop 1440x900 and emulated mobile 390x844: all 14 catalog images
  loaded and visibly rendered; no horizontal overflow or clipped catalog text.
- Native mobile scrolling moved from 0 to 844 and advanced the universe scene.
- Screenshot evidence: `test-runs/fleet-preview-2026-10-26/`.
- Authenticated G6tR...7s6r shipyard checked at 1440x900 and 390x844, including
  all 14 blueprints, locked hulls and unaffordable controls.
- Real fleet operations exposed intrinsic-size mission images. Fixed badge
  dimensions to 64x64 and contained images at 100%; selector images stay 40x40.
  Added a regression; rebuilt Preview and verified actual desktop/mobile views.
- Corrected Preview:
  https://frontend-abeebynh1-srmessisols-projects.vercel.app/
- Existing stable QA alias now serves the corrected Preview:
  https://gamesol-devnet-qa.vercel.app/app
- Existing QA account restored without a second sign-in. No purchase,
  authorization renewal, arrival resolution or game command submitted.
- Actual system, galaxy and universe scenes checked at both viewport sizes.
  Screenshot scene-region samples were nonblank (not direct GPU-buffer reads).
  No in-flight missions were present; class-specific moving models retain the
  previously documented local fixture/14-model evidence, not new flight receipts.
- A separate commander NFT image fell back to Artwork unavailable in QA.
  NFT service/client and all API files remain unchanged from the published
  baseline. This ship-art release does not certify NFT-service availability.

## Publication Boundary

Preview checks complete; GitHub/production publication pending. No Solana
program upgrade, authority change, token spending or scheduled-automation change.
Existing security/mainnet release gates remain separate and are not certified.
