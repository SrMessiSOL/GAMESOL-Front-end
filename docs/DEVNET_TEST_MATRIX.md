# Live Devnet Test Matrix

## Completed membership cycle October 16

Final approval finalized with no error:
`3ukW5UbK2xLbsYpeuvUin4E79tAUu979yTECiB8GuLXikCRRtj8WxF1twfihuJTqL5b1MSBKQKdtJw4zW52dHKMY`.
Independent finalized reads confirm alliance member count 2, NewAccount role 1,
join request closed and treasury metal still 1,000. Applicant UI again shows
two members and four disabled LEADER ONLY infrastructure actions.

The real controlled cycle is complete: leave, reapply, reject, reapply, approve.
The first rejection exposed and led to the tested writable-applicant fix;
expired owner approvals were retried only after terminal failure, not while
pending. Original account retains 10.5 USDC and 4,995,000 ANTIMATTER; NewAccount
has no USDC/ANTIMATTER token accounts. No token spending, program upgrade,
authority change or combat was involved. Full regression suite: 193 passed.
The later chronological notes below retain earlier pending checkpoints.

## Contribution UI correction staged October 15

After confirmed rejection, NewAccount successfully recreated its request with
finalized transaction
`3phEFt1kwLuGYXKTxqUQxAMi1sY5Rfq5pWgS3HewJjzftB7Cgc2nYCsRdaiRTQiAJqkeaRHYBpc1TLpgC3hRPsYC`.
Independent read confirms request present. The leader's final APPROVE command
has been opened for owner approval; membership restoration is not yet claimed.

Corrected rejection executed successfully after owner approval. Finalized
signature `4NBSKvK9jB4g5eEhcPkB3jH74UJwtbfsa425EGi1tGPgvnQXU3g8Fjz71KEhd7DA9bekhpzvkFnkrXxnzYMVe3Bw`
has no error; independent finalized read confirms the request account closed.
Leader UI shows one member and no pending applications. The writable-recipient
correction is now real devnet execution evidence, not only simulation proof.
Second reapplication and final membership approval remain the next test steps.

Latest membership checkpoint: after session renewal, reapplication finalized as
`4Lo3mZHGnrbNH6ZA63PoqrQqT54nTAKztupEkFasoNpPn3zqQFfCT3RnL6Bn9jrKJm4P9JatmdQ7Tr7Zswz1KbUr`.
The request exists on-chain and applicant UI shows PENDING. The owner-approved
leader rejection then failed simulation with ConstraintMut 2000 on applicant;
the client marked this rent-refund recipient read-only. `rejectJoinRequest`
now marks applicant writable, matching the existing deployed Anchor context.
The dedicated `check-alliance-rejection.cjs` reproduces ConstraintMut with the
old flag and succeeds with the corrected flag in unsigned simulation. All
involved account hashes and lamports remain unchanged; the request is not
consumed by this check. Preview correction is at
`https://frontend-dgyikpy3t-srmessisols-projects.vercel.app/app`; real rejection
retry still needs the leader's sign-in and owner approval. No program upgrade,
token payment or production publication is involved.

October 16 follow-up: NewAccount signed into the corrected Preview. The live
leave confirmation was visually checked at desktop size and 390x844 mobile;
the mobile buttons are fully inside the viewport and the overlay is above the
command panel. User-approved leave finalized successfully:
`2wpyBpvkiB4kfYD4PzsrabGyJUKqMqytf66TpRLrCPoZFt4DroB3jBkZNVLAcT7BZaFxK9g6g7LJQMiHw9Z1xn5t`.
Independent finalized read shows member count 1 and NewAccount's retained
membership record at role 0 (inactive), not a closed account. Recruitment UI
shows the alliance with one member and REQUEST MEMBERSHIP.

The first reapplication attempt stopped locally because this Preview's Quick
Play session was inactive, with an explicit nothing-changed message. The
account modal confirms correct NewAccount identity, Commander READY, Quick
Play OFF, zero USDC and zero ANTIMATTER. Reapplication/rejection/final approval
remain pending user renewal; no second leave was submitted. Production and
GitHub publication remain gated. No USDC or ANTIMATTER was spent.

The live PlanetWorld contribution buttons now use membership claimed masks
only when their stored UTC period matches the current day, Monday-based week,
or calendar month. Completed entries display COMPLETED and are disabled; the
click handler independently refuses a completed entry. Period rollover restores
availability without clearing or altering on-chain state.

The membership rehearsal found a separate blocker: alliance confirmation
styles were scoped to `.production-preview`, leaving the real leave dialog
behind the command panel. Those styles now apply in the live game, retaining
the existing confirmation, cancel, focus and mobile layout behavior.

TypeScript passed and all 192 frontend/server regression tests passed. Preview
`https://frontend-on8k8e8rt-srmessisols-projects.vercel.app/app` completed its
cloud build. Desktop/mobile visual confirmation and the real leave/reapply,
reject/reapply/approve cycle are still pending NewAccount sign-in. No successful
leave is claimed. Finalized checkpoint remains two members, NewAccount role 1,
no pending join request. No USDC or ANTIMATTER was spent, and production/GitHub
publication remains gated on completing these checks.

## Confirmed metal contribution and follow-up guards

The user authorized one 1,000-metal contribution with no USDC or ANTIMATTER.
The live Quick Play flow initialized the alliance treasury and deposited once.
Both transactions finalized with `meta.err === null`:

- Treasury initialization: `MsotKJMF1Z3S5oHM6ELKa8J6GSePw2TPMWX4gZ1kCHJMt1qxXCWJvj5k1bcUhvVA8Ghq2E1M7YDCuo1DLgysjWW`.
- Metal contribution: `dR3YHD4nTZNnxhk1cQvRZBknPqitvtRuLzsB9YYnodx1izTejgVeboim96UMtRxfaPA3ZsQkcYrjpsEJ1Re139b`.

Treasury `H9fmLJwno49ejr6txrA9jBK5hxR4yiJT3Z7CML7wWtAY` was absent before;
afterward it held exactly 1,000 metal, total metal deposited 1,000, and zero
crystal, deuterium and ANTIMATTER. The live command panel agrees. Planet metal
dropped by 1,000 against its accrued display. Finalized token balances remained
10,500,000 USDC base units and 4,995,000,000,000 ANTIMATTER base units.

`server/check-alliance-deposit-guards.cjs` reconstructs this confirmed inner
instruction and only simulates it, without signing or submission. Duplicate
daily contribution rejects with `AllianceMissionAlreadyClaimed`; 999 metal
rejects with `AllianceMissionRequirementsNotMet`; empty and nonzero-ANTIMATTER
vault contributions reject with `InvalidArgs`. All referenced account-data
hashes remain unchanged. These prove program guards, not wallet authentication.

