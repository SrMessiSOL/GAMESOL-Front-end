# Recovered devnet upgrade authority

Verified read-only against official Solana devnet RPC on 2026-10-12.

- Squads version: legacy v3.
- Squads program: `SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu`.
- Multisig configuration: `D6UaXodCsKHt9QGwSpJAWrYUGnkPESM6semtumbi2WMH`.
- Vault / authority index: `1` (u32 little-endian).
- Vault: `5Gq1tU4eCbuWyR7TEknwdKsbTxk3H8W4SfkT8Nsbuzs`.
- Threshold: `1` of `1` member.
- Member: `5LdLeYrc5zMsPV2sn7amFQwDbYSmvakxZPDmm5YZmPvR`.
- Current transaction index: `0`.
- Game: `FJGxh6SKgNoTVzHj98oBsC2oaEy8ovadVJf8rDUNaEHb`.
- Game ProgramData: `2d15oahNV6GMcLKyTRRounteFzrEGRP2AL1zkjV2c4ky`.

The multisig account owner and `account:Ms` discriminator were validated. Its
vault derives from `["squad", multisig, index_u32_le, "authority"]` under the
Squads v3 program. That derived address exactly matches the game ProgramData
upgrade authority. Earlier checks of Squads v4 vaults used the wrong version.

This recovers the authority path, not permission to submit an upgrade. No
transactions were signed or submitted. The sole member must authorize a v3
upgrade transaction. Its wallet availability has not been verified. There is
no verified MetaDAO proposal binding for this multisig; do not confuse it with
the separate experimental MetaDAO DAO and Squads v4 multisig.

Official account layout:
https://github.com/Squads-Protocol/squads-mpl/blob/main/programs/squads-mpl/src/state.rs

Official authority derivation:
https://docs.squads.so/squads-v3-docs/development/authorities
