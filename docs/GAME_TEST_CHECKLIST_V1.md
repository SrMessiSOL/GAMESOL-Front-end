# GAMESOL Fixed Test Checklist V1

Scope frozen: 2026-10-19. This is the canonical completion checklist, replacing
the changing remaining-work lists. It covers the current source, not future
features. This review submitted no transactions and published nothing.

## How To Read This

2026-10-24 advanced-ship and controlled-combat readiness:
[three-agent unsigned gates and protected-launch fix](AGENT_ADVANCED_COMBAT_GATES_2026-10-24.md).
All 14 hulls across all three agents were checked against the deployed program:
23 prerequisite rejections, 14 crystal shortages and five metal shortages.
Four protected-target attacks incorrectly returned unsigned transactions before
the shared SDK fix; all six directions now reject before signing. State and
SOL/AM/USDC balances stayed unchanged; zero submissions. Agent API tests: 92/92.
Positive combat remains blocked until shields expire (earliest paired homeworld
window October 26, 15:52:58 Argentina time). Hyperspace Drive remains 2 / 2 / 1.
Existing T08/T10/T14/T35 evidence only; completion statuses unchanged.
Automation PAUSED. No program upgrade, authority change or mainnet action.

Alliance fixed-level/price candidate (2026-10-19):
[local protection report](ALLIANCE_UPGRADE_PROTECTION_2026-10-19.md).
LOCAL: 125 protected SBF level/cap/rollback cases and 12 concurrent/recovery
scenarios passed. SDK and both UI actions bind the approved level and four
maximum prices. This adds T20/T27/T35 evidence without closing those families.
The candidate is now deployed and byte-for-byte verified: signer, authority,
budget and seven deployed guard simulations plus two finalized rejection
transactions passed. See the report for the exact boundary: funded devnet
upgrade races/replay and interactive Lazor execution remain follow-ups.
Matching frontend code is published as `dcf2df3`; main URL verification matches
nine assets to its production deployment and confirms the devnet genesis.
Scheduled automation remains PAUSED.

Cap-only release verification (2026-10-19): [desktop/mobile report](ALLIANCE_CAP_RELEASE_2026-10-19.md).
The actual infrastructure controls were viewport-checked at level 24/25;
capped commands block before signing and no level-26 quote is shown. The clean
release passed 382 tests and production build. This adds T20/T28 evidence, not
family completion. Scheduled automated work remains PAUSED.

2026-10-19 agent execution supplement: [three concurrent agents](THREE_AGENTS_DEVNET_2026-10-19.md).
This adds signed devnet evidence to existing families, not new frozen-scope rows
or a blanket completion claim. Scheduled checklist automation remains PAUSED.

- Completed evidence is retained; it is not a claim of a fresh rerun today.
- LIVE = retained signed devnet execution/state evidence; LOCAL = isolated
  validator; SIM = unsigned deployed-program simulation; AUTO = automated test;
  UI = desktop browser with desktop/mobile viewport checks.
- PARTIAL means the listed passes stand, but the row still has stated gaps.
  OPEN means no sufficient end-to-end completion proof located. BLOCKED means a
  specific external condition prevents the remaining case. None means excluded.
- A feature-family row closes only when its listed remaining checks pass, all
  relevant indexed catalog items have evidence, and its frontend prevents known
  invalid actions before fresh wallet approval. Backend authorization remains
  mandatory. One passing route never certifies its direct/vault counterpart.
- Raw test totals are not a completion percentage. The latest retained full
  frontend run is 380 tests; the backend report records 77 native tests, SBF
  builds, 106 prerequisite validator checks and a separate UFO regression.
  They do not prove every row below.

## Fixed Gameplay Checklist