Duplicate fighter collection was also simulated from finalized collection
`2NrjpCe4KsEB2GNuaW9LMddr2ZseTxRNbAeCwThXBo5j9xRaDLrh4ogX3YSZSCHU6q8vD454D25qbY3yykwT4VGP`.
It rejects with `NoShipBuild`; before/after retain 20 fighters, queue item 255
and zero missions. No duplicate collection was submitted.

Known UI gap: the completed daily metal card still offers DEPOSIT instead of
a completed/disabled state. The deployed program prevents a duplicate debit;
the client display has not been corrected or published in this test run.
Alliance upgrades require ANTIMATTER and remain excluded. Controlled combat
remains pending beginner-protection expiry. No extra contribution was made.

## Latest alliance permission checks

The 19 queued Light Fighters finished naturally and were collected through
the live Shipyard Finish command. Independent confirmed account read and
the live UI agree: 20 Light Fighters total, shipBuildItem 255, quantity 0,
activeMissions 0 and occupied mission entries 0. No acceleration, relaunch,
USDC purchase or ANTIMATTER spending. Controlled combat remains pending
NewAccount's protection expiry; no attack was launched.

`node server/check-alliance-permission-guards.cjs` checked the deployed devnet
program against the existing two-member GAMESOL Devnet QA alliance. A regular
member's expulsion and leadership-transfer attempts both rejected with
`AllianceLeaderRequired` (6076). The leader's leave attempt rejected with
`AllianceFounderCannotLeave` (6070). Alliance and membership account hashes
were unchanged before and after all three checks.

These are unsigned simulations (`sigVerify: false`), not submitted actions or
proof of wallet authentication. No USDC or ANTIMATTER was spent. The live
contribution screen supports fixed deposits, starting at 1,000 metal, rather
than an arbitrary 10-metal contribution; no deposit was submitted.

Current checkpoint: October 14, 2026. Gameplay evidence below was collected
on frontend `87790c5`; the consolidation release adds the two preflight fixes
and the updated evidence without a program upgrade.
Game: https://chained-universe.vercel.app/app
Commander: `G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r`
Homeworld: `9:427:13`.

## Current colony and transport checkpoint

The sections below this checkpoint retain earlier chronological evidence;
their pending/funding statements describe those earlier runs, not current state.

- Active devnet program: `J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq`.
- Existing colonization mission resolved, without relaunch. Owned colony
  `Devnet Colony`, `9:427:1`, is account
  `CyKmBAd6FttU8szoaUEao1cY7iUQGEhZGCJaAW7wgkFD`.
- Astrophysics 4, Impulse Drive 3, Shipyard 4 and Research Lab 5 completed.
  Combustion Drive 2 was subsequently completed for Small Cargo production.
- Homeworld storage expanded to 160,000 metal, 160,000 crystal and 40,000
  deuterium before claiming the earned monthly colonization reward.
  Full reward delivered: 60,000 metal, 50,000 crystal and 20,000 deuterium.
  Daily colonization reward also claimed: 1,400 metal, 1,200 crystal, 400 fuel.
- One Small Cargo built naturally for 2,000 metal and 2,000 crystal.
- Real transport: one Small Cargo carrying 10 metal from Homeworld to the
  owned colony, 20 deuterium launch cost, natural outbound and return timers.
  Arrival and return were resolved separately. Final confirmed on-chain read:
  Small Cargo 1, Light Fighter 1, active missions 0, occupied mission entries 0.
  Live UI independently shows 1/1 mission slots free and two fleet units.
- No further USDC purchases or ANTIMATTER acceleration during this transport
  rehearsal. Latest restriction remains no additional USDC spending.

Finalized successful transport evidence (`meta.err === null`):

| Action | Signature |
| --- | --- |
| Small Cargo production finish | `EJJsPXnfbhdRKjANdyuicbDAJzA2sp6ut7AvGKMxRRptNjk8goFdQz4prTnsTJfFpnzCJzUf2RCs1R8gHG6dfXN` |
| Transport launch | `4RnbMtoghb7QaovuW8YrU2wcxLB8fejb1S8pTUbQsZiFcQS2yJtiSBEK6Fv2hBVHvoUqPhDMZ2V9tQjXi7a4N9X5` |
| Transport delivery | `2j4VzSMc1kHG1a4cQaQxF9cRPQryH1xXVc2h1x8PB1LqjQU25Ho74pRB9QaQ3SjbwWkao6giezcMCikLVX6pjkgB` |
| Transport return | `3uKqrhT94DoJTmLKgwsku9PkrKkWFjUXPMf1ich2GDujaJfepfndEumX9mUQCmMPkomePz8Avr36Zgjrn8CaVB5f` |

### Replay boundary

`node server/check-transport-replay.cjs` reconstructs the historical inner
game instruction and simulates it only (`sigVerify: false`). The vault check
passes and the cleared mission rejects with `InvalidMission` 6015. Independent
before/after reads retain one cargo ship and zero active/occupied missions.
The helper never signs or submits. This proves the game-level duplicate-return
guard, not outer wallet authentication. Replaying the whole historical wallet
transaction separately stops earlier at Lazor session error 3009; that result
does not establish a game-level replay rejection.

### Controlled espionage completed

Separate commander `Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd`
created `NewAccount Homeworld` at `6:35:11`, account
`9pNkMopmGczUVkTFYP73zRZpKQPZTtuSpZdz7A21H4JN`.
Its seven-day protection ends October 21, 2026 at 19:28:55 UTC
(16:28:55 Buenos Aires). No protection bypass or combat launch performed.

Main commander completed Combustion Drive 3, then a real probe-build attempt
rejected with `TechLocked` 6019 without consuming resources. The active vault
byte handler requires Shipyard 3 and Computer Technology 2; the typed helper
and frontend had instead listed Combustion Drive 3. Computer Technology 1 and
2 were completed naturally, and one probe was built for 1,000 crystal.
  The frontend prerequisite correction and regression test are included in
  the frontend consolidation release. No program/economy change was made.

One real espionage mission launched to the controlled defender for 2 deuterium.
The arrival generated a level-4 report with signal/counter 625/0 and 1/1 probe
survival. Report resources 515 metal / 510 crystal / 106 deuterium match an
independent confirmed read of the defender; four level-1 buildings and zero
combat technology also match. Both arrival and return finalized successfully.
Final source state: probe 1, active missions 0, occupied entries 0; UI 1/1 free.

