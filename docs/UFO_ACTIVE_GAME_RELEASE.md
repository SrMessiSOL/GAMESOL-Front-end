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

The initial production-settings Vercel deployment was built successfully but
not assigned to the live game alias. Corrected deployment and active-game
activation must precede the real expedition/booster/loot/equipment test.