Inventory verified: **110 entry points (100 game-state, 10 market)**; 13
buildings, 14 ships, 10 research technologies, 10 defenses, 25 store definitions
(22 resource packs plus three disabled shields), four alliance buildings and
six server endpoints. Personal quest source contains 54 base definitions plus
25/23/23 rotating daily/weekly/monthly metric templates. Those are not 125
simultaneously active quests: active selection retains 21 tutorials and daily
check-in, plus 12 slots per rotating period. Legacy base definitions are retained
in the inventory, not silently declared launch-tested.

Every row has a stable ID. The instruction appendix maps every current public
program entry point to exactly one row. The catalog appendix freezes individual
items, including currently locked or hidden items.

| ID | Feature / status | What is already tested | Exact remaining acceptance work |
| --- | --- | --- | --- |
| T01 | Account and planet initialization - PARTIAL | LIVE original and NewAccount homeworlds, colony and ownership indexes; AUTO account-order fixes | Fresh isolated account across direct signer, Lazor and public initialization variants; repeat/recovery, wrong owner/seeds/coordinates, rent shortage and index/public-view repair; preserve existing worlds after refresh |
| T02 | Gameplay vault and rent lifecycle - PARTIAL | LIVE Quick Play activation and gameplay; AUTO session guards | Individually exercise initialize-existing, rotate, extend, revoke and sponsored rent entry points with correct and wrong authorities; no privileged sponsor account creation; revoked/expired signer cannot execute; rent/refund accounting |
| T03 | Sign-in and Quick Play persistence - PARTIAL | LIVE refresh/account switching/restoration in prior releases; AUTO expiry/stale-status fixes | Final-build Chrome process close/reopen; elapsed expiry, explicit revocation, two-account and concurrent-tab isolation; cancellation/retry and idle-tab ON-to-OFF; no renewed approval inside a valid same-origin session |
| T04 | Wallet balances and funds modal - PARTIAL | UI responsive funds/account dialogs, focus/close/scroll; historical bounded transfer | Every supported asset's deposit/withdraw: amount/decimals, wrong network/destination, insufficient balance/rent, cancel, pending, retry, exact once and post-refresh reconciliation; physical-device flows under T30 |
| T05 | Production, energy and storage - PARTIAL | LIVE production/upgrades; AUTO projected accrual; SIM capacity guards | Compare each mine, temperature, energy shortage, fusion fuel consumption and caps to chain over elapsed time; full storage/offline periods, backward/future time abuse, direct/vault parity and rounding/overflow |
| T06 | Buildings - PARTIAL | LIVE mines, power/storage/lab/robotics/shipyard progression; AUTO prerequisites | Every BUILDINGS item: eligible start/finish, exact cost/time/effect, prerequisite boundary, fields/max level, mutual queue locks, early/duplicate finish, malformed index and stale affordability; settle hidden missile-silo availability explicitly |
| T07 | Research - PARTIAL | LIVE energy/drives/computer/astrophysics progression; LOCAL prerequisite checks | Every RESEARCH item: exact start/finish/cost/time and actual resulting effect; network/lab interaction, max/invalid level, queue and prerequisite boundaries, early/duplicate finish, direct/vault parity |
| T08 | Ship construction - PARTIAL | LOCAL all 14 hull threshold successes and failures across typed/vault; LIVE fighters, cargo, probes and Colony Ship collection | Every SHIPS item: full queue-to-inventory cycle, quantity limits/overflow, exact costs/time, shared defense queue lock, early/duplicate finish; confirm special hulls' supported uses rather than assume OGame mechanics |
| T09 | Defense construction - PARTIAL | LIVE Rocket Launcher; AUTO disclosure/prerequisite coverage | Every DEFENSE item: eligible queue/finish and quantities; unique dome limits, missile/silo capacity, invalid/overflow inputs, shared queue and duplicate finishes; document whether missile firing exists before claiming it tested |
| T10 | Fleet launch and slots - PARTIAL | LIVE all four exposed mission types except completed attack; AUTO/SIM ownership, fuel, cargo and slot guards | Exact per-hull mixed-fleet travel/fuel/cargo, speed/slot/coordinate boundaries; wrong source/target/type, same-planet, concurrent launches, all ships debited once; direct/vault route parity |
| T11 | Transport and return - PARTIAL | LIVE delivery, accelerated trip, cargo return and slot release | Zero/empty-return instruction variants, recipient caps and ownership changes in transit, exact cargo/fuel accounting, early/replayed/concurrent arrival and return; refresh/recovery on each leg |
| T12 | Colonization - PARTIAL | LIVE colony creation, owner registry and rewards | Occupied/raced target, capacity threshold and colony limit, ship consumption, wrong slot/type, early/repeated resolution, target initialized mid-flight; exact source/colony state and slot release |
| T13 | Espionage - PARTIAL | LIVE report and probe return | All reveal thresholds, counter-espionage/probe loss, mixed-fleet rules, protection/alliance restrictions, stale target and duplicated resolution; populated report desktop/mobile and direct/vault parity |
| T14 | Combat - BLOCKED | AUTO/local combat coverage is not live settlement proof | Own controlled defender: legitimate shield expiry and alliance eligibility first; win/loss/draw, fleet/defense/shield/tech effects, casualties/loot/caps, exact reports, return/slot, early/replayed resolution and atomic rollback. Historical shield deadline Oct 21 19:28:55 UTC must be re-read |
| T15 | Five AM accelerators - PARTIAL | LIVE mission acceleration; program and client guard coverage retained | Independently test building, research, ship, defense and mission legs: quoted price equals debit, insufficient/invalid mint/account, complete/empty queue, already accelerated, concurrent retry, refresh/recovery and exact timer changes |
| T16 | Personal quests and daily check-in - PARTIAL | LIVE tutorial/daily/monthly rewards; SIM target, replay and storage guards; AUTO streak quote/UTC math | Every frozen tutorial/check-in definition and rotating metric: threshold below/at, correct epoch/bound planet, one claim; real UTC day/week/month transitions, consecutive/gapped/capped streak; signed stale-capacity and interruption recovery; both claim routes |
| T17 | USDC store - PARTIAL | LIVE daily/weekly purchases; 29 SIM store/quest edges and UI guards | Each enabled indexed pack: exact debit/delivery/counters, fit/exact-cap/overflow; fitting monthly duplicate, actual UTC reset, signed stale balance/cap and interrupted authorization/payment recovery. Three shield packs currently rejected: verify all UIs keep disabled; enabling is NEW scope |
| T18 | Alliance membership and leadership - PARTIAL | LIVE create/apply/reject/approve/leave/expel/rejoin, transfer leadership both ways | Direct join versus request policy, both request routes, full/duplicate membership, conflicting/replayed applications, stale leader actions and wrong authority; concurrent updates and exact rent refunds; no unintended fees |
| T19 | Alliance resource/AM treasury - PARTIAL | LIVE contributions, deposit compression, exact state and treasury synchronization; [three-agent follow-up](ALLIANCE_AGENT_INFRASTRUCTURE_2026-10-19.md): zero treasury initialization, mixed-resource/AM funding, three simultaneous 100-AM deposits with exact protocol transfer/ledger/XP, duplicate preflight rejection; AUTO invalid amount bounds | Remaining resource combinations and routes; wrong treasury/owner and atomic rollback variants; initialize-treasury variants; broader concurrent/recovery cases and source-balance settlement boundaries |
| T20 | Four alliance infrastructure upgrades - PARTIAL | [LIVE agents](ALLIANCE_AGENT_INFRASTRUCTURE_2026-10-19.md): four upgrades and bonuses; [higher-level/cap follow-up](ALLIANCE_HIGHER_LEVELS_CAPS_2026-10-19.md): LIVE levels 2/2/2/1, Research 10% XP; LOCAL 125 SBF cases cover all four levels 1-25, rejected 26, max Trade/Defense/Research stacking, shortage/role/treasury guards; AUTO fixes UI/SDK cap 255 -> 25 | Remaining bonus/contribution combinations (including Logistics 25 deposits), direct/vault parity, stale role/quote changes after membership/level updates, concurrent upgrades and interrupted recovery; release-candidate UI checks. Local cap proof does not mean devnet reached cap |
| T21 | Alliance missions - OPEN | Source/UI catalog and shared quest mechanics located; [agent receipts](ALLIANCE_AGENT_INFRASTRUCTURE_2026-10-19.md) for nine mixed weekly, daily metal/deuterium/AM contribution completions and simultaneous AM XP; not enough receipts for the full mission catalog | Each remaining daily/weekly/monthly alliance mission metric/reward: eligibility, membership/role changes, threshold, epoch, one claim, XP/resource caps, reward target, simultaneous claims and reset; retain individual receipts |
| T22 | Commander identity and linked UFO wallet - PARTIAL | LIVE #513 saved/restored, silent ownership checks and real artwork fixes; LOCAL select/clear/reselect and invalid proof tests | Refresh/new browser restoration, clear/reselect and unlink end to end; ownership loss/reacquisition and changed linked wallet; portrait remains independent of utility-proof expiry; no unsolicited repeat signatures. Real mainnet NFT transfer needs separate permission; fixture proof is labeled separately |
| T23 | UFO expeditions, boosters and loot - PARTIAL | LIVE expedition/booster/loot/equipment; LOCAL timing/replay/domain/ownership guards | Every implemented real-trait effect, route/encounter/booster/equipment branch and loot outcome; abort, cooldown, inventory/duplicate limits, stale/lost ownership revocation and reacquisition; interrupted claims and concurrent attempts; no fabricated traits or unverified eligibility |
| T24 | Resource market - PARTIAL | LOCAL all three resources and rollback; LIVE listing/cancel/purchase/fees; SIM replay/storage guards | Live stale quote and buy/cancel/two-buyer races, full-process interruption at payment boundaries, exact-one settlement/rent/refund/counters; all three resource client routes and malformed binding; auth-expiry and storage checks before approval |
| T25 | Planet market - PARTIAL | LOCAL settlement/rollback; LIVE roundtrip ownership/index/fees and tab recovery/expiry reclaim | Live concurrent buy/cancel/two-buyer races, process crash at each payment boundary, stale price/owner/mission/obligation state, signed rejection recovery; seller receives exact net and buyer cannot pay twice; direct/vault CPI authorization distinct |
| T26 | Direct planet transfer - OPEN | Market-mediated transfer proven, which does not prove direct transfer | Authorized direct transfer and prohibited homeworld/mission/obligation cases; recipient eligibility, all owner/profile/index changes, wrong authority/replay and rollback; if not launch-supported, explicitly disable and approve exclusion |
| T27 | Cross-account alliance synchronization - PARTIAL | LIVE treasury observer refresh; three native API accounts read identical treasury/levels/XP after simultaneous deposits in [agent follow-up](ALLIANCE_AGENT_INFRASTRUCTURE_2026-10-19.md), not browser UI proof | Leadership, expulsion, leave/rejoin, approval/rejection and infrastructure update visible in both open accounts without manual reload; stale buttons lose permission; background/resume and RPC-failure recovery |
| T28 | All command screens and modals - PARTIAL | UI repeated desktop/mobile viewport releases, wallet/store/market review and system layout fixes | Final candidate: populated/empty/loading/error/disabled/pending/success states for construction/research/ships/defense/fleet/reports/store/quests/alliance/UFO/market; modal focus/Escape/scroll/backdrop and stacked dialogs, no raw backend copy/overflow/unstyled controls |
| T29 | Universe/system/planet navigation - PARTIAL | UI compact system slots, loading/scene transitions and mobile navigation fixes | Final candidate all routes, system positions, occupied/empty/own/foreign planets, camera/input cancel, repeated enter/exit, resize/orientation, reduced motion, network/asset failures, canvas nonblank and controls accessible |
| T30 | Real mobile devices - OPEN | Desktop mobile-size viewports only are not device proof | iOS and Android supported wallet/passkey connect, cancellation/retry, popup/deep link return, background/foreground, tab/browser restart, scrolling/touch/orientation and transaction reconciliation; any unsupported platform explicitly declared |
| T31 | Sovereignty and governance - OPEN / GATED | Source-default write flags and governance/keeper test files exist | Verify deployed gates; local authorized proposal/funding/enrollment/sync/specialization and decision lifecycle, PASS/FAIL trades, finalization/keeper replay and executor permissions. Either complete launch testing or obtain explicit exclusion and disable reachable writes; no silent exclusion |
| T32 | Administrative configuration and faucet - PARTIAL | Existing devnet configs operate; LOCAL UFO admin guards | Every listed initialize/update/rotate entry point: authorized/unauthorized, invalid mint/treasury/config, repeat initialization, old/new authority and rollback; market escrow initialization; devnet faucet limits and mandatory mainnet disable. Use isolated fixtures, never rotate live authorities just to test |
| T33 | API services and sponsor boundaries - PARTIAL | AUTO RPC/paymaster/compression/NFT/image/keeper tests and live usage | Each frozen endpoint: input/schema/auth/network/domain checks, replay, rate limits, RPC outage/timeout, upstream failure and secret-free errors/logs; sponsor instruction allowlist/amount/rent bounds and abuse tests; attestor ownership revocation, image integrity and finalizer isolation |
| T34 | Root and alternate entry points - OPEN | Source routes enumerated; primary /app flow repeatedly used | Root fallback App (wallet adapter), /app, /universe-game, /universe-lab, /next, /founders and /sovereignty-lab: intended access and desktop/mobile smoke; wallet variants, invalid/deep-link routing and network consistency; approve/disable legacy surfaces instead of assuming absent |
| T35 | Global transaction and state recovery - PARTIAL | AUTO preflight/recovery; LIVE selected cancellation, expiry and tab-close cases | For every command family above: stale snapshot, approval cancel/timeout, RPC/submission/confirmation interruption, account/network switch during await, duplicate click and resume; no false success/failure, double spend or lost durable state; verify actual wrapper simulation, not raw unsigned auth assumptions |

