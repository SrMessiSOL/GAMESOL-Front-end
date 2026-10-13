# Devnet Fleet Rehearsal

## October 13, 2026 checkpoint

Live browser: `https://chained-universe.vercel.app/app`
Commander: `G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r`
Homeworld: `9:427:13`

### Executed through the actual game

- Robotics Factory 0 -> 1: started, waited for natural timer, finished.
- Robotics Factory 1 -> 2: started, waited for natural timer, finished.
- Full browser refresh restored the homeworld and real #513 portrait.
- Shipyard no longer reports a missing robotics prerequisite after refresh.
- No paid packs, ANTIMATTER acceleration, NFT transfers, or mainnet actions.

### Current gate

Last displayed balance: 2,599 metal, 1,074 crystal, 75 deuterium.
Shipyard 0 -> 1 costs 400 metal, 200 crystal, 100 deuterium.
Therefore the displayed deuterium shortfall is 25. Production may accrue
between checkpoints; reread the balance before another action.

Light Fighter requires Shipyard 1 and costs 3,000 metal and 1,000 crystal.
After paying the shipyard from the recorded balance, the combined path needs
approximately 801 more metal and 126 more crystal, plus the deuterium shortfall,
before accounting for accrued production or other upgrades.

The displayed power grid is 79 produced / 100 consumed (79% efficiency).
Evaluate restoring energy and early resource production before changing balance
constants. A resource wait is not by itself a transaction failure.

### Proof boundary

This is live browser execution and refresh persistence evidence. Transaction
signatures were not captured independently in this checkpoint. No ship was built
or launched yet, so fleet arrival, resolution, return, and post-flight persistence
remain unverified. Do not mark the whole fleet loop or mainnet readiness complete.

Local screenshot: `.vercel/ui-check/fleet-progression-resource-gate.png`.

### Next steps

1. Reread production and exact resource balances.
2. Build and finish Shipyard 1 when affordable, with natural timers.
3. Build one Light Fighter when affordable.
4. Choose a non-hostile devnet mission, verify its allowed destination and fuel.
5. Capture the launch and resolution signatures and confirm them on devnet.
6. Verify fleet counts, resource changes, mission slots, and refresh persistence.

## Accrued production fix published

Frontend fix `96af430` was pushed to `feat/crypto-ufos-wallet-link` and deployed
to `frontend-ln335cr7q-srmessisols-projects.vercel.app`, then promoted to the
existing `chained-universe.vercel.app` alias after the cloud build passed.

The planet display and affordability checks now project resources using the
program's integer efficiency, saturating production arithmetic, storage caps,
and 24-hour settlement limit. Stored state and balance constants are unchanged.
19 focused tests and TypeScript passed before publication.

Live browser verification after reload displayed 2,615 metal, 1,084 crystal,
and 76 deuterium, compared with the previous stored 2,599 / 1,074 / 75.
Shipyard remained correctly disabled because it requires 100 deuterium.
No new construction transaction was submitted in this checkpoint.
The next gate is natural production, not a frozen affordability calculation.
Screenshot: `.vercel/ui-check/resource-fix-live.png`.
