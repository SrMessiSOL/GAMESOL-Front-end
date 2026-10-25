# Ship And Defense Acceptance - 2026-10-24

Existing T07/T08/T09/T15/T24/T35 coverage; no new checklist families.
Devnet only, three existing agent wallets, existing funds. Automation PAUSED.
Nothing published; no program upgrade, authority change or mainnet action.

## Finalized Evidence

[Public receipts, snapshots and rejection logs](test-runs/three-agents-2026-10-19/agent-ship-defense-2026-10-24.json)
record 33 successful finalized commands and 95 checks. Every confirmed command
was retried without duplicate debit. Independent read-only verification passed
at 2026-10-25 02:03:21 UTC with zero new signed actions.

| Agent | New collected inventory | Research completed |
| --- | --- | --- |
| One | Recycler 1, Ion Cannon 1, Small Shield Dome 1 | Energy 3, Shielding 2 |
| Two | Light Laser 1, Heavy Laser 1, Gauss Cannon 1 | Weapons 3 |
| Three | Solar Satellite 1, Rocket Launcher +2 (total 3) | Unchanged |

Solar Satellite and Light Laser completed naturally, without acceleration.
Satellite power increases 342 -> 367, matching the planet-temperature formula.
Other production rates/caps remain unchanged. All construction/research queues
are empty and no missions are active. Existing hulls and ownership are preserved.
Three earned scouting claims deliver 2,400 metal / 3,000 crystal / 900 fuel.
Three ordinary inter-agent trades supply materials; listings close and rent
returns. Exact queue resource debits include production at the settlement time.

Costs: 5,103 test AM burned; 0.0075 AM market fees; 165,000 lamports network
fees; zero USDC and no new funding. Remaining SOL / AM / USDC balances:

| Agent | Test SOL | Test AM | Test USDC |
| --- | ---: | ---: | ---: |
| One | 4.39173408 | 357412.600833 | 0.999 |
| Two | 0.20283872 | 134498.924999 | 0 |
| Three | 0.18959464 | 146952.168581 | 0 |

## Negative And Retry Cases

Unsigned deployed-program simulations prove missing prerequisites, unsupported
missiles, early collection, duplicate collection, all four shared ship/defense
queue blocking directions, dome quantity-two rejection and duplicate dome
rejection. Simulated failures preserve state. API tests reject zero, negative,
fractional and greater-than-u32 quantities before a transaction is returned.
These are not claims of successful overflow construction or combat coverage.

The final audit initially failed because it incorrectly expected planet combat
technology mirrors to remain unchanged after research. The audit now permits
only the planned mirrored changes; a regression also rejects unrelated armor
changes. No transaction was repeated to correct the audit.

## Item Completion Matrix

Construction observation is not full item acceptance or combat verification.
Prior receipts remain linked from the canonical checklist.

| Catalog items | Queue-to-inventory observation | Still needed |
| --- | --- | --- |
| Small/Large Cargo, Light/Heavy Fighter, Cruiser, Probe, Colony Ship | Prior live evidence | Remaining quantity/overflow and special-use coverage |
| Recycler, Solar Satellite | Passed this batch | Recycler supported use; remaining boundary/parity cases |
| Battleship, Battlecruiser, Bomber, Destroyer, Deathstar | Prerequisite rejection on all three agents | Eligible construction/collection and supported use |
| Rocket Launcher, Light/Heavy Laser, Gauss, Ion, Small Dome | Passed this batch, including quantity-two launchers | Remaining inventory limits, vault parity and combat effects |
| Plasma Turret, Large Dome | Prerequisite rejection on all three agents | Eligible construction/collection and combat effects |
| Anti-Ballistic / Interplanetary Missile | Program rejects as unsupported | Explicit launch exclusion decision or implementation and tests |

This yields observed construction cycles for 9/14 hulls and 6/10 defense
catalog entries, not complete T08/T09 acceptance. Controlled agent combat still
waits for actual beginner protection expiry. No protection was bypassed.

## Local Fixes And Release Gates

The planet view could label unsupported missiles buildable. A shared local
guard now blocks unsupported missiles and invalid/existing dome orders before
wallet preparation; readiness labels use that guard. Focused SDK and actual
UI-expression tests pass. TypeScript passes; 86 command/modal regressions and
two defense-availability tests pass. The final full API suite passes 103/103,
including the mirrored-research regression.
Desktop/mobile visual review subsequently passed and guard commit `4162c50`
was published; see [release and follow-up boundaries](AGENT_SHIP_DEFENSE_BOUNDARIES_2026-10-24.md).

The frozen scope audit fails because the existing backend includes
`resolve_colony_conflict` and `resolve_colony_conflict_vault` beyond its baseline.
No instructions were added this batch. These belong to existing T12, but need
an explicit inventory reconciliation; the frozen baseline was not overwritten.