## Item-Level Evidence Rules

2026-10-19 alliance edge follow-up: [same three agents, concurrency and recovery](ALLIANCE_EDGE_RECOVERY_2026-10-19.md).
LIVE: 12 finalized transactions / 25 checkpoints, restored membership/leadership,
stale-command rejection, rent refund, claim preservation, actual API-process
restart after lost approval/deposit responses and exact-signed replay. LOCAL:
eight funded SBF upgrade races. Found/fixed local agent submit preflight and
confirmation-race handling plus SDK duplicate-application guards. Distinct signed
at that earlier run the deployed program lacked atomic expected-level/max-price
binding; the protected candidate is now deployed and verified in the report above;
live funded upgrade races remain resource-gated. This extends T18/T19/T20/T27/T35
without adding checklist rows or marking them complete. Automation stays PAUSED.

The generated [instruction and catalog inventory](GAME_TEST_INVENTORY_V1.md)
is the complete fixed item list, not a claim that all items passed. Every
instruction starts with its parent row's explicit coverage boundary. If a
specific route/item lacks an attributable assertion or receipt, it remains
unverified even where another route/item passed. A test-name match alone is not
evidence. To close a family, record item ID, scenario, route, source/binary
version, test/transaction receipt, state assertion and UI result.

All 35 rows remain open at family level: **29 PARTIAL, five OPEN/GATED
(T21, T26, T30, T31, T34), one BLOCKED (T14)**. These are feature families,
not 35 individual test actions. Completed subcases remain in column three.

