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