| Action | Finalized successful signature |
| --- | --- |
| Probe launch | `SY1ZHEVCF9rHRxerv24xjpWL9egw1ZZssd7wQTP2F9ZV4cEzh9HYpbk3i7upnNCkzwaYVQCryu5pcD3yUVj6PUg` |
| Reconnaissance report | `4wQ2X4f85tpMqT6fcXR7v63MsVyH9oXneQQg7XLsxXJFEb47ia9WtxWTmeGQftHxC6zQJXh3EoZ59ykrjj8R5cPT` |
| Probe return | `4T1BFCKwcoJrsmiCZH8L2DJgrSR3uc6SPiLzaR2fhqU46VFvxLN7AgPtHMnEpTqT3XLjbcaMnAK8vXkvcydA5R2x` |

No USDC purchase or ANTIMATTER acceleration in this rehearsal. Main-account
and defender Quick Play sessions were separately approved by the user.

### Remaining gates at this checkpoint

#### Quick Play restoration correction and browser check

The user authorized fixing refresh persistence, a Preview check with NewAccount,
and GitHub/Vercel publication after checks pass. The command client now retains
smart-wallet signing preference while its executor is bound. Cancelled legacy
wallet reads cannot overwrite current commander state. Hook restoration and
activation results are guarded by wallet identity and request revision; a stored
active flag alone is not displayed as verified authorization before the existing
on-chain session check completes. Session duration, scope and expiry rules are
unchanged. Restoration is for the same browser and site origin, not shared
private session keys across devices or deployment addresses.

TypeScript and all 187 regression tests passed, including six restoration/race
checks. Preview `https://frontend-ar8kc5n03-srmessisols-projects.vercel.app`
completed its TypeScript/Vite cloud build. The user signed into existing
NewAccount and enabled one limited 8-hour devnet session on this new origin.
The actual UI showed Commander READY and Quick Play ON. After a full page reload,
the same account/world restored, and the account modal again showed READY / ON
without a new sign-in or approval popup. Only the game tab remained open.
Screenshots: `.vercel/ui-check/quick-play-before-refresh.png` and
`.vercel/ui-check/quick-play-after-refresh.png`. No purchase, resource command,
USDC/ANTIMATTER spending, withdrawal, NFT transfer or mainnet action was used
for this check. Actual wall-clock expiry and revocation were not forced on the
user's live session; their off-state and stale-result behavior have unit coverage.

Publication: code commit `36e29fe` was pushed to the existing branch. Production
deployment `https://frontend-hvrvi6jl7-srmessisols-projects.vercel.app` completed
its cloud build, and the public `chained-universe.vercel.app` alias was explicitly
assigned. Live `/app` returned 200 with `index-E2JM6QZW.js`; the new
`UniverseGame-h1azrbQy.js` bundle also returned 200. No program upgrade,
authority change, extended session duration or token purchase was involved.

Public-origin confirmation: the user enabled the original G6tR account's own
limited session on `chained-universe.vercel.app`. A full page reload restored
Quick Play ON and Commander READY without another sign-in or approval. Both
owned worlds and Crypto UFO #513 also restored. The modal still showed 10.5
USDC and 4,995,000 AM; no game command or token spend was performed during
this refresh check. Screenshot:
`.vercel/ui-check/quick-play-production-after-refresh.png`.

Latest alliance result: paid creation, NewAccount application, leader approval,
application closure and regular-member UI checks are complete on devnet. See
the finalized evidence below. Alliance contributions/upgrades, rejection,
leave/expel/leadership transfer and governance execution are NOT certified by
this membership test. Market buyer settlement and planet sales also remain open.

#### Approved alliance creation packet blocker

Live retry succeeded after the user's owner-passkey approval. Finalized
transaction `2X7373JkuZMYPG1E1xstP1BKRLrnNndKR8j9qmf78tti5youz4gZFomALyZifQuuzYiQ2w3YtziojaJSNUjX8bbG`
has `meta.err === null`, `SponsorAccountRent` and `CreateAlliance` logs.
Program-owned alliance `7EJgwFu4wckh1wY2fxCfmfvi7EFmeEorMuwYQA8iC4Kp`
is visible in the actual game as `GAMESOL Devnet QA`, one member. Token deltas
confirm exactly 100 USDC and 5,000 ANTIMATTER charged: 2,500 AM transferred
to the configured DAO treasury and 2,500 burned. Remaining founder balances
are 10.5 USDC and 4,995,000 AM. No second paid creation was attempted.
NewAccount membership request and leader approval are next, with a separate
sign-in so the original leader session remains intact.

Membership follow-up completed: NewAccount `Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd`
requested membership with finalized successful transaction
`4ABoJtLGMoUZKVZFuPk2nToCLTbnmMuwDqcF9kScMwE5kWMojvTTnwfqnKDL7CweWaxTb7QVa8MV7d9QiMBPQ8LD`.
Independent read before approval confirmed the program-owned request existed
and membership did not. The actual applicant UI showed pending approval.
The user approved from the original leader account; finalized successful
transaction `4Mu3dJhkxu16uXn9q4VrYhTC2H5vHMqTe5DNb2gtNsGt53FBx2g7xu8erqbe4unSPmoMnwEXeWP4xsURCdWuysnm`
logs `SponsorAccountRent` and `ApproveJoinRequest`, with no token-balance entries.
Independent current read confirms request closed, membership authority equals
NewAccount, alliance matches the tested alliance, role 1 (regular member),
and alliance member count 2. Both leader and member UIs show the correct roster.
Member UI disables all four leader-only infrastructure upgrades and omits
approve/reject, expel and leadership-transfer controls. These UI checks do not
replace adversarial on-chain permission tests. No further token spend was made.

Known UX issue retained for follow-up: immediately after signing into the new
origin and enabling Quick Play, membership attempts still failed locally with
"Passkey vault is not active." On-chain player/profile/vault records were
present and valid (self-vault, not revoked, no expiry). One page refresh restored
the active execution path and allowed the request. The precise async client
state race is not yet proven or fixed. The alliance panels also required
reopening to load changes made by the other account. Do not classify this as
a clean first-session UX pass.

Compression follow-up: the user approved a dedicated frozen table, at most
0.02 test SOL from the existing sponsor, and tested GitHub/Vercel publication.
Table `75BH1eVqgoUm3UK5bW9GSQgQdsE7QV1Jcsw244xsuqPv` contains 29 pinned
public addresses and is independently confirmed immutable and active. Creation
and freeze signatures are preserved in `src/alliance-lookup-table.json`.
Finalized sponsor debit across both setup transactions totals 5,658,960 lamports
(0.00565896 test SOL), below the 0.02 cap. The initial WebSocket confirmation
failed through the HTTP proxy; the already-finalized creation was reconciled
before freezing with HTTP polling. No duplicate table was created.

