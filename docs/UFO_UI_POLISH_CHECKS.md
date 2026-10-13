# UFO Expedition UI Checks

Checked October 12, 2026 on the staged deployment
`frontend-c0vu8tugr-srmessisols-projects.vercel.app`.

## Changes

- Separate UFO and fleet tabs keep both views mounted.
- Stable real commander portrait during same-wallet ownership reads.
- Cached artwork is cosmetic only; checking, unavailable, or expired ownership blocks utility.
- Utility authorization binds the commander, holder, selected asset, and connection epoch, with the server expiry enforced before submission.
- Compact expedition progress, booster state, loot controls, and explicit abort confirmation.

## Evidence

- 86 automated tests passed; standalone paymaster policy checks passed.
- TypeScript and Vercel cloud build passed.
- Actual staged game inspected at desktop and 390 x 844 mobile viewport.
- Fleet metrics align; mobile page width is 390 with no horizontal overflow.
- Real Solflare holder BTwMe...1BaHG selected Crypto UFO #513.
- Real portrait remained present with `data-ownership=checking` during refresh.
- Full browser refresh restored #513 after fresh ownership lookup.
- Previously earned Ecosystem expedition badge remained equipped, with one completed expedition and its cooldown intact.

## Boundaries

Wallet switching, delayed responses, confirmed ownership loss, unavailable reads,
and authorization expiry were automated tests, not real NFT sales or transfers.
No new expedition, purchase, or game transaction was submitted during this check.
Active encounter states were not visually checked because the real mission was
already complete and its 24-hour cooldown was respected. Mainnet is unchanged.

Local screenshots are in `.vercel/ui-check`, excluded from publication.
