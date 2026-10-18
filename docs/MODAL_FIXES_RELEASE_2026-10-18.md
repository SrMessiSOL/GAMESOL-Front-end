# Modal consistency fixes - October 18, 2026

## Changes

- Refresh SOL/token balances when opening account/funds and after confirmed
  marketplace operations or confirmed delayed planet-purchase recovery.
- Ignore old account responses and older overlapping token/SOL refreshes. Failed
  SOL reads preserve the last confirmed value rather than displaying zero.
- Command-modal focus restores after the DOM commit, without waiting for a
  potentially throttled animation frame. Remounted/hidden openers fall back to
  the corresponding live command button or mobile More control.
- Funds dismissal falls back to the visible account trigger when its original
  Manage Funds button has been unmounted. Account-menu return focus also avoids
  a background animation-frame dependency.
- Fleet cargo labels and exact input limits now use the same projected resource
  object as the resource header and mission preflight. No resource grant,
  economy, backend/program or authority change.

## Before publication

- Full frontend/server suite: 300 passed, zero failed/skipped. Includes actual
  refresh callbacks, account/response races, actual funds cleanup, actual cargo
  JSX with bigint limits and existing resource-projection edge cases.
- Local TypeScript/Vite build and final Vercel Preview build passed. Existing
  chunk-size/deprecation warnings remain, unrelated to these narrow changes.
- Final Preview: `frontend-qdvj9cn1m-srmessisols-projects.vercel.app`, stable
  `gamesol-devnet-qa.vercel.app`; existing NewAccount login retained.
- Five desktop command closures returned focus correctly: Research, Shipyard,
  Defenses, Quests and Reports. Facilities fallback also verified.
- Funds dismissal returned focus to the account trigger on desktop/system and
  mobile/planet views. Mobile Research returned to Research; Store via More
  returned to More. Narrow page width/scroll width 390, height 844.
- Account/funds opening displayed verified NewAccount balance 1 AM without manual
  refresh. Zero-USDC store purchase controls and empty withdrawal review disabled.
- Preview NewAccount has no ships or USDC. Do not claim a live cargo form or
  funded nested review was exercised with this account; actual cargo JSX and
  projection tests passed. Public Default read-only smoke follows publication.
- `modal-fixes-qa-mobile.jpg` captures the final mobile funds modal.

No USDC or ANTIMATTER spending, signature or gameplay command in this pass.
Physical-device wallet flows and a new post-purchase live transaction remain
outside this UI-only pass. Mainnet readiness is not implied.

## Publication

- Runtime commit `471024b` pushed to `feat/crypto-ufos-wallet-link`.
- Production build passed with QA interruption disabled. Public alias now points
  to `frontend-ecwi9wb35-srmessisols-projects.vercel.app`; actual browser entry
  verified as `assets/index-DziAFesN.js` on that immutable host.
- Public Default account restored #513 and both worlds. Opening Player account
  showed 4,728,251.98 AM and 100.5 USDC without manual balance refresh.
- Live cargo form checked on desktop and 390-CSS-pixel mobile viewport. In one
  simultaneous snapshot the header, cargo labels and input max values all agreed:
  35,963 metal, 79,273 crystal, 21,635 deuterium. Subsequent estimates advanced
  together normally. No ships selected or mission launched.
- Funded Default store review inspected on desktop/mobile. Mobile Escape and
  desktop Cancel each dismissed only the inner review and restored the Review
  button focus. Buy was never clicked. Temporary viewport reset afterward.
- Finalized slot 512538084: Default AM 4728251982500 raw, NewAccount 1000000,
  treasury 9476422017500, unchanged from the pretest checkpoint. Default USDC
  remains 100500000 raw. Latest colony purchase signature is unchanged.
- Evidence: `modal-fixes-public-fleet-desktop.jpg`,
  `modal-fixes-public-fleet-mobile.jpg`, `modal-fixes-public-review-desktop.jpg`,
  `modal-fixes-public-review-mobile.jpg`.
- The original three findings are resolved by this release. No new live market
  purchase was submitted to recheck the post-payment refresh trigger; that path
  has regression coverage, while account-opening and modal/cargo behavior have
  the live evidence above. No USDC or ANTIMATTER spent.
