# Ship And Defense Boundaries

Devnet only. Existing T08/T09/T35 cases; automation confirmed PAUSED.

After publication of defense guard commit `4162c50`, all three agents ran
24 unsigned simulations against the deployed program. This batch loaded no
keypair and signed/sent no transaction. No SOL, USDC or ANTIMATTER was spent.

[Program logs and byte-for-byte before/after snapshots](test-runs/three-agents-2026-10-19/ship-defense-boundaries-2026-10-24.json)
prove these direct ship and defense instruction boundaries for each agent:

| Raw instruction case | Deployed program result |
| --- | --- |
| Quantity zero, bypassing SDK validation | InvalidArgs 6016 |
| Quantity 4,294,967,295 | InsufficientMetal 6005, not wrapped/discounted cost |
| Ship type 14 / defense type 10 | InvalidShipType 6017 / InvalidDefenseType 6018 |
| Another agent substituted as planet authority | Unauthorized 6000 |

The test clones actual SDK-prepared instructions, checks their exact direct
8-byte-discriminator/u8/u32/i64 layout, changes only the selected field, and
requires the expected program error. All owned planet account bytes, token
account bytes and SOL balances are identical afterward. This proves owner
binding in program simulation, not cryptographic/passkey or vault parity.

This closes observed raw zero/maximum/invalid-index/wrong-owner subcases, not
successful maximum inventory capacity or inventory-addition overflow behavior.
Resource-shortage rejection is not a successful maximum-quantity build.

## Remaining T08/T09 Gates

The unchanged item matrix remains in
[ship/defense construction acceptance](AGENT_SHIP_DEFENSE_ACCEPTANCE_2026-10-24.md).
Five advanced hull cycles and eligible Plasma Turret/Large Dome cycles remain
prerequisite/material blocked. No resources were granted or new funding sought.
Combat effects and remaining inventory/vault-parity cases are still open.
Missiles remain unsupported, not silently removed from launch scope.
The complete local agent regression suite passes 104/104 after this batch.

## Published UI Proof

[Release verification](DEFENSE_UI_RELEASE_2026-10-24.json) confirms the public
game and candidate serve identical hashed JS/CSS and the Solana devnet genesis.
[Desktop/mobile result records](DEFENSE_UI_GUARDS_2026-10-24.json) and
[release notes](DEFENSE_UI_GUARDS_2026-10-24.md) describe the isolated read-only
React fixture checks. Guards were checked before publication; screenshots are
saved alongside this report. No live wallet action was used for UI testing.
After publication, the actual signed-in public game defense modal was checked
at 1440x900 and 390x845 CSS pixels: quantity-two domes and both missiles remain
disabled with the correct labels, without horizontal overflow. No command was
submitted; quantity was restored to one and the modal closed afterward.
[Live DOM records](DEFENSE_LIVE_UI_2026-10-24.json).
