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

Final deployment and public smoke results will be recorded after completion.
