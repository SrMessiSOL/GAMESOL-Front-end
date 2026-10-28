# Navigation and traveling ships acceptance

Scope: frontend only; devnet; scheduled automation remains PAUSED.

## Changes

- Collapse navigation details when entering a phone viewport, including desktop-to-phone resizing.
- Bound expanded phone details to 40% of viewport height with an independently scrollable body; retain 44px toggle targets, Escape dismissal, and focus return.
- Improve distant ship and route visibility in system, galaxy, and universe views. Preserve ship geometry, class-size hierarchy, equipped-skin ownership checks, and gameplay timing.
- Reduce the common display scale in crowded views. Retain the existing 32-route rendering cap.

## Local acceptance

- Full test suite: 448 passed, zero failed, skipped, or cancelled. See `test-runs/navigation-scene-full.log`.
- Final TypeScript and production build passed. See `test-runs/navigation-scene-final-build.log`.
- Chrome desktop 1440x900; mobile 390x844; short mobile 390x520.
- System, galaxy and universe scenes visibly rendered ships and paths. Phone navigation initially collapsed and remained collapsed after refresh.
- Mobile collapsed panel: 58.67px. Expanded panel: 324px at 844px height, 212px at 520px height (including borders). Expanded content scrolled; Escape restored toggle focus.
- Document width 390px at the 390px viewport: no horizontal page overflow.
- Deterministic local traffic fixtures exercised four routes and 200 missions with 32 mapped routes. No console errors observed. Fixture routes are not real on-chain missions and are development-only.
- Screenshots retained locally under `test-runs/navigation-scene/`.

No mission launched, purchase made, token spent, authority changed, or program deployed for this UI verification.

## Published verification

- App commit: `e1d9e14`, branch `feat/crypto-ufos-wallet-link`.
- Deployment: `https://frontend-674twv7xs-srmessisols-projects.vercel.app`.
- Public alias: `https://chained-universe.vercel.app/app`.
- Public alias and immutable deployment serve identical hashes for all 31 application assets checked by the existing release verifier.
- Devnet genesis verified; cosmetics owned mask 10 and equipped Ion Battlecruiser retained. Read-only balance check: 96.501 test USDC; no transactions submitted.
- Live Chrome desktop and 390x845 phone screenshots checked. Phone collapsed panel 58px, expanded 323px, scrollable body 264px with 396px content. Document width 390px. No console errors observed.
- Live account had zero in-flight routes; moving traffic coverage above used development fixtures, not a new live flight.
- Scheduled checklist automation configuration rechecked: PAUSED.
