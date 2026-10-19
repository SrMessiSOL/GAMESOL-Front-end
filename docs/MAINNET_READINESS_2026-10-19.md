# GAMESOL readiness - October 19, 2026

## Decision

NOT CLEARED FOR MAINNET. This is the latest checklist, supplementing the
October 18 evidence rather than treating historical passes as fresh tests.
The initial read-only pass submitted no transactions. The completed follow-up
below collected the ship and published a frontend fix, with sponsored devnet
fees and no USDC/ANTIMATTER spending. No mainnet or authority change occurred.

## Fresh devnet results

### Latest completed follow-up

Quick Play stale-status fix passed 373 tests and desktop/mobile account-modal
checks, and is published as source commit 9a39a83. QA restored ON after refresh,
after ship collection and after the final build update without another renewal.
The existing Colony Ship was collected in finalized slot 512865656, signature
4rdLC4pjAHQ8oY2yopMBmzHs8VVrs9gAHyKJm3afBhRkfM1SGx4TkjjurrF8v2hxTYPJajEuNsCTQdmwJ2X6kXQF.
Checkpoint 512865697 confirms one Colony Ship, empty shipyard queue and zero
missions. Duplicate collection rejects NoShipBuild in an unsigned simulation.
See QUICK_PLAY_EXPIRY_STATUS_2026-10-19.md for publication and test boundaries.
This supersedes the failed-test/queued-ship status below, retained as history.

- Public frontend: command-guard release on chained-universe.vercel.app.
- Devnet genesis verified before the RPC checks.
- 26 client/program preflight checks passed at slot 512859679: eight allowed
  commands and 18 invalid commands blocked. Watched accounts stayed unchanged.
- Three infrastructure guards passed: duplicate monthly claim, non-leader
  upgrade and unfunded Research Grid upgrade all rejected.
- Three alliance permission guards passed: member expulsion, member leadership
  transfer and leader departure all rejected.
- Five planet market guards passed: two completed purchases and two consumed
  approvals reject replay; the former owner cannot reuse transferred ownership.
- Total: 37 successful unsigned simulations/client checks. Signature checking
  was disabled for simulations. These do NOT prove new signed execution,
  authentication or settlement. No tests in this list submitted a transaction.
- Finalized batch at slot 512860131: all three controlled planets have zero
  active missions. Default owns 9:427:13 and 9:427:1; NewAccount owns 6:35:11.
  Default's homeworld has 20 fighters, one small cargo and two probes.
- Live commander portrait #513 is visible without a new ownership signature.
  This observation alone is not a fresh on-chain avatar-save verification.

### Failed live test: stale Quick Play status

The Default account menu displayed QUICK PLAY ON. Clicking FINISH for the ready
Colony Ship was safely rejected with:

> Quick Play session expired. Turn it on again before continuing. No command was submitted.

The menu still displayed ON after closing the failure. The ship remains queued
(item 12); on-chain colonyShip inventory is zero. Do not mark collection passed.

Source inspection: usePasskeyGameplayVault refreshes on initial account load,
activation/revocation and successful execution. A rejection from
executeWithPlayerSession skips the success-only refresh, leaving the displayed
session flag stale. The execution-time on-chain check correctly blocks expiry.
No workaround should extend the eight-hour permission or bypass that check.

Required follow-up: refresh session state after failed execution and on return
to an idle tab, test expired/revoked sessions and account-switch races, then
renew through the user's passkey and collect the existing ship exactly once.
Follow-up implementation and 373 passing tests are recorded in
`QUICK_PLAY_EXPIRY_STATUS_2026-10-19.md`. The isolated Preview is deployed;
final signed-in collection/refresh and publication checks remain pending.

Reload retest: the same signed-in account then correctly displayed QUICK PLAY
OFF, while #513 restored without another wallet connection or ownership
signature. This isolates the visible defect to stale mounted-session state,
not a failure to restore the signed-in account or commander portrait.
Evidence: `devnet-expired-session-refresh-2026-10-19.png`.

