# Devnet quest and replay pass - October 19, 2026

## Scope

Two earned resource rewards claimed on controlled Default Homeworld 9:427:13.
No USDC or ANTIMATTER spent; network fees sponsored. No new ships, fleet
launches, NFT transfers, authority changes, program upgrades or mainnet writes.
No frontend publication in this pass. The new rehearsal script and docs are local.

## Signed Live Claims

### Colony Ship tutorial objective (period 0, quest 20)

- Finalized transaction slot 512867657:
  `54tk6tENsbBQAB76aaNNxAJMeKME1YeNcBxLbDWSPVF3w6axkbdXjB9cTLovds2W73RotSyK2AfCXHNyDPUiBqHh`.
- UI before claim: 28,562 metal / 32,999 crystal / 13,929 deuterium.
- Finalized account checkpoint 512867707: 33,562 / 37,999 / 15,929.
- Tutorial mask changed 404479 -> 1453055; bit 20 is set.
- Colony Ship remains 1 and active missions remain 0. Reward fits storage.
- UI changes the objective to COMPLETED / CLAIMED.

### Daily check-in (period 1, quest 0)

- Finalized transaction slot 512868167:
  `4Psf5g1uwCogf7zmGYHTMjtFGDqJZcusmrU2zfSMQ5BNY8RSFaXpVnad3aAcsenvAS6jJGwUosAXYms3nuBdsEsJ`.
- UI before claim: 33,565 / 38,001 / 15,932.
- Finalized checkpoint 512868229: 34,115 / 38,326 / 16,042.
- Delivered 550 metal, 325 crystal and 110 deuterium, matching streak-1 bonus.
- dailyCheckinDay 20740 -> 20745, streak 2 -> 1, totalCheckins 2 -> 3.
- Daily claimed mask is 1. Colony quest claim also synchronized daily/weekly
  epochs to 20745/2964 and cleared their old masks, retaining monthly mask 260.
  This is catch-up synchronization after a gap, NOT an observed midnight reset.
- UI shows check-in CLAIMED. Evidence: quest-checkin-claimed-2026-10-19.png.

## New Finding: Daily Check-in Quote

The live UI quotes 500/300/100, but the program adds the capped streak bonus,
delivering 550/325/110 for the restarted streak. It also says once every 24 hours,
while the implementation uses UTC day epochs, not a rolling 24-hour cooldown.
Fix the displayed reward and its storage-affordability calculation together;
retain the real program simulation. A base-only quote can mislabel capacity.
This finding is not fixed or published by this test pass.

## Unsigned Deployed-Program Checks

`node server/check-quest-guards-devnet.cjs`: seven rejections, no submissions;
referenced account data/lamports unchanged. Signature verification disabled:
these prove business-rule rejection, not control of the simulated wallet.

1. Default duplicate Colony Ship reward -> QuestAlreadyClaimed.
2. Default duplicate check-in -> DailyCheckInAlreadyClaimed.
3. NewAccount duplicate establish-command reward -> QuestAlreadyClaimed.
4. NewAccount incomplete Colony Ship reward -> QuestRequirementsNotMet.
5. Quest 255 -> InvalidQuest.
6. Raw period 4 bypassing client guard -> InvalidQuest.
7. Substituting NewAccount planet in Default claim -> Unauthorized.

Six existing completed-action replay checks also passed: filled resource offer,
completed transport, collected fighter queue, canceled resource offer, resolved
alliance rejection and resolved alliance approval. No records changed.

## Readiness Refresh

- Full dependency audit: 15 moderate, zero high/critical; no packages changed.
- Defender protection re-read: 2026-10-21 19:28:55 UTC. Combat remains blocked;
  same-alliance eligibility must also be satisfied normally.
- Outstanding quest cases: same-owner wrong reward target, exact cap/overflow,
  recurring metric/target binding, consecutive-day capped streak and actual
  UTC day/week/month transition behavior. Do not call this the full matrix.
- Other remaining gates are in MAINNET_READINESS_2026-10-19.md.