The client selects this table only for owner-passkey alliance creation. Sponsor
policy verifies the exact table, game/profile/alliance PDAs, configured mints,
user ATAs, treasury destinations, bounded canonical arguments and optional
matched rent. It rejects unrelated commands, substituted accounts, missing or
reordered passkeys, repeated wallet executes and mutable/altered tables.
Existing signature-verified simulation and rent/debit limits remain intact.
Real-SDK synthetic packet sizes are now 1,055 bytes without rent and 1,078
with rent. TypeScript passed; 180 full-suite tests plus the separately added
client-route test passed (181 total). Actual paid creation and membership
remain unexecuted pending publication and the user's new passkey approval.

Code commit `9eac84a` was pushed to the existing branch. Production deployment
`https://frontend-d48xoches-srmessisols-projects.vercel.app` completed its cloud
TypeScript/Vite build and the public `chained-universe.vercel.app` alias was
assigned explicitly. Live `/app` returned 200 with `index-CVx65aDH.js`, and the
live sponsor endpoint returned the expected existing sponsor. Actual alliance
creation and membership still require the user-approved game transactions;
deployment and synthetic packet tests do not establish their completion.

The user funded the game wallet and authorized exactly 100 devnet USDC plus
5,000 devnet ANTIMATTER for one alliance and the NewAccount membership test.
Verified configured-mint balances: 110.5 USDC and 5,000,000 ANTIMATTER.
The live creation attempt for `GAMESOL Devnet QA [TST]` stopped locally with
the Solana transaction-size error; no command was submitted. Independent
read confirms the expected alliance PDA
`7EJgwFu4wckh1wY2fxCfmfvi7EFmeEorMuwYQA8iC4Kp` does not exist and both
token balances are unchanged.

`node server/alliance-transaction-fixture.cjs` reproduces the synthetic real-SDK
packet: uncompressed serialization exceeds the limit; the existing table
still yields 1,272 bytes without rent and 1,295 with rent (limit 1,232).
Fixture signatures are synthetic and never submitted. A dedicated, frozen
public-address table and scoped client/sponsor representation changes are
needed before retry; no authority, fee or economy change is necessary.
For a table with up to 40 addresses, live rent quote is 0.00743712 test SOL,
excluding setup transaction fees. Setup/publication approval remains pending.

#### October 14 market round trip and alliance gate

The actual published game created one sell offer: 1,000 metal for 1
ANTIMATTER (1,000,000 base units). The user approved the Lazor owner prompt.
Finalized successful creation:
`2nMacMe3FQzH7w6eiM3KDu97Kk1c6vhWtvifLe8PRyZq8paxUCGWh5pd2zAaDJscEwjb2ZRNAMHRmigSD1gRKdi2`.
Logs include `CreateOffer`, `LockResourcesForMarket` and the exact amount/price.
The user's second approval cancelled offer 0. Finalized successful cancellation:
`3NhZnGrPqVStfLQUmmN8bz74SQFnWUXq46u1f7AvnnN4ZEohtUqgL3eFEPDFX2CeSpmNejptSzTYFB943MjzpBZx`.
Logs include `CancelOffer`, `ReleaseResourcesFromMarket`, and `offer_id=0`.
Both transactions have no pre/post token-balance entries. The live UI returned
to zero resource offers, zero personal listings and the released 1,000 metal
(plus ordinary accrued production). No USDC or ANTIMATTER purchase occurred.
This certifies resource listing/cancellation, not buyer settlement or planet sales.

The live alliance directory returned zero available alliances and zero requests.
Creation requires 100 USDC and 5,000 ANTIMATTER; the account displays 11.5 USDC
and zero ANTIMATTER. The creation button is disabled. No alliance was created,
no membership requested and no funding, minting, fee change or token spending
was performed. Creation and membership remain gated on separately approved
devnet funding; the standing no-more-USDC limit was retained.

#### October 14 combat preparation recheck

Independent reads through the live devnet RPC confirmed the original commander
has one returned probe, one fighter, one cargo ship, zero active missions and
zero occupied mission entries. NewAccount remains at `6:35:11`, with no ships
or defenses and protection until `2026-10-21T19:28:55Z` (16:28:55 Buenos Aires).
The existing reconnaissance transaction was reread at finalized: successful,
with the expected 235-byte espionage event. No duplicate espionage was launched.
After reloading the current public deployment, the actual Activity reports UI
shows one level-4 espionage report for `9:427:13 -> 6:35:11`, signal/counter
625/0, resources 515/510/106 and probes 1/1. The old preview's empty report
history was not reproduced on production. Report text "PROBES RETURNING"
describes the recorded arrival; the independent current read confirms the
probe has already returned and its mission slot is clear.

The attack minimum is 1,000 combat points. One fighter provides 50, so 19
additional fighters were ordered through the actual game command UI using
57,000 existing metal and 19,000 crystal. Finalized successful transaction:
`55HJXRAdgRC49pya1oKhqrW8F4U2LuqnM9v5JZ2nnYqvjzcu7udGRHQi2bshkW5YjrtZ7HMAgf6iycvRjJZBWPsu`.
The independent read shows ship item 2, quantity 19, finish timestamp
`1792030629` (October 14, 23:17:09 Buenos Aires). These ships are queued,
not yet collected. The transaction has no pre/post token-balance entries.
No USDC purchase, ANTIMATTER acceleration, attack launch, protection bypass
or mainnet action occurred.

The focused frontend preflight suite passes 10 tests, including protected
targets versus espionage, exactly 19/20 fighters at the combat minimum,
attacker unlock, target cooldown, same-owner rejection and failed reads.
These are callback fixture tests, not executed on-chain combat. Actual combat
resolution, losses/loot, return and battle-report visibility remain pending
until the controlled defender becomes eligible. No program upgrade is needed
or authorized to bypass that waiting period.

Controlled combat, fresh ownership-transfer/expiry safeguards,
market settlement/cancel flows, alliance flows, and bounded deposit/withdrawal
checks remain separate release gates. Their completion is not implied by this
successful colony and transport round trip. No mainnet launch clearance.

### Consolidation checks and mainnet blockers

Frontend consolidation changes: probe blueprint requires Computer Technology
2 (matching the active byte-handler), and hostile preflight verifies the target
owner and rejects same-commander targets before submitting. Failed or missing
ownership reads fail closed. Transport ownership rules are unchanged.

