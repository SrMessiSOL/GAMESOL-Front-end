# Live Devnet Test Matrix

Checkpoint: October 13, 2026. Live frontend release: `52a2a5d`.
Game: https://chained-universe.vercel.app/app
Commander: `G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r`
Homeworld: `9:427:13`.

## Automated checks

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