## Fixed Mainnet Release Gates (Separate From Gameplay)

| ID | Status | Required evidence |
| --- | --- | --- |
| R01 | OPEN | Independent security review and tracked remediation, including authorization/replay/CPI/sponsor/attestation abuse |
| R02 | PARTIAL | Final source lock, reproducible binary/IDL/build checks, no exceeded-stack diagnostics, matching deployed hashes and final local-validator regression; prior successful builds are retained, not final-candidate proof |
| R03 | OPEN | Reviewed mainnet IDs/mints/genuine USDC/treasuries/cross-program bindings, starting economy and caps; no devnet reuse |
| R04 | OPEN | Explicit authority/custody/governance policy, multisig execution/rollback rehearsal and verified unchanged intended authorities |
| R05 | OPEN | Mainnet paymaster budgets/allowlists/rate limits, funding alerts and abuse/availability monitoring |
| R06 | OPEN | Mainnet NFT attestor domain, custody/rotation/revocation and ownership-read failure policy |
| R07 | PARTIAL | Dependency advisory disposition and final deployment/config/assets smoke; historical audit had no high/critical, not an independent audit |
| R08 | OPEN | Incident response, backup/recovery, RPC failover, reconciliation and operational runbooks |
| R09 | OPEN | Separately approved token issuance, fundraising and mainnet deployment plan; no approval implied by this checklist |