Local checks passed: 121 server regression tests, 13 API test entries including
the existing paymaster policy suite, TypeScript checking, and whitespace checks.
The game-level transport replay simulation rejects with InvalidMission 6015.
These checks are not a smart-contract security audit or mainnet certification.

Production dependency audit on October 14 failed: 37 advisory entries,
17 moderate, 19 high, 1 critical. The critical entry is @capacitor/android
(GHSA-rvm3-566m-v7fv), relevant to the native Android surface; high entries
include bigint-buffer, braces, node-forge and toml, with transitive findings
through the Solana/IPFS dependency trees. Package findings require reachability
analysis and tested remediation; a dependency advisory is not by itself proof
of exploitability in the browser build. No automatic/breaking audit fix applied.

Mainnet clearance remains blocked on:

1. Controlled combat after defender protection expires; no bypass authorized.
2. Lazor popup-close/blocked-popup recovery: repeated live attempts left the
   Quick Play button disabled until reload. This remains unresolved.
3. Dependency security triage/remediation and independent program/admin review.
4. Market sell/buy/cancel/settlement, alliance and bounded withdrawal tests.
5. Ownership transfer/expiry and cross-account negative checks beyond the
   already-tested proof replay and frontend account-switch safeguards.
6. Prerequisite parity review: the active byte-handler and typed helper diverge
   for probes (Computer Technology 2 versus Combustion Drive 3); the frontend
   now follows the active path, but backend consistency needs separate review.
7. Separate mainnet token, treasury, governance, attestor and deployment signoff.
   No token issuance, fundraising action, mainnet deployment, authority change
   or further USDC spending is part of this consolidation.

## Automated checks

### Wallet/security remediation candidate (not promoted)

Local candidate adds signing-popup closure/timeout recovery through the SDK's
own error channel plus a local rejection fallback. Late signature results
cannot proceed to finalization/submission. Read-only wallet preparation has
20-second deadlines; transaction submission/confirmation is not raced by that
deadline. A submitted session's status timeout explicitly says to check status
before retrying. Successful activation no longer waits on an unrelated SOL
balance refresh. Pending Quick Play buttons now say WAITING FOR APPROVAL.

145 server/API test entries passed, including cancellation, blocked/synchronous
popup failure, SDK promises that never settle, late signatures, preparation
timeouts, post-submission wording and the actual enable-action busy state.
Local production build passed before the final read-deadline additions; the
final candidate also passed its preview-only cloud TypeScript/Vite build.
Real browser cancellation/retry verification still requires preview sign-in.
No live alias change, token purchase, session expansion or mainnet action.

Capacitor Android/core/CLI updated together to 8.5.3 for
https://github.com/advisories/GHSA-rvm3-566m-v7fv . The shell-quote override is
updated to 1.12.0 for https://github.com/advisories/GHSA-pqg4-j6r4-53mv .
Build installs use the lockfile with npm ci, legacy peer resolution and disabled
install scripts, also enforced by project .npmrc for server-function packaging,
matching the tested dependency closure instead of introducing
unrelated optional peer trees. The explicit IPFS compatibility preparation
remains in the build command.

Fresh production audit: 0 critical, 19 high, 17 moderate (36 total).
The full audit including development tools reports 0 critical, 26 high,
10 moderate (36 total); transitive parent severities differ by included scope.
High findings are NOT resolved or suppressed: native bigint-buffer through
SPL Token; toml through Anchor; braces/glob and node-forge/ACME through Helia.
Current verified-fetch 8.1.2 is already the latest published release. Proposed
npm force fixes downgrade public APIs and cannot be applied without migration
and NFT/transaction compatibility work. No package exclusions, advisory ignores,
or audit-level changes are used to claim a clean audit. Production promotion
remains gated on real popup recovery verification and security remediation.

The first candidate sign-in succeeded as NewAccount (Fv9x...Rvdd), but its
Quick Play button remained disabled. A read-only getPayerSigner request
confirmed the preview error: "The devnet sponsor is not configured."
With explicit user approval, the existing GAMESOL_DEVNET_SPONSOR_SECRET was
added to Vercel Preview only. No unrelated environment variables were copied
to Preview; temporary transfer files were removed. Production was unchanged.
Replacement preview frontend-n5v1tlyya-srmessisols-projects.vercel.app is Ready.
Its read-only getPayerSigner endpoint returned HTTP 200 with the expected
public sponsor address F8HniT2KZspe6AGDQKvVrmkFt9LwZkctPVVQF8XZz6ub.
The secret is marked sensitive. Environment-file quoting was decoded with
JSON parsing before the successful transfer. The new origin requires another
human sign-in, completed as NewAccount (Fv9x...Rvdd).
Live popup-close/retry verification passed on this preview: Quick Play began
OFF with sponsorship available; opening approval disabled the button and
showed WAITING FOR APPROVAL. Closing the Lazor popup without signing produced
"The approval was cancelled. Nothing was changed." and re-enabled both the
Quick Play and sign-out buttons. Retrying opened a fresh approval popup;
closing that popup recovered again. Quick Play remained OFF throughout.
The portal Cancel-button interaction timed out and was not counted as a
passed Cancel-button test; the second popup was explicitly closed instead.
Screenshot: .vercel/ui-check/wallet-cancel-retry-passed.png.
All 16 focused connect/sign recovery tests passed again. A subsequent live
production-scope npm audit reports 0 critical, 19 high, 8 moderate (27 total);
this later advisory snapshot supersedes the earlier moderate count, not the
unresolved high-risk release gate. No session or game transaction was sent.
These checks establish real popup-close recovery and retry, not a successful
signed session, live blocked-popup behavior, or a live timeout test.

### Dependency remediation follow-up (preview only)

The current local and preview candidate supersedes the unresolved high-count
snapshot above: runtime audit is 0 critical / 0 high / 13 moderate; full audit
is 0 critical / 0 high / 15 moderate. Root fixes, first-party adapter boundaries,
and verification are detailed in DEPENDENCY_SECURITY_2026-10-14.md.
Clean install, all 158 server/API tests, production build, and the full audit
gate passed. Preview frontend-1vrmbwjpz-srmessisols-projects.vercel.app built
and packaged successfully. Fresh NFT ownership, byte-identical real #513
artwork, invalid-input/origin guards, sponsor lookup, and anonymous desktop /
390px mobile rendering passed. No production promotion or GitHub push yet.
The user was notified that a Helius RPC URL appeared in a transfer error log;
API key rotation is a follow-up before publication. No wallet signature,
game command, or USDC spending occurred during dependency verification.
Final-build human sign-in restored NewAccount and Homeworld 6:35:11. Two
popup-close attempts, with a fresh retry between them, released the wallet
controls and left Quick Play OFF. The signed-in mobile account panel fits
390x844 without document overflow; viewport override was reset. No approval
or transaction was submitted. These checks do not prove a newly signed game
loop or remove unrelated mainnet readiness gates.

