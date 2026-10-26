# Public Website Cinematic Journey - Local Candidate

Scope: public `/` only, inspired by the scroll-world presentation technique.
Uses existing GAMESOL artwork and the installed React Three Fiber/Three.js
stack. No third-party skill was installed and no paid asset generation ran.

## Changes

- Four scroll chapters: universe, galaxy, fleet transit and homeworld orbit.
- Scroll-bound camera approach, textured rotating world and fleet formation.
- Chapter navigation, animation pause/resume and reduced-motion default.
- Static artwork fallback for unavailable/lost WebGL or scene errors.
- Responsive economy/strategy content, devnet disclaimer and game/market links.
- Public entry does not initialize wallet, NFT or game providers. Existing
  initialization moved intact to `src/game-bootstrap.tsx` for non-root routes.
- Gameplay, programs, authorities, wallet records and balances are unchanged.

## Verification

- TypeScript and production build passed. Existing chunk-size, Vite config and
  ineffective CryptoUfos dynamic-import warnings remain; no build errors.
- Five focused public-entry and deployment-asset tests passed, none skipped.
- Real local-browser checks at 1280x720 desktop and 390x844 phone dimensions:
  chapter links, camera approach, pause/resume, Explore anchor, image loading,
  no horizontal overflow, footer navigation and hidden chapter controls after
  the journey. Screenshots are in `test-runs/public-world-2026-10-26/`.
- Chrome background screenshot capture stalled; final reliable checks used
  the in-app browser. This does not certify physical-device performance.
- Screenshot pixel sampling of the right-side scene region was nonblank:
  desktop hero 1237/3024 samples; desktop planet 2999/3024; mobile hero
  430/1088; mobile planet 1042/1088. These are rendered screenshot samples,
  not direct GPU-buffer reads (the browser tool does not expose those).
- `/app` smoke test reached the live devnet universe and START PLAYING entry.
  No sign-in, passkey, game command or payment was performed.

## Release Boundary

## Native Scrolling Correction

User follow-up exposed a missed acceptance case: the initial checks exercised
chapter anchors, not native wheel scrolling. `index.html` applies global
`body { overflow: hidden }` for the game, which blocked normal scrolling on `/`.
The root entry now adds `public-document` only on `/`. Scoped rules restore
document/body/root height and vertical overflow; the decorative canvas cannot
intercept pointer or touch input. The game keeps its original scroll lock.

Six focused tests pass, including a regression for these scoped overrides.
Actual browser scroll input, without chapter navigation for the movement step,
advanced desktop from 0 to 720px at 1280x720 and phone from 0 to 844px at 390x844.
Both updated the active chapter to galaxy. Receipts:
`test-runs/public-world-2026-10-26/desktop-scroll-fixed.jpg` and
`test-runs/public-world-2026-10-26/mobile-scroll-fixed.jpg`.
Phone is viewport emulation, not a physical touch-device test. Not published.

## Preview

Local preview: http://127.0.0.1:4197/

Not committed, pushed or deployed. This checkout contains unrelated security
and gameplay changes; do not publish the whole worktree as part of this visual
change. Existing hosted security-configuration release gates still apply.
Scheduled automation remains untouched; no mainnet or spending actions occurred.
