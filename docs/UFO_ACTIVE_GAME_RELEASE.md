# Active-game rollout correction

The actual deployed LazorKit frontend targets devnet program
`J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq`, not the older public-game
program `FJGxh6SKgNoTVzHj98oBsC2oaEy8ovadVJf8rDUNaEHb`. The earlier Squads
upgrade and activation proof is valid for that older program only. It does not
prove UFO support in the active game. This mismatch was caught before promoting
the new frontend; the existing homeworld was not moved or reset.

The active game's ProgramData is
`Cw66pUHTrTRRCtZYF4MNxcJ4GDTvjdZfPj9bno8rxXZT`. Its admin and upgrade
authority are the existing WSL deployer
`EhT4UUmsHyd41bZSGzj1W72yu2EptHk8sEvnK7aaNuBu`.

Backend release branch `feat/passkey-ufo-devnet` preserves the active local
passkey engine source and its Lazor-specific player/ownership contracts, adds
the UFO module, and retains the validated Anchor 0.31.1 stack fixes. Its cloud
host/SBF/isolated-validator checks must pass before an active-game upgrade.
The existing program ID, account state, and authority must remain unchanged.

The frontend issuer now targets the active program. Quick Play sponsorship
allows exactly one canonical, self-contained Ed25519 proof from the configured
UFO issuer, bound to this program/collection/domain and paired with a UFO action.
Generic Ed25519 instructions, cross-instruction offsets, duplicates and late
proofs remain rejected. Debit limits are unchanged.

The corrected active-game artifact passed 69 host tests, the SBF stack gate,
and the isolated expedition/booster/claim/equip validator loop:
https://github.com/SrMessiSOL/GAMESOL/actions/runs/38328270029

Artifact SHA-256: `20f9316b06bfd61ea7d011c88a6658b398fd89e11b8b3a8287300ca08b004c15`.
Active upgrade: `2d24SXWkMfuszAz3bjpBrQSJaWJvZ3v51mD31uef2hQ9PR1QcL8Scm9ygKZQZPZzURsNw5bXGW78AFZyVhSSGun1`.
Active issuer configuration: `3wj76GpKgrrjQmuQxSZhFAWnvrmAKnBP5wEk8iNvgjGkuuh7hyEotHHwRarXbCxN2uDAJKkqwV8ceptadNQsumqY`.
Both signatures were independently verified finalized with no errors. The
deployed program payload matches the artifact and its authority is unchanged.

The live alias now points to
https://frontend-hz1vwzn58-srmessisols-projects.vercel.app . Its cloud build
passed and the UFO API returned enabled=true, network=devnet, storage=on-chain.
The live game loaded the same Homeworld 9:427:13 after the upgrade. The focused
frontend suite passed 61 tests plus the separate existing paymaster policy suite.
Real holder authorization and player reward-loop checks remain separate.

## Launch transaction size correction

The live #513 holding-wallet authorization succeeded, but the first sponsored
launch failed during transaction encoding. A reproduction using the installed
LazorKit 2.1.0 SDK measured 1,335 bytes for the session launch with protocol
fees, proof and atomic account rent. Solana permits 1,232 transaction bytes.

Frontend commit `5086081` compresses the same command to 1,152 bytes using the
devnet table `EZU4CQtw4Sr8V2kQhtQKYpAEuCwNcy8PLgVuGpfGnMew`. The table contains
only 22 shared game, sysvar and Lazor fee addresses. No holder or player keys
are added to the table. Creation cost 4,511,040 test lamports in rent, plus fees.

Creation: `iDA21QVxcV9BGt9WmPiMg2aKtmySq9GdmZ4Svc9w7AxXbAGqjJ3AcvVqGKbAR9hWm5iB1XcykKwytns158BR63Y`.
Freeze: `5S7wxYq8V59SMCaCBVcJU7VVRrU5mS8Wtmm4DJmT8hU1B3mfgLxU5Hgnk7f2LL1F9tBXgJMVz2a1tLrWWLz5EyNx`.
Both were independently verified finalized without errors. The table is
active, owned by the address-table program, immutable, and content-matched.

The frontend verifies devnet genesis, sponsor, table owner, immutable status
and exact contents before compiling. The sponsor accepts only this table,
resolves every loaded account before policy and debit checks, and restricts
its use to a canonical issuer proof paired with a UFO gameplay instruction.
Unknown, mutable, deactivated, altered, unresolved and duplicate table entries
are rejected. Ownership precompile checks and sponsorship debit limits are
unchanged; account rent and launch still execute atomically.