## Scope Control And Completion

Explicit NEW scope authorized after V1: the separate devnet agent API/mine-loop
and x402 slice is tracked as A01-A08 in
[Agent API Devnet Results](AGENT_API_DEVNET_2026-10-19.md). It does not alter
T01-T35, their completion counts, or the frozen original instruction inventory.
Scheduled automation remains PAUSED.

1. Run `node server/testing-scope.cjs`. It checks every current instruction,
   catalog definition and API endpoint against the frozen JSON baseline and
   ensures every instruction maps to exactly one existing checklist row.
2. Close existing cases by appending dated evidence under their stable IDs.
   Do not append fresh top-level work for a case already covered by a row.
3. A new feature/instruction/catalog/endpoint is marked NEW with source diff,
   reason and explicit scope decision. Never overwrite V1 to hide drift.
4. Gameplay is certified only when T01-T35 are closed or a specific exclusion
   is approved and disabled in the launch build; all required device evidence
   must be present. Mainnet clearance additionally requires R01-R09.
5. This is finite acceptance coverage, not a promise of zero possible bugs or
   exhaustive exploration of every random combat outcome.

## Evidence Index

- [Latest dated readiness and retained transaction state](MAINNET_READINESS_2026-10-19.md)
- [Historical feature receipts](DEVNET_TEST_MATRIX.md)
- [Program/client preflight boundaries](FRONTEND_PROGRAM_CHECK_PARITY_2026-10-19.md)
- [Store/quest edge cases](STORE_QUEST_EDGES_2026-10-19.md)
- [Check-in reward correction](CHECKIN_REWARD_FIX_2026-10-19.md)
- [Quick Play and Colony Ship](QUICK_PLAY_EXPIRY_STATUS_2026-10-19.md)
- [Planet settlement](PLANET_MARKET_ROUNDTRIP_2026-10-18.md)
- [Payment recovery](PAYMENT_RECOVERY_RELEASE_2026-10-18.md)
- [Alliance infrastructure](ALLIANCE_INFRASTRUCTURE_RESULTS_2026-10-17.md)
- [Trade Network chain proof](TRADE_NETWORK_DEVNET_PROOF_2026-10-17.md)
- [UFO deployment proof](UFO_DEVNET_ACTIVATION_PROOF.md)
- [Silent NFT checks](UFO_SILENT_LINK_VERIFICATION_2026-10-17.md)
- Backend: `.validation/devnet-upgrade-2026-10-16-r2/PREREQUISITE_VALIDATION_2026-10-16.md`
  and `MARKET_VALIDATION_2026-10-16.md`: exact artifacts, 106 prerequisite
  checks and 32 confirmed market transactions. Later race runs are distinct.

