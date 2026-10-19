# Frontend / program check parity

## Initial Storage Release Boundary

Storage purchase protection is released and tested. Whole-game pre-signing
parity is NOT yet certified. No generic simulation gate was included in this
release: simulating a raw instruction outside Lazor's actual wrapped execution
can misrepresent authorization, precompile indices, rent and CPI context.
Existing submitted-payment recovery must never be blocked by replaying a fresh
purchase check against an already-filled listing.

## Follow-Up: Shared Devnet Pre-Signing Checks

The follow-up implementation adds a strictly devnet-genesis-checked, read-only
program-rule simulation before new Lazor approvals. Session commands simulate
their actual wrapped instructions; passkey commands simulate the prepared game
instructions without claiming wallet authentication. Planet purchase checks run
inside new-intent preparation, never ahead of pending-payment recovery.

Explicit UI/client checks also cover numeric encoding bounds, building fields,
maximum levels, cross-queue building restrictions, store/quest reward capacity,
alliance contribution affordability, infrastructure treasury affordability and
leader eligibility. The deployed store rejects shield packs and oversized
deliveries; neither is offered as a valid purchase in the follow-up UI.

See `DEVNET_FRONTEND_GUARDS_2026-10-19.md` and the read-only rehearsal JSON for
evidence. This improves normal-command coverage; it does not certify every
security constraint, legacy setup/withdrawal path, race or mainnet workflow.

## Reviewed surfaces and remaining verification

| Surface | Existing frontend protection observed | Remaining parity gate |
| --- | --- | --- |
| Resource purchase storage | Shared bigint check in review, event handler and fresh client read; all three resource types covered | Complete: exact-capacity, overflow, missing/invalid data and large-integer regressions; live desktop/mobile overflow |
| Resource/planet markets | Balance/unlock UI; config, token-account and ownership-index client checks | Fresh listing status/price, owner eligibility, active obligations, balances and races before every new authorization; each rule needs executable negative coverage |
| Buildings/research/ships/defenses | PlanetWorld prerequisite tables, resource eligibility and queue controls | Prove every backend prerequisite, unique-defense/field limit, queue state and fresh-resource boundary in both UI and direct client calls |
| Fleet | Cargo, ships, slots, coordinates and target preflight in PlanetWorld; hostile-target regression suite | Full mission-specific parity: fuel, destination ownership/protection, cooldowns, colony limits, return/arrival timing and destination resource handling |
| Store | Configuration/enabled client check, balance and purchased-state controls | Fresh per-period limits, exact on-chain pack eligibility, protection extension bounds and documented clipping semantics; do not substitute market overflow semantics for store rules |
| Quests | Completion, claimed-state and reward-target controls in PlanetWorld | Fresh duplicate claims, reset windows, target eligibility and reward capacity semantics before signing |
| Alliances | Membership/leader checks for approval, rejection, expulsion and leadership transfer; contribution/infrastructure UI checks | Fresh balances/treasury, membership capacity, request existence, founder/leader leave restrictions, infrastructure costs and per-period contribution eligibility |
| UFO utility | Separate ownership verification flow | Retain visible persisted avatar; utility requires current ownership and valid eligibility; test stale, transferred, unlinked and wrong-account cases |
| Quick Play | Session refresh and expiry validation before commands | Finish expiry/revocation/account isolation and browser restart matrix; never imply UI ON overrides chain authorization |
| Governance / sovereignty | Feature flags and several client authority/configuration checks | Remain gated until separately validated; no activation in this release |

Source surfaces inspected: `src/Markettab.tsx`, `src/market-client.ts`,
`src/PlanetWorld.tsx`, `src/StoreControls.tsx`, `src/game-state.ts`, and
`src/player-funded-session.ts`. Backend error inventories inspected in sibling
`passkey-ufo-release/programs/{game-state,market}/src/error.rs`. Error inventories
alone are not proof of all deployed constraints or build provenance.

## Acceptance standard for each remaining rule

1. Derive the rule from the exact backend release, not only an error name.
2. Explain unmet requirements and disable the relevant confirmation in the UI.
3. Re-read relevant chain state before creating a NEW signing request, with a
   client-side guard that cannot be bypassed by calling the client directly.
4. Regression-test the actual client method and assert no wallet request or
   submission on failure. Cover exact boundaries and unavailable state.
5. Check desktop/mobile and successful paths as well as failures. Preserve
   pending-payment reconciliation, cancellation and retry behavior.
6. Keep all on-chain checks. State can change after approval: handle genuine
   races honestly without false failure messages or duplicate submissions.

PDA derivation, signer authentication, token ownership and cryptographic proof
checks remain authoritative on chain. Frontend eligibility is UX protection,
not a replacement security boundary or a promise that every transaction succeeds.
