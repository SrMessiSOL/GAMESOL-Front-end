# Advanced Ship And Combat Gates - 2026-10-24

## Scope And Evidence

Manual bounded batch using only the three existing devnet agents. Automation
remains paused. No wallet keys were loaded, no transactions signed or submitted,
no tokens spent, and no program, authority or mainnet changes made.

- [Baseline audit](test-runs/three-agents-2026-10-19/combat-readiness-2026-10-24.json)
- [After-fix audit](test-runs/three-agents-2026-10-19/combat-readiness-2026-10-24-after-fix.json)

Each audit checks the devnet genesis, reads all five owned planets and token/SOL
balances, calls the actual API prepare route with unsigned program simulation,
then compares complete state/balance snapshots. Both comparisons passed.

## Results

All 14 hulls were prepared at quantity one for each agent: 42 program rejections,
23 for prerequisites, 14 for crystal and five for metal. These prove the observed
negative gates only; they do not prove successful construction or collection.
Hyperspace Drive remains 2 / 2 / 1; Battleships require level 4 and Shipyard 7.
All three homeworlds already have Shipyard 7. Material supply remains a gate.

Six directional attack preparations used existing fighters and cruisers, zero
cargo and speed 100. Before the fix, four returned launch transactions even
though the destinations were protected; the other two failed program simulation.
No attack was submitted. Arrival-time enforcement is not a launch-time guard.

The shared GameClient now reads the actual destination and chain clock before
vault preparation. It rejects unoccupied, self-owned or protected attack targets
and fails closed if chain time cannot be read. Protection uses the maximum of
the explicit shield and the seven-day creation shield, matching backend rules.
After the fix all six preparations reject specifically for target protection
before signing or instruction simulation. The guard is advisory client/API
preflight, not a new on-chain launch restriction. The backend remains unchanged.

Regression suite: 92/92 passing, including exact beginner-shield expiry,
explicit shield extension, absent/own targets and unavailable chain clock.

## Remaining Gates

| Planet | Protection Expiry (Argentina UTC-3) |
| --- | --- |
| Agent One 5:174:13 | October 26, 15:35:22 |
| Agent Two 5:193:9 | October 26, 15:52:58 |
| Agent Three 5:185:12 | October 26, 15:52:58 |
| Agent One 5:174:1 | October 26, 16:21:14 |
| Agent One 5:174:2 | October 28, 18:33:24 |

Dates are the observed on-chain shields; re-read before launching. Do not launch
now and wait in an unresolvable mission. No shield bypass or rule changes.
Positive defended combat, casualties, loot credit, fleet return and free-slot
proof remain open. Advanced hull queue-to-inventory coverage also remains open.
This adds evidence only to existing T08/T10/T14/T35, not new checklist families.
Nothing published; browser/Lazor and signed-transaction parity are not claimed.
