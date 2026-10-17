# GAMESOL Mainnet Readiness - Updated October 17, 2026

## Decision

Not cleared for mainnet. This is a source review and devnet evidence checkpoint,
not an independent security audit or proof that every game mechanic works.
The initial source assessment was read-only. The subsequent authorized devnet
settlement round spent 1 test ANTIMATTER and zero USDC. Its frozen public lookup
table cost 0.00647676 test SOL, below the separate 0.02 test SOL cap. No mainnet
action or program/token authority change occurred.

## Current verified baseline

- Public game: https://chained-universe.vercel.app/app.
- Published frontend code: `35b6fd7` (buyer packet compression and post-approval
  blockhash refresh); includes per-account Quick Play, avatar restoration and
  prerequisite parity.
- Game program: `J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq`.
- Market program: `6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA`.
- Both are executable on verified Solana devnet. Their current upgrade authority
  is `EhT4UUmsHyd41bZSGzj1W72yu2EptHk8sEvnK7aaNuBu`. This identifies the
  on-chain authority, not its human controller, custody security or mainnet plan.
- Current source `declare_id!` values match these active programs. The older
  `../backend/docs/mainnet-readiness.md` lists FJG/Dow devnet addresses and must
  not be followed as the current deployment runbook.
- Homeworld: 20 fighters, one Small Cargo, two Espionage Probes, empty ship queue,
  zero active/occupied missions. No flight or combat was launched in this run.
- Existing evidence covers construction/research, colony creation, transport
  delivery/return, espionage report/return, market listing/cancellation, alliance
  creation and leave/reapply/reject/reapply/approval. See DEVNET_TEST_MATRIX.md
  for signatures and the distinction between real execution and simulation.

## Checks refreshed now

- Full frontend/server regression suite: 210 tests passed.
- Real buyer settlement finalized in transaction
  `2vGNgoTQbkiMN3bjjfTA1CSHRWi5KGdZwkuiEfAtnhYwZz42ujpn7kB52F9W6sA64TAP5i3bjL1VN8aSmM72gDGA`.
  Independent receipt and baseline checks verify buyer -1 ANTIMATTER, seller
  +0.9975, treasury +0.0025, 1,000 metal delivery, and closed offer. Seller ATA
  creation was included. See MARKET_BUYER_PACKET_2026-10-16.md.
- Both tested program upgrades were deployed and binary-verified on devnet;
  authorities stayed unchanged. See the release checkout's
  `docs/DEVNET_UPGRADE_2026-10-16.md` for hashes, receipts and budget accounting.
- Signed post-upgrade probe build/collection and market create/cancel passed;
  cancellation finalized and released the locked 1,000 metal. Avatar restoration
  and loaded real artwork passed desktop/mobile refresh checks before publishing.
- Production dependency audit: 13 moderate, zero high, zero critical findings.
  Moderate findings remain open; this does not establish contract security.
- Unsigned devnet replay simulations reject completed transport return with
  InvalidMission, fighter collection with NoShipBuild, and cancelled market
  offer/rejected application/approved application with AccountNotInitialized.
  Filled-offer replay also rejects with AccountNotInitialized. Every referenced
  account's data and lamports remain unchanged. Closed-account results
  prove closed-account rejection, not a later business-rule check.
- Reproduction: `node server/check-completed-action-replays.cjs`. It never
  signs or sends. These simulations do not test wallet signature authentication,
  successful buyer settlement or new user actions.

## Outstanding Gameplay Gates

| Gate | Remaining work | Current constraint |
| --- | --- | --- |
| Controlled combat | Real attack, resolution, losses/loot, return, report and replay checks against the controlled defender | NewAccount protection ends October 21 at 16:28:55 Buenos Aires; no bypass. Review same-alliance targeting rules before that test. |
| Market adversarial coverage | Live success, first-seller ATA setup, exact token deltas, delivery, closure and closed-offer replay passed. Retain separate local-validator invalid-buyer and rollback evidence; broader live adversarial cases are not certified. | Round spent 1 of 2 approved test ANTIMATTER and 0 of 1 test USDC. Do not create another order just to consume the allowance. |
| Planet sales | Ownership transfer, registry/index updates, outstanding obligation restrictions and seller access revocation | Not executed; requires a separately bounded transfer test. |
| Alliance infrastructure | Real contributions for other resources, upgrade cost/balance/benefit checks and leadership transfer/expulsion | Upgrades require ANTIMATTER and remain excluded. Membership lifecycle is complete. |
| Governance/sovereignty | Decide launch scope; if included, rehearse proposal lifecycle, executor permissions and failure paths | Source feature flags default off. No governance activation or authority change authorized. |
| NFT ownership transitions | Real transfer-out/transfer-back or equivalent approved two-wallet rehearsal, expiry/revocation and cross-account checks | Unit coverage exists; no NFT transfer or forced live expiry was performed here. |
| Wallet funds | Bounded real deposit/withdrawal and cancellation/reconciliation checks | Requires explicit destination, amount and owner approval; not part of no-spend tests. |

## Engineering And Deployment Gates

1. Backend prerequisite parity is deployed and verified: both paths share the
   active ship rules (probe Computer Technology 2; colony Astrophysics 3).
   Both frontend ship tables agree and are published. Native tests, SBF stack
   diagnostics and local-validator prerequisite/market rehearsals passed before
   the devnet upgrades. These do not replace an independent security review.
2. Obtain independent program and privileged-path review, and repeat reproducible
   final SBF builds, source/binary hashes and validator rehearsal for the exact
   mainnet release candidate. Devnet binaries are not mainnet deployment proof.
3. Define final mainnet program IDs, cross-program constants, ANTIMATTER mint,
   canonical USDC mint, treasury accounts, store initialization/economy values
   and upgrade/admin custody. Verify each against final on-chain configuration.
   `.env.mainnet.example` deliberately leaves program/mint values empty.
4. Prepare a mainnet-compatible Lazor sponsorship/fee policy. The deployed
   `api/lazor-paymaster.js` rejects non-devnet genesis; do not simply remove that
   guard or reuse the devnet payer. Review limits, abuse protection and funding.
5. Prepare a separately reviewed mainnet NFT attestor setup and proof domain.
   `server/ufo-attestations.cjs` rejects non-devnet games and uses devnet proof
   domains. Mainnet NFT reading is not mainnet game eligibility authorization.
6. Provision/review mainnet lookup tables, policies and manifests. The existing
   alliance table explicitly pins devnet genesis, program and sponsor addresses;
   a devnet address table does not carry over to another cluster.
7. Close or explicitly accept the remaining moderate dependency findings and
   build warnings. Retain separate reviews for browser, server and native paths.
8. Finish the signed deployment/initialization runbook, backup/recovery and
   incident procedures, monitoring and rollback/upgrade authority policy.
   Token issuance/fundraising, mainnet deployment and authority changes require
   their own approval; devnet success does not authorize them.

## Next Safe Work

Without token spending, continue backend parity review, final-binary review and
test preparation, moderation of the remaining advisory findings, and mainnet
configuration/runbook preparation. Do not mark buyer settlement, upgrades,
withdrawal or controlled combat complete from unsigned rejection simulations.