### Published wallet/security release

After explicit user authorization, code commit 1219903 was pushed to the
existing frontend branch and deployed to production as
dpl_Eoo4vVbX3khmtAnEBGNTSCTgyqa1. The chained-universe.vercel.app alias now
serves this build (index-DR0RnYqF.js). Both approved Helius settings use the
replacement key and are sensitive. Rebuilt preview and new production fresh
NFT reads and exact #513 image checks passed; the game remains on devnet.
Public alias input/origin guards passed after cutover. No USDC was spent.
The user subsequently revoked Stormjelly; Helius confirmed its deletion.
Post-revocation fresh NFT ownership and exact #513 image checks passed in
Production and rebuilt Preview. The production devnet RPC and expected
sponsor also passed. Rotation is complete; no USDC or transaction was used.
See DEPENDENCY_SECURITY_2026-10-14.md for release evidence and remaining limits.

98 regression tests passed, zero failed. These cover frontend and server
policies; they do not substitute for live validator execution.
Local blueprint-disclosure changes are not published.

## Live execution

| Flow | Result | Boundary |
| --- | --- | --- |
| Quick Play renewal | ON after human approval | Automated opener was popup-blocked; direct human click worked |
| Establish command quest | Claimed, finalized, no chain error | Claimed button disabled; deliberate on-chain replay not tested |
| Shipyard 0 -> 1 | Started and finished, finalized, no chain errors | Natural timer; no ANTIMATTER acceleration |
| Light Fighter x1 | Production order finalized, no chain error | Natural 20-minute timer; completion and flight still pending |
| Full refresh | Homeworld, #513 portrait, Shipyard 1 and fighter queue restored | Queue showed 17m 39s remaining after refresh |
| Fleet operations | Empty fleet and 1/1 free slots displayed | Launch, arrival, resolution, return not yet exercised |
| UFO commander / loot | Real #513 portrait, one completed expedition, equipped badge restored | Current UI shows approximately four hours of cooldown; no bypass |
| Store | Packs and limits load; insufficient-USDC gates displayed | Zero USDC; no purchase or limit-reset transaction executed |
| Market | LIVE DEVNET, zero resource offers/listings | No sell, buy, cancel, settlement or planet sale executed |
| Alliance | Registry loads; zero recruiting alliances | Creation requires 100 USDC and 5,000 AM; not executed |

Earlier UFO expedition execution evidence is in `UFO_ACTIVE_GAME_RELEASE.md`.
That prior loop does not mean a new expedition was executed at this checkpoint.

## Public transaction evidence

Read through a genesis-checked devnet connection. All four signatures below
were finalized with `meta.err === null`.

- Quest claim (`ClaimQuestVault`): `2ijeP3Z7e5KEBoF1qVZkVW7MTaQZe9uoGMJoH8dA1hefshoPNTcrL4pd524zKcqxEKVquMBxEHeoMrY4LcACUHJe`
- Shipyard start (`StartBuildVault`): `5cDKMQQxyi2JPZ2ziRmNPVVk9quNHhuaesJEkYNK59BCzwed2aQGgpQv2RsDtbcUKUXk3D8PLSC6eybyBCQzHrqQ`
- Shipyard finish (`FinishBuildVault`): `3LJHH89ZaX5VsBnLZG7FEHigTAbWTQsfBV6n7v4bfYo6vb2WYkfmtsiMgmhKfXC9J2v59fAoSFZiU9cXLvxMScbR`
- Fighter production (`BuildShipVault`): `4YVbmwntUAcjKz4KmUhKF3KQiA8wKW7duY2BFzhSpUAhz9A9yZUjNwXhS3tAZHyxqrLWKL7KHje1KEkWDz2aVAZm`

## Remaining release gates

1. Finish fighter naturally and verify inventory after refresh.
2. Exercise an allowed non-hostile mission and reconcile fleet/fuel/slots on return.
3. Research and defense production; colonization, espionage and controlled combat.
4. Fresh UFO ownership verification, unauthorized-owner and stale-proof checks on-chain.
5. Funded devnet store, market and alliance tests with explicit approval.
6. Deposit/withdrawal, replay and cross-account safeguards in bounded test accounts.

No mainnet deployment, NFT transfer, paid pack, withdrawal, authority change,
or token acceleration was performed. This is a partial devnet rehearsal, not
mainnet launch clearance.

## Follow-up execution checkpoint

- Daily check-in claimed and finalized: `goUPVGEojzvWfGAA6KaxxyBES49JvqATifn46tH8gMHdV8AWFZvUuVBudJp9PXCZAwXKW9ve7bP21pAkg8eUdpq`.
- Fighter finished naturally; inventory became 1 and queue became available:
  `27kCk9B1TXcyGwbYrXuJ2NTgSYGFDs8KTqJ2XWwnjzSeXLn5x4eJ1AX1FhHot2W7HMvPJ5BLu4QPXxGe2Ww1HNTo`.
- Research Lab 0 -> 1 started and finished naturally:
  `5oyTEwAFuBk9PnRxhK8wkUppZZV3fwGbRJfGPWgq6CtKpSr7UdmtdavBtsHuME1u17sijk9ZLMFixBXQt5w3H7QL`
  and `4obDT1YqP5izvgLPddi7BAjPh961zeXj88WNTxJUMUzZEbteDEbCfue3Eb6wk29a81XNDV2jTAg2PixMJTnZf5Zd`.
- Earned deuterium-production, shipyard and laboratory quest rewards claimed:
  `qML71oi9kmvs1uUbo4EUQc6mwHhTM8nKMLKm9Rfus4xVS78dRbtcUXaQAfD4kmWHJ6YXPNp85bY4EE7hwmVbYGt`,
  `4mmxMF7SfxjFkEGeB5MFVx6UYLUr9HxJEVddEdXcMzyCmimT6WenJkauNk4gJcrSWixdWcYh86kWyuifNii3D8ap`,
  `2YU9agzAMJL358CZohFT8SRFirWL6tz4rc8yaMZfdKiQM3hbNJd1g4PR1BTJ51teFM772WUABfM7UM4ECrySNzic`.
