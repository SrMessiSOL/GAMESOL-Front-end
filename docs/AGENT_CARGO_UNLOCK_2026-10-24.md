# Three-Agent Cargo Unlock And Collection - 2026-10-24

Devnet only, existing test funds only. Automation remains PAUSED (confirmed in
the existing automation configuration). No manual-player wallets, mainnet,
authority changes, grants, new funding or USDC purchases were used.

## Publication

Protected attack guard: GitHub `624f851` on the existing game release branch,
deployed at [the public game](https://chained-universe.vercel.app/app).
[Verification](PROTECTED_ATTACK_RELEASE_2026-10-24.json) matches the public entry
and guard assets to the staged deployment and checks devnet genesis. Local and
cloud builds pass. Release command/preflight tests: 77/77. The unrelated dirty
working changes were excluded. Browser/passkey interaction was not retested.

## On-Chain Results

| Agent | Combustion Drive | Hyperspace Drive | New Inventory |
| --- | --- | --- | --- |
| One | 2 -> 6 | 2, unchanged | Large Cargo 0 -> 1 |
| Two | 2 -> 4 | 2, unchanged | Existing fleet preserved |
| Three | 2 -> 4 | 1, unchanged | Existing fleet preserved |

- Three sells One 10,000 fuel; One sells Three 6,000 metal. Both normal market
  trades cost 1 test AM each, with exact settlement/treasury fee/rent checks.
- Eight research upgrades use actual program prerequisites and resource costs.
  One's Large Cargo gate changes from TechLocked to a crystal shortage. Two
  and Three still reject the level-six hull gate without returning a transaction.
- One's existing colony 5:174:1 holds 10,000 crystal. It sells 6,000 to Two,
  which sells those 6,000 to One's homeworld through normal market orders.
  This is explicit inter-agent trading, not a bypass of the self-trade rule.
- One builds exactly one Large Cargo and accelerates its queue normally. Final
  inventory is one, shipyard empty, and the colony retains exactly 4,000 stored
  crystal. Colony ownership, fleet and other non-resource state stay unchanged.
- All four listings close and refund their rent. All three agents finish with
  empty queues and zero active missions. No attacks were launched.

## Costs And Recovery

26 finalized commands, 16 checks. Every confirmed command is retried against
its original signature; no duplicate debit or state changes occur. Each batch
also passed an independent `--verify` run with zero new signatures. Research
verification ran before the later fleet change; collection verification checks
the final state. The new plan tests include repeated completed-batch execution
without another purchase or build. Full agent API suite: 94/94 passing.

| Batch | AM Burn | AM Market Fees | Network Lamports | USDC |
| --- | --- | --- | --- | --- |
| Research/unlock | 8,145 | 0.005 | 100,000 | 0 |
| Supply/collection | 504 | 0.005 | 30,000 | 0 |
| Total | 8,649 | 0.010 | 130,000 | 0 |

130,000 lamports = 0.00013 test SOL; listing rent was recovered, not counted as
spending. Public evidence contains no private keys, signed transaction bytes,
RPC credentials or authorization secrets.

- [Research and settlement evidence](test-runs/three-agents-2026-10-19/agent-cargo-unlock-2026-10-24.json)
- [Colony supply, inventory and settlement evidence](test-runs/three-agents-2026-10-19/agent-large-cargo-collection-2026-10-24.json)

## Checklist Boundary

Adds evidence to existing T07/T08/T24/T35 only; broad rows remain PARTIAL.
One Large Cargo's queue-to-inventory and retry path is now proven, not every
hull or all cargo use cases. Battleships remain locked at Hyperspace 2 / 2 / 1;
crystal supply remains the main gate. Positive agent combat still waits for
the actual shields: earliest paired homeworld window October 26 at 15:52:58
Argentina time. Re-read shields before launching. Automation remains paused.
