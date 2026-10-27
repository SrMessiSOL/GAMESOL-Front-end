# Ship cosmetics: first implementation

The tested program is now upgraded and configured on devnet with unchanged
authorities. See `COSMETICS_DEVNET_UPGRADE_2026-10-27.md`. Local-validator cases
passed; the live Lazor Ion purchase/equip and page-refresh restoration also
passed. Exactly 1 test USDC was spent, with no duplicate successful purchase.
The cosmetics frontend release is now approved; no mainnet action is authorized.

## Implemented

- Anchor source: experiments/passkey-ufo-release/programs/game-state/src/ship_cosmetics.rs.
- Commander-bound inventory PDA: `ship_cosmetics` + commander public key.
- Persistent owned-skin bitset and equipped skin for each of the 14 ship classes.
- Native signer and permanent Lazor vault use the same commander signer contract.
- Atomic SPL-token payment and unlock; an already-owned skin rejects before
  transfer. Concurrent purchases serialize on the inventory account.
- Exact catalog-price binding and revision-bound equipment changes.
- Configuration restricted to the existing game admin; fixed mint and treasury
  accounts bound in each purchase. Test mint must use six decimals.
- Default builds disable every cosmetics write. Explicit development feature:
  `ship-cosmetics-devnet`. Client builders additionally require devnet genesis.
- Client account decoder checks program ownership, PDA, discriminator, commander,
  complete layout and consistency of equipped skins with owned skins.
- Shared 3D materials for Standard, Ion, Scarlet and Solar; no new geometry,
  hitboxes, ship sizes, mission indicators, engine speeds or stat modifiers.
- Supply now contains Resource packs and Ship liveries tabs. Liveries have a
  hangar-backed 3D preview, owned/equipped states, a purchase review, balance
  checks and an explicit per-class Equip action. Refresh and account switching
  restore the current equipment rather than the previously previewed skin.
- Purchases use passkey authorization, not Quick Play. Ownership and equipment
  are read back before confirmation. A submitted payment with an interrupted
  response is reconciled from chain state; an already-owned retry never signs.
- Current configured mint, treasury, payment owner, available funds and inventory
  revision are checked before opening the signer. No optimistic entitlement or
  browser storage is used as proof of purchase.

Prototype prices are 1, 2 and 3 test tokens respectively, not approved mainnet
pricing. These are GAMESOL liveries, not third-party branded partnerships.

## Remaining Gates

- Travel integration is implemented and locally verified; see
  `TRAVEL_COSMETICS_2026-10-27.md`. It is not published or deployed.
- Independent-browser restoration remains a separate check. Same-browser page
  refresh and on-chain restoration passed after the real Lazor purchase/equip.
- Agent cosmetics endpoints and optional separately scoped Quick Play equipment
  authorization remain out of scope. Purchases must not silently gain it.
- No mainnet release is authorized. Frontend publication was separately approved.

No browser storage is an ownership source. No database is introduced.
Scheduled automation remains PAUSED.

## Local Evidence

- 16 client/render tests passed, zero failures or skips:
  `docs/test-runs/ship-cosmetics-client-2026-10-26.log`.
- Frontend production build passed:
  `docs/test-runs/ship-cosmetics-build-2026-10-26.log`.
- Both new Rust unit tests passed: catalog/ownership boundaries, revision-safe
  equipment, stale-price rejection, duplicate-purchase rejection and overflow.
  `docs/test-runs/ship-cosmetics-rust-2026-10-26.log`.
- These are host unit tests, not SBF or local-validator payment receipts.
- All 82 tests in the successfully compiled game-program executable passed.
  Receipt: `docs/test-runs/ship-cosmetics-all-rust-executable-2026-10-26.log`.
  A redundant Cargo rebuild was stopped; this suite ran the exact executable
  produced by the successful feature-enabled compile above.

## Store And Validator Acceptance - 2026-10-27 UTC

- Feature-enabled SBF build passed; no exceeded-stack diagnostics.
  SHA256: `eb233bec110551e379ec0d855277b35d352deb81e21b69a4da20f67d421a58fb`.
- All 16 isolated-validator cases passed. Exact prices, ownership, independent
  equipment reads, duplicate signed requests, distinct concurrent purchases,
  stale prices, insufficient funds/atomic rollback, unowned equipment, other
  players' inventory, wrong payment ownership/treasury, stale/concurrent equipment
  revisions, free unequip, invalid IDs and disabled-store rejection were checked.
- Initial validator treasury received exactly 4 local test tokens. Rejected
  transactions did not transfer tokens; failed transactions may still pay local
  validator network fees, which are not purchase charges.
- Desktop UI bought Solar once for 3 local test tokens: Player One 19 -> 16.
  Equipped Solar on Battlecruiser and restored it after refresh/account switching.
- The real frontend controller then bought Scarlet for 2 local test tokens with
  confirmation deliberately interrupted after landing. Recovery and retry used
  exactly one send. Player One ended at 14; treasury ended at 9. All three
  original PlayerProfile accounts remained byte-identical.
- 30 focused client, renderer, store and modal tests passed, zero skips/failures.
- Full frontend/server suite: 496 passed, zero failures/skips. The first run's
  two local mock-socket permission errors were resolved by rerunning with local
  network access; no game-code workaround or test exclusion was used.
  `docs/test-runs/ship-cosmetics-full-regression-network-2026-10-27.log`.
- Frontend production build passed. The disposable-wallet bridge and its route
  were checked absent from the production JS output.
- Desktop 1280x900 and mobile 390x844: no horizontal overflow, loaded artwork,
  visible/framed ship, mobile scrolling, keyboard focus wrapping/Escape return,
  responsive purchase review and low-funds blocking verified.
- Pixel checks observed 2,770 changed center-canvas samples between Solar and Ion
  and 8,220 after orbit interaction, confirming nonblank, interactive 3D content.
- Local-only bridge binds loopback, restricts Origin to the local review address,
  accepts only known cosmetic actions/players, and never loads a user wallet.

Receipts: `docs/test-runs/ship-cosmetics-local-2026-10-27/`.
Screenshots/pixel checks: `docs/test-runs/ship-cosmetics-ui-2026-10-27/`.
Local review: `http://127.0.0.1:4198/ship-cosmetics-local` while the isolated
validator/bridge are running. This is not the public game or a devnet deployment.