## Previously Completed Live Coverage

Retained from the October 18 checklist and linked receipts, not rerun today:

- Colonization, transport delivery/return and mission-slot release.
- Espionage reports and probe return.
- Resource market listing, cancellation, purchase and settlement.
- Planet market roundtrip, owner registry/index updates and 0.25% settlement fee.
- Lazor approval expiry/rent reclaim and submitted-payment tab-reopen recovery.
- Alliance creation, applications, rejection/approval, leave/expulsion/rejoin,
  leadership transfer both ways and treasury synchronization.
- Four alliance infrastructure upgrades and their on-chain bonuses.
- UFO expedition, booster consumption, loot/equipment and avatar restoration.
- Latest published guard release previously passed 366 automated tests and
  desktop/mobile viewport checks; the full suite was not rerun in this pass.

## Remaining Gameplay And Recovery Tests

| Area | Still required | Boundary |
| --- | --- | --- |
| Quick Play | Stale ON fix published; remaining final-release browser restart, live elapsed expiry/revocation and isolation cases | Refresh passed live; expiry/race logic covered in automated tests |
| Ready ship | Completed: inventory 1, queue empty, duplicate collection rejected | Finalized collection plus unsigned rejection simulation |
| Controlled combat | Eligible attack, arrival, outcomes, losses, loot, reports, return, duplicate resolution | Protection ends October 21 at 19:28:55 UTC / 16:28:55 Buenos Aires per prior checkpoint; re-read before attacking; check same-alliance restrictions |
| Market races | Live purchase/cancel and stale-price races with exact-one settlement | Local-validator races already passed, not live Lazor proof |
| Payment recovery | Full Chrome-process interruption and remaining payment-boundary interruptions | Tab close/reopen is already covered; not equivalent to process crash |
| Wallet funds | Each supported withdrawal asset, cancellation and reconciliation | Bound amounts and destinations before transfer |
| Store | Full daily/weekly/monthly cap/reset matrix; balance/storage changes between review and approval | Overflow guards passed today; shield packs remain disabled because deployed program rejects them |
| Quests | Full duplicate, wrong-world, storage and completion matrix | Some guards covered; not every live reward scenario |
| UFO utility | Ownership loss/reacquisition, unlink, stale proofs and utility revocation | Use fixtures first; no real mainnet NFT transfer without separate approval |
| Alliance sync | Open-tab leadership/membership changes and permission refresh across accounts | Treasury sync alone does not prove all role-change cases |
| Mobile | Real device wallets/passkeys: cancel, resume, reconnect, background and restart | Responsive desktop viewports are not physical-device proof |
| Governance | Complete authorized lifecycle/executor tests or exclude from launch | Keep disabled until separately cleared |

## Mainnet Release Gates

1. Independent security review and remediation: replay, account binding,
   sponsor abuse, ownership attestation and cross-program authorization.
2. Reproducible final binaries; Anchor/SBF/stack and local-validator release
   rehearsal; verify deployed binaries against the final source candidate.
3. Mainnet program IDs, cross-program constants, mints, genuine network USDC,
   treasuries, starting economy, authorities and custody reviewed explicitly.
4. Mainnet sponsor allowlists, budgets, rate limits, monitoring and abuse limits.
   Do not remove devnet-only protections without a separately reviewed policy.
5. Mainnet NFT utility attestor domain, key custody and expiry/revocation policy.
6. Mainnet-specific lookup manifests and genesis checks; no devnet address reuse.
7. Current dependency advisory disposition, final build and deployment smoke tests.
8. Funding alerts, incident response, recovery and authority/rollback runbooks.
9. Separate approval for token issuance, fundraising and mainnet deployment.

## Next Order

Quick Play UI fix and existing ship collection are complete. Next run the
remaining recovery/store/role-sync cases with bounded test actions. Controlled
combat must wait for legitimate target eligibility. Mainnet is not approved.