Validation: 67 focused tests, the existing paymaster policy suite, TypeScript
and `git diff --check` passed. The Vercel cloud build also passed. The live
alias was promoted to
https://frontend-pbt47r43h-srmessisols-projects.vercel.app
(`dpl_B92C1qtembLgRgMeBSuSsjc9t9Ex`). The live UFO API returned HTTP 200 with
enabled=true, network=devnet and storage=on-chain. Refreshing retained
Homeworld 9:427:13 and Crypto UFO #513. The real-player launch, booster, claim
and equip checks must be recorded after successful execution.

The first live compressed retry uncovered an additional executor guard:
`usePasskeyGameplayVault` considered every Ed25519 precompile non-routine and
silently switched the UFO bundle to passkey execution. The session-size
fixture did not cover that dispatch boundary. The corrected dispatcher admits
only the canonical, commander-bound proof plus its matching start/advance/claim
action (and optional atomic start rent); direct System/SPL instructions and
arbitrary proofs retain explicit passkey authorization. Signature verification
still occurs through the precompile and on-chain issuer checks. Two additional
runtime classifier regression tests cover valid bundles, mismatched commanders,
proof/payload edits, unrelated actions, duplicate/late proofs and rent changes.

Dispatcher commit `51b68c1` is live at
https://frontend-h5v9hw6m5-srmessisols-projects.vercel.app
(`dpl_AtmAKyNBM9hRABobf2244BE5dNGZ`) behind chained-universe.vercel.app.
Its cloud TypeScript/Vite build passed. The full focused frontend suite now
passes 69 tests; the transaction fixture uses the actual distinct Lazor wallet
and derived commander vault identities. The sizes remain 1,335 / 1,152 bytes.

Read-only devnet verification found no loadout at
`EjqHypWAD6NWdUfXcwS4fkU7K8zsTDY75uDJWBPXiGLh` for commander
`G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r` after the encoding failures.
No expedition or launch cooldown was consumed. The player-loop test remains
pending: Quick Play is off, and Chrome blocked the automated renewal popup.
The user has been handed the live account menu to activate Quick Play through
a direct browser click. No real expedition, booster rescue or claimed loot is
reported as verified yet. Mainnet is unchanged.

## Live rent quote correction

The user activated Quick Play through Chrome and the UI confirmed ON. The next
launch passed transaction encoding and on-chain simulation, but the sponsor
correctly rejected an overfunded rent bundle. No launch was sent.

The shared account-rent builder still assumed 3,480 lamports/byte/year and a
two-year exemption. Live devnet RPC quotes were lower:

| Account size | Old estimate | Live quote |
| --- | ---: | ---: |
| 1,027 bytes (loadout) | 8,038,800 | 5,867,400 |
| 16 bytes (each cooldown) | 1,002,240 | 731,520 |

The obsolete total was 10,043,280 lamports, while account creation consumed
7,330,440 lamports. The difference exceeded the routine allowance and triggered
the rent-consumption check. Commit `6460216` replaces the fixed estimate with
`getMinimumBalanceForRentExemption` for each distinct missing account size.
Existing accounts are not funded again, duplicate sizes are quoted once, and
RPC failures or invalid quotes fail closed. No quote persists between commands.
The sponsor's rent-consumption invariant and debit limits remain unchanged.

Validation: 74 focused tests, the existing paymaster policy suite, TypeScript
and diff checks passed. A regression confirms the live quoted bundle passes
sponsor accounting while the overfunded bundle remains rejected. Live player
loop proof still depends on deploying this correction and completing the test.

The rent-fix cloud build passed and the existing live alias was promoted to
https://frontend-d7f53toyw-srmessisols-projects.vercel.app
(`dpl_HRVAbJhMfPDKSsZ25MjXAA3YeS2v`). Runtime source is commit `6460216`.
The promoted UFO status API returned HTTP 200, enabled=true, network=devnet and
storage=on-chain. The existing homeworld and #513 selection survived refresh.
The live game is waiting for the holding-wallet verification approval before
the final launch retry. Quick Play was activated by the user; no real loot
claim is reported as completed at this checkpoint.