## Next Execution Batches

### Execution Log - 2026-10-19, Batch 01

- Frozen inventory verified unchanged: 110 instructions, all mapped exactly
  once. No checklist scope was added or removed.
- AUTO: full sequential frontend/server/API regression run: **380 passed,
  zero failed/skipped**, approximately 67 seconds. Includes Quick Play
  restoration/expiry/account isolation, avatar silent ownership/revocation,
  transaction compression/preflight, storage/rewards and modal/layout tests.
  This is not a new signed-wallet or visual/device pass.
- SIM T25/T35: **five passed**: two filled planet purchases reject, their
  consumed Lazor approval accounts reject with IllegalOwner, former seller
  fails current ownership authorization. IllegalOwner is the observed closed
  account rejection, not independent proof of the full authentication policy.
- SIM T18: **three passed**: member cannot expel or transfer leadership;
  founder cannot leave. Existing two-member/leader fixture verified first.
- SIM T20/T21: **three passed**: duplicate monthly alliance reward, member
  infrastructure upgrade and unfunded Research Grid upgrade all rejected at
  the expected guards. A duplicate reward check does not close all missions.
- Network genesis checked by each devnet script. Watched state remained
  unchanged. No signing/submission, token spending, authority changes or
  deployment. Initial sandbox network failure was environmental; the same
  read-only tests passed with approved network access.