- Energy Technology 1 research started; natural 30-minute timer:
  `5XEp7MizYsqiFUbxeJ6Rmixc6ozyobAMdD56JTNbzJoXL3e7Gt8sayC4hqvHe2w23vSEyxoe7wnPLKLveSG2phbh`.
- Rocket Launcher x1 production started; natural five-minute timer:
  `5CFYefU96T9u83uDK2qYG2EBzCvu126eHPt3QwRWZ9H6Z92f17y8yh4BNcVWrPqZUWjv1XEKc6aLunXVXHZMfFq6`.

All listed follow-up signatures were independently read as finalized with
`meta.err === null`. Research/defense completion must be recorded separately.

### Read-only validator simulations

Reconstructed public historical transactions were simulated with a replaced
recent blockhash and `sigVerify: false`. No signature was acquired, no
transaction was submitted, and no state was changed by these negative checks.
They test program rejection, not outer transaction signature authentication.

| Attempt | Rejection |
| --- | --- |
| Duplicate deuterium-production quest claim | `QuestAlreadyClaimed` 6057 |
| Duplicate daily check-in | `DailyCheckInAlreadyClaimed` 6059 |
| Ship production while defense queue is active | 6021, `ShipyardQueueBusy` in the program error enum |
| Reuse historical UFO start proof | `Replay` 8002, ownership proof already used |

The UFO check proves used-proof rejection, not fresh ownership transfer or
expiry rejection. Those need separate bounded tests. The new frontend
preflight was also checked locally for source-coordinate, cargo-capacity and
whole-ship safeguards; no flight occurred.

Still waiting for a controlled second planet for a real non-hostile transport.
Store/market/alliance and withdrawal tests remain unfunded/unexecuted.

Rocket Launcher completed naturally, with fortified status, one online unit
and a free production queue. Confirmed finish signature:
`49tN9XBP81N88N6iiixbHSZn2JxQJJxete1aMc6QGYXUkiCL45TNrp93BmKbb8Co97119GzyJAr62mjW6xG5P4rz`
(`FinishDefenseBuildVault`, finalized, no chain error).

The earlier pending-fighter and pending-defense rows are historical checkpoints;
these completion records supersede them. Research completion remains pending.

### Independent saved-state read

`server/read-devnet-game-checkpoint.cjs` reused the frontend's account decoder
and checked the devnet genesis, program owner and commander authority before
reporting planet `GmuTW6QrgNgbYUnu19j19prg2GQXc1Li7VhvynHx1bk4` at `9:427:13`:
Shipyard 1, Research Lab 1, Light Fighter 1, Rocket Launcher 1, active missions 0,
and both production queues free. Energy Technology remained 0 with research
target 1 and finish timestamp `2026-10-13T22:53:37.000Z`.

This proves stored game progress independently of browser storage or rendering.
The research finish command has not been submitted. Final automated regression
suite: 110 passed, zero failed; final frontend build and TypeScript passed.
# October 13 follow-up: publication and colony progression

UI commit `7377cc1` was pushed to `feat/crypto-ufos-wallet-link`. Vercel
deployment `dpl_6bLScQtgb1A7vhT21kqEfB3TrHNA` reached Ready and the existing
`chained-universe.vercel.app` alias was assigned explicitly. Live `/app`
returned HTTP 200 and the new `index-CEUIt0x4.js` entry. A visible live reload
restored the real Crypto UFO #513 portrait. Mobile content width was verified
as 390 CSS pixels (the Chrome viewport override required compensation for
the current browser scale).

New finalized devnet transactions, all with `meta.err === null`:

| Action | Signature |
| --- | --- |
| Finish Energy Technology 1 | `3Y9SETe8Xa2N2kfSgkrSzY9PFSq4h41ZcdDBMah1Bgx9FBeSRLV2zEbA1YaiQTWYoAhtEeXQ3xNVnAUu6shchr8P` |
| Claim earned energy technology reward | `5sh8jQ3Yv4bqbh3M6qB4VTPavCj7iNks83QgW5LmCLD9fv6euxbd1pfXiunPm9GkgmUWr2kXC752ciGTHf63VrTS` |
| Claim earned first ship reward | `WdMweoC5HMsfbeQJdg1yJmLzJhR2rqP2bhw5je67TV78oVjLH3PUYvi1Rz7RPj47BpeEj4uW6tb9nXEJHJm3bca` |
| Start Research Lab 2 | `DsgBu4BnTGNx7YTtAnMakW13uZuYLGP8vBjG2RtbFmXmE9jpAZd36j6yKp7hPa5LCfnJpuurVL8pFFdMLGzfbaZ` |
| Finish Research Lab 2 | `65vkqQFHSbMQRNRWN2qg1zhRrjwgb4tyMiQhaqsyGX1t7NeZgDBDc1dPwdvgV8dXhwNfrrh3a9PQMjjSfZ2JT3P1` |

Independent account read confirms lab 2, energy technology 1, shipyard 1,
one fighter, one rocket launcher, zero missions and no active research.
The user has no second planet and requested colonization before transport.
The actual program requires shipyard 4, impulse drive 3 and astrophysics 4
to build a colony ship. Impulse drive requires lab 5. Current live resources
were 3,184 metal, 2,896 crystal and 185 deuterium; lab 3 requires 450 metal,
900 crystal and 450 deuterium. Further colony progression is gated by earned
resources and prerequisites, not bypassed with grants or a new homeworld.
Colonization, transport and complete-game certification remain pending.

## Production progression follow-up

The user authorized normal devnet production upgrades and colony progression.
Solar Plant 4, 5 and 6 and Deuterium Synthesizer 2, 3 and 4 completed through
the actual live command UI. A public account read confirmed synthesizer 4,
solar 6, base deuterium production 76/hour, and energy 212/195 (full power).
The starting effective production was about 11/hour: base 14/hour at 79% power.
All five remaining earned tutorial rewards (metal, crystal, solar, robotics,
rocket launcher) were claimed. No purchased resources or admin grants were used.

Further prerequisite costs from the program's doubling research formula:
Impulse 1-3 = 14,000 M / 28,000 C / 4,200 D; Astrophysics 1-4 =
60,000 M / 30,000 C / 15,000 D; colony ship = 10,000 M / 20,000 C /
10,000 D. Combined 84,000 M / 78,000 C / 29,200 D excludes infrastructure
upgrades and flight fuel. Metal Storage 2 (40,000 capacity) and Crystal
Storage 1 (20,000 capacity) are needed for the largest individual costs.
Regular production cannot finish this entire chain in the same test session.
The read-only checkpoint helper now reports rates, resources, storage,
energy and construction deadlines; its syntax check passed.

