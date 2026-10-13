# Devnet UFO upgrade preparation

The tested binary is saved locally in `.vercel/ufo-release-85c2440/game_state.so`.
CI: https://github.com/SrMessiSOL/GAMESOL/actions/runs/38314519277

SHA-256: `73e565f2b42f3f78fbb2699e1597d7dabac864f38d7ec6f93a65a000b84747b7`.
Size: 1,334,656 bytes. The live game needs another 239,464 bytes of ProgramData
capacity; its current balance covers the observed extension rent requirement.
The buffer needs approximately 6.78089068 devnet SOL plus transaction fees;
buffer rent is reclaimed on successful upgrade. Re-query costs before signing.

The unsigned plan is generated with:

```text
node server/prepare-ufo-squads-upgrade.cjs --plan-buffer
```

It saves public instruction payloads in
`.vercel/ufo-release-85c2440/squads-upgrade-plan.json`. The separately generated
buffer keypair stays in the ignored `.vercel` directory; it is NOT the Squads
member or game authority, and is never uploaded to Vercel or GitHub. The plan
does not create accounts, upload a buffer, sign, or send transactions.

After an explicitly approved buffer upload and handoff, re-run with
`--buffer <uploaded-address>` instead. This requires exact CI bytes and the
recovered Squads vault as buffer authority before producing verified payloads.

Execution must use Squads v3 authority index 1 and the member
`5LdLeYrc5zMsPV2sn7amFQwDbYSmvakxZPDmm5YZmPvR`. Upgrade and configuration
are separate transactions/slots. Keep the existing game ID and authority;
do not deploy a replacement game or reset planets. Verify deployed bytes before
activating issuer `9XEL6rVQ2GK85ic1j2Nf6kykybsAtsP8nYzNnNCMun4a`.

The member address appeared in older local wallet-login logs, but the inspected
Windows keypairs do not match it. The previously inspected default WSL wallets
also did not match. Additional WSL lookup was blocked by a VHD sharing violation;
no forced restart or disk operation was attempted. Browser-wallet custody has
not been verified. Never export a browser seed or paste secrets into chat.

## Staged on 2026-10-12

The approved upload completed through genesis-verified Helius devnet. Buffer
`6jWfknp2W2p6qwY6vCDZYynBDgTKi97EPLJEWWszL9Fj` exactly matches the CI binary,
and its authority is now the existing Squads vault. ProgramData capacity is now
1,334,656 bytes, sufficient for this binary. The game upgrade authority remains
unchanged. The staging helper's first post-check compared the entire metadata
prefix and reported a mismatch. Subsequent independent reads verified the
capacity, buffer bytes, and authorities. The helper now checks code and
authority separately from the mutable deployment-slot metadata.

Local approval page: `http://127.0.0.1:4318`.
It uses official legacy SDK `@sqds/sdk@2.0.4` installed only in ignored local
tools. This legacy SDK is deprecated, but matches the recovered v3 program;
do not replace it with the incompatible v4 SDK without migrating governance.
The API is loopback-only, origin/token guarded, and only accepts signatures for
the exact reviewed message. Every action is simulated before requesting a
user signature. No member secret is held by this service. Helius credentials
remain server-side. SDK dependency installation had scripts disabled.

The create-upgrade-proposal transaction passed actual devnet simulation.
Expected proposal #1: `DFEjJoSyE5B4bRLz3DUTWuBP1Cd9horuWU7J1WuQvLDk`.
It has not been signed or submitted. Upgrade approval/execution, issuer
activation, and real-wallet UFO claims remain pending user-controlled Solflare
signatures. Host/SBF/isolated-validator tests do not certify real Lazor CPI gameplay.

Loader instruction reference:
https://github.com/solana-labs/solana/blob/v1.18.26/sdk/program/src/bpf_loader_upgradeable.rs
