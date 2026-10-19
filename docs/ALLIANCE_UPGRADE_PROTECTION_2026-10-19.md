# Alliance Upgrade Level And Price Protection

Status: deployed to devnet and verified byte-for-byte. Deployed protection
checks passed; matching frontend approved for publication. Automation stays PAUSED.

## Contract

`upgrade_alliance_building` now requires, after `building_id`:
`expected_level: u8`, then four `u64` maximum prices in metal, crystal,
deuterium and raw ANTIMATTER units (six decimals), in that order.
The instruction discriminator and account layouts are unchanged. Total encoded
instruction size is 42 bytes, including the eight-byte discriminator.

The program checks the leader, expected current level, level cap, freshly
computed discounted costs against ALL four approved maxima, and affordability
before mutating treasury balances, the building level or alliance XP.
New errors are appended to preserve existing error numbers. A concurrent
upgrade cannot silently purchase another level. Discounts that improve while
a request waits are permitted and the actual lower price is charged.
The old nine-byte unquoted instruction fails Anchor deserialization.

Both game UI entry points pass their displayed quote to the shared SDK.
The SDK rechecks level, prices and treasury affordability before wallet
preparation. Agent preparation binds the current quote into the unsigned
transaction; existing exact-byte intent signing/reconciliation is retained.
Recovery must reconcile or replay the SAME signed transaction, never silently
prepare the next upgrade level after a stale-level rejection.

## Tested Candidate

- Backend: `experiments/passkey-ufo-release`.
- Artifact: `.validation/alliance-protection-2026-10-19/game_state.so`.
- Bytes: 1,556,848.
- SHA256: `52d81fe227f133916e6c37369b6fbd5984407d1fcf139b82332793016d2006d2`.
- One-job SBF build passed; no exceeded-stack diagnostics. Existing Anchor
  cfg/deprecation/unused-code warnings remain; this is not a warning-free build.
- No program account, authority, mint, or state layout change.

Source SHA256 at build:

| File | SHA256 |
| --- | --- |
| `programs/game-state/src/lib.rs` | `031d02166d6f2a8e5e06968baceecefa476cafe7245b5dd7b854a03f18bb5536` |
| `programs/game-state/src/instructions/handlers.rs` | `9d7c484cd1eaa22fe560c287881464296b70a1d2ef3db21a15a9bf09fd7b52c0` |
| `programs/game-state/src/error.rs` | `34a4dd4b41ee01bdfa8734054cc51e97096d8e5128ea26ae21fad5a71b870982` |

## Evidence

- [125 local SBF cases](test-runs/three-agents-2026-10-19/alliance-protected-caps-local.json):
  all four buildings through levels 1-25, rejected level 26, all resource
  shortages, maximum discount/XP stack, invalid IDs, member/foreign treasury
  rejection, and unchanged state after rejected instructions.
- [12 local concurrency/recovery scenarios](test-runs/three-agents-2026-10-19/alliance-protected-races-local.json):
  different-building races, same signed bytes, two distinct same-level intents,
  cap and treasury races, former leader, four simultaneous bonus upgrades,
  three competing actors, all four insufficient ceilings, legacy payload,
  exact-signature replay after an ignored response, and a held quote receiving
  an improved discount. The stale-level and price failures were checked against
  actual on-chain error logs, not only a generic failed status.
- 34 agent/API tests passed; 382 existing frontend/server tests passed.
- Five quote tests passed, including 900 combinations of building, level and
  discount boundaries plus both displayed-quote UI bindings.
- TypeScript/Vite production build passed. No browser visual redesign was made;
  these results are not new signed-in desktop/mobile execution evidence.

Local fixtures used fresh identities and local-only genesis balances. Tests
assert non-devnet/non-mainnet genesis and load the checksum-pinned candidate
into one two-thread validator. Owned validators were stopped after each run.
The interruption test proves exact signed replay idempotency, not a new live
browser crash or API restart; the earlier live recovery report remains separate.

## Devnet Upgrade

[Finalized deployment proof](ALLIANCE_PROTECTION_DEVNET_2026-10-19.json):
slot 512923126, exact candidate SHA256, unchanged upgrade authority and
game/market config controls, zero trailing padding, consumed/refunded buffer.
Signer and fee payer matched their expected public keys. No size extension.
Gross temporary funding: 7.92695604 test SOL, below the verified 7.93962604 cap.
Net deployment cost: 0.01732 test SOL. No USDC or ANTIMATTER spent.
The market program was not upgraded. No mainnet action occurred.

The clean frontend release passed 386 tests and the production build,
including friendly pre-wallet messages for both new protection errors.
Unrelated local agent/SDK/market edits are excluded from that release.

[Deployed protection checks](test-runs/three-agents-2026-10-19/alliance-protection-devnet.json):
seven signed simulations against finalized deployed code cover stale level,
all four price ceilings, legacy payload and valid-quote affordability.
Two deliberately rejected transactions finalized with the correct named
level/price errors. Alliance and treasury bytes stayed unchanged. Total test
fees: 0.00001 test SOL; no USDC/AM spent. These prove deployed rejection paths,
not a funded successful devnet race: that remains resource-gated on the test
alliance. The funded concurrency/recovery proof is the local validator run.

## Release Gate

This is an instruction ABI change. Do NOT publish the new frontend against
the old program: older programs may ignore trailing instruction bytes and
therefore cannot enforce the new protections. Upgrade the program first,
verify deployed bytes/unchanged authority and exercise the new contract, then
publish the matching SDK/UI/API and refresh stale clients. Old clients fail
safely against the new program, but cannot upgrade until refreshed.

Signer, authority, budget, deployment and deployed rejection checks are complete.
Funded devnet upgrade/concurrency/replay and interactive Lazor execution are
still follow-up evidence, not claimed here. Nothing certifies mainnet readiness.

The frozen 110-instruction inventory is unchanged: this strengthens the
existing instruction in T20/T27/T35, not a new checklist family.
