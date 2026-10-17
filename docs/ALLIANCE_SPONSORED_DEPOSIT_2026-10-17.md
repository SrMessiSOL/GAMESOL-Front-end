# Sponsored resource deposit SOL reserve correction

NewAccount's daily 500-deuterium contribution stopped client-side with:
`Fund the LazorKit wallet with at least 0.05 devnet SOL before creating game accounts.`
Its wallet held about 0.0044 devnet SOL, but the alliance, treasury, membership,
planet, token accounts and authorization already existed. The command was using
the sponsored gameplay executor. A redundant legacy rent-reserve guard inside
`depositAllianceResources` blocked it before any transaction submission.

The check now remains only for self-funded legacy vaults, not the sponsored
executor. Vault authorization, on-chain ownership, mission eligibility, sponsor
policy and balances are still validated. Token deposits remain passkey-only.
No fixed resource grants, reserve transfers, program or authority changes.

Four executable method-level regressions cover sponsored deposits, retained
legacy reserve checking, AM passkey routing and unauthorized vault rejection.
Full frontend/server suite: 218 passed, zero failures.
Real NewAccount contribution and Logistics Hub activation remain pending.