Final independent account read confirmed Deuterium Synthesizer 5 and Solar
Plant 7, production 105 D/hour, energy 272/239, and clear construction and
research queues. Stored resources were 1,480 M / 2,890 C / 194 D. Lab 3 still
needs 450 D, about 2h27 of production at this rate without other rewards or
spending. Colonization and transport were not launched.

### Read-only devnet funding investigation

The user authorized investigation, not funding or purchases. The existing
store account `64SBDDso9t3CfpJrqfC4r72M4yakMoFSHLJTHMtQYVAS` is enabled;
its configured USDC mint is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`,
matching Circle's official Solana-devnet address. The game account holds zero
of this mint. Circle's public faucet offers 20 test USDC per request with a
two-hour limit and may require CAPTCHA. References:
https://faucet.circle.com/ and
https://developers.circle.com/stablecoins/usdc-contract-addresses .

Proposed first funded test, pending explicit user approval: request 20 free
devnet USDC for the existing game account, spend at most 6 test USDC on the
Daily Deuterium Cache (1, reward 750 D) and Daily Logistics Crate (5, rewards
8,000 M / 5,000 C / 2,000 D). These fit current storage based on the latest
read, but balances, caps and limits must be rechecked before submission.
This funds further infrastructure, not the entire colony path; research and
build timers remain unchanged. No funding, purchases, minting, grants,
authority changes or mainnet actions were executed in this investigation.

### Approved funding and first purchase blocker

The user subsequently approved one Circle request for 20 devnet USDC and
at most 6 test USDC spent on the two specified packs. Circle confirmed
"Tokens sent" for the existing G6tR game account. Funding signature
`5WkaMaHAwKhbEfKgkydN73LGqXkNgxAz7HGv6cZ9pHMVjKLnExo8xPCRzxSkTErfBcr8VnYcDgcVPDzLj67V56Nk`
was independently read at finalized with `meta.err === null`. The configured
mint balance was 20,000,000 base units (20 test USDC). No CAPTCHA challenge
was shown. After refresh the live store displayed this balance.

One Daily Deuterium Cache was reviewed at 1 test USDC and confirmed once.
The client failed before submission with "This command exceeds the Solana
transaction size limit. No command was submitted." The pending-state balance
read remained 20 test USDC; the Daily Logistics Crate was not attempted.
No successful pack purchase has been proven. The failure is in the sponsored
transaction serializer in `player-funded-session.ts`, not a resource grant or
mainnet payment. The current pinned lookup table is restricted to paired UFO
proofs by sponsor policy; do not broaden that policy as an incidental fix.
A separate approval request covers fixing/testing and publishing the store
transaction correction before retrying within the same 6-test-USDC budget.

### Checked store packet correction

The user authorized fixing, testing and publishing the correction, then
retrying the two packs within the same total 6-test-USDC limit. A fixture built
with the real Lazor SDK and cross-origin WebAuthn JSON reproduces 1,258 bytes
without rent and 1,281 with rent; the existing frozen address table reduces
them to 1,106 and 1,129 bytes. Fixture signatures are synthetic and never sent.
The client selects this table only for the existing passkey store bundle.
The sponsor resolves and verifies the pinned table, and admits the store
representation only with one preceding passkey precompile, one wallet execute,
one canonical store purchase and its optional matched rent contribution.
Wrong account PDAs, mint, token/system programs, periods, pack IDs, extra
payloads, extra commands, absent verification and reordered verification fail
closed. Existing debit limits, signature-verified simulation and rent
consumption checks remain unchanged; no new program/action permissions or
on-chain authority changes are introduced. The old UFO-only table restriction
now additionally recognizes this canonical, already-permitted store action.
Production build passed and the full selected regression suite passed 115/115.
Live purchases and colony progression are not certified by these fixture tests.

Commit `7ccf83d` was pushed to the existing branch. Vercel deployment
`dpl_FFGfYckvEyaUnWWrDPr84fSnYiSB` reached Ready, and the existing
`chained-universe.vercel.app` alias was assigned explicitly. Live `/app`
returned HTTP 200 with the new `index-k5rr9nJP.js` entry. The game was refreshed
and the 1-test-USDC cache was reviewed and confirmed once on the corrected
build. The live UI is still preparing; the user was asked to approve any owner
passkey prompt or report its absence. No successful purchase is claimed yet.
The latest independent token read remains 20 test USDC, so the
approved spend is still zero. The 5-test-USDC logistics crate has not been
attempted. Do not retry the first command until its pending state resolves
and its token balance and purchase ledger have been reconciled.

The corrected-build attempt subsequently ended with "Signing timed out after
60 seconds", before submission. The client was returned to its purchase
review, and the user was asked to click Buy themselves and complete Lazor's
passkey prompt. No second automatic retry was submitted and the logistics
crate remains untouched. Packet compression is built/tested/published, but
its real purchase validation is still gated by a completed owner signature.

### Real store purchases confirmed

The user completed both purchase approvals manually. Independent finalized
reads show `meta.err === null` for the fuel cache
`3XF4B4WmyV6A8AC6LXgzdQXV3AtRcXWSgQssfzRPV9J5zrANCRXGuo2JUYeMQkN4Ho66bnGFFJnYqidJW6YuooqS`
(`SponsorAccountRent`, `PurchaseStorePack`) and logistics crate
`2StSh8UzWc5mw4K4oaVmV4EKcwBNh3Ygp8aVdkaXFgoCe9wpZyTEGjo1JacCpxGz1EPV2XCRHTCf35pn35QZDjbr`
(`PurchaseStorePack`). Token balance is 14,000,000 base units: exactly 6 test
USDC spent from the original 20. No further purchases are authorized within
this budget. Both cards show purchased/disabled for the current period.
The resource read after logistics and lab 3 start was 9,147 M / 7,067 C /
2,597 D, below all 10,000-unit caps. Lab 3 completed; lab 4 subsequently
completed and lab 5 was started through ordinary Quick Play commands.
Daily check-in and the completed one-store-pack objective rewards were claimed.

Live testing found the store token-balance display still showed 20 although
the on-chain balance was 14. The command runner refreshed the world but not
token balances. A scoped correction refreshes token balances after confirmed
purchase commands and preserves success with an actionable warning if the
balance read fails. Focused tests verify that failed commands cannot retry or
refresh balances, and ordinary construction does not add token RPC calls.
This display correction does not change authentication, pack prices, economy
or on-chain state. New live purchases are not needed to test its unit guards.
The production build and full selected regression suite passed (118/118).