- Durable devnet logs/results: [Batch 01 receipts](test-runs/2026-10-19T17-53-08-301Z/results.json).
  Full automation output was observed in this chat; future runs also retain
  the full automated-suite log through the runner below.
- No game regression found in this batch. Family statuses remain unchanged;
  do not turn these negative simulations into successful-action certification.

### Continuation

Hourly continuation is **PAUSED at the user's request** under
`gamesol-fixed-checklist-testing`. Local automation status was rechecked before
this evidence publication. It must not resume without an explicit request.
The commands below are manual tools, not an active background schedule.

### Publication Verification - 2026-10-19

The public Vercel URL returned HTTP 200. Nine entry/style/gameplay/shared
assets match the previously tested `frontend-5hqrebgmt` release byte-for-byte,
including `index-BgkYmNVA.js`, `UniverseGame-yI2uUWoz.js` and
`App-cUAQtWA1.js`. Its RPC returned the expected devnet genesis. No tracked
runtime source changes were pending; this publication contains checklist,
evidence and manual verification/test tools, not a new gameplay release.
See [deployed asset hashes](PUBLISHED_RELEASE_VERIFICATION_2026-10-19.json).
This verifies release identity, not a fresh signed-in UI/gameplay pass. The
scheduled automation remains PAUSED; this read-only verification was manual.

Repeatable sequential evidence runner:

```text
node server/run-fixed-checklist.cjs
node server/run-fixed-checklist.cjs --devnet
```

The first command runs scope and automated checks; the second runs reviewed
unsigned devnet market/alliance guard scripts. Each writes dated logs and a
machine-readable result under `docs/test-runs/`. It never signs/submits and
does not automatically close a family. Run only one batch at a time; the
scheduled continuation must inspect in-progress work before starting another.

### Planned Order

1. T01-T09 and T32: isolated-fixture route/catalog/permission closure without
   waiting for resources on player accounts.
2. T16-T21 and T27: reset/metric/role synchronization and infrastructure edges.
3. T24-T26 and T35: bounded live races and interruption/reconciliation tests.
4. T10-T15: remaining fleet boundaries and eligible controlled combat.
5. T22-T23 and T33: ownership-loss fixtures, utility branches and service abuse.
6. T03-T04 and T28-T30/T34: final browser/device/UI sign-off on the release
   candidate, then R01-R09. No funds or signatures are authorized by this order.
