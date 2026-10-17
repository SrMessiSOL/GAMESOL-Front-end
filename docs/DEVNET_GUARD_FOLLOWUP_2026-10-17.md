# Devnet Guard Follow-Up

Run after the verified alliance quote release was published. These are unsigned
Solana devnet simulations, not submitted or signed wallet transactions. Every
case compares referenced account data hashes and lamports before and after.
All nine cases passed with unchanged records and zero spending.

## Alliance Infrastructure

Reproduction: node server/check-alliance-infrastructure-guards.cjs

| Case | Observed program rejection |
| --- | --- |
| Replay completed monthly Sector Reserve | AllianceMissionAlreadyClaimed 6072 |
| NewAccount regular member attempts infrastructure upgrade | AllianceLeaderRequired 6076 |
| Default attempts unfunded Research Grid level 3 | AllianceTreasuryNotEnoughResources 6081 |

The member test substitutes both the real NewAccount authority and its actual
membership PDA, so it reaches the leader-role check rather than a mismatched
membership constraint. The unfunded test initially expected a resource-specific
error; the actual handler uses a combined treasury error. The expectation was
corrected and all three cases rerun successfully.

## Completed Actions

Reproduction: node server/check-completed-action-replays.cjs

| Case | Observed program rejection |
| --- | --- |
| Filled market offer settles again | AccountNotInitialized |
| Completed transport returns again | InvalidMission |
| Collected fighter queue collected again | NoShipBuild |
| Cancelled market offer cancelled again | AccountNotInitialized |
| Rejected membership application resolved again | AccountNotInitialized |
| Approved membership application resolved again | AccountNotInitialized |

Closed-account errors establish rejection at account loading, not later
business-rule checks. sigVerify is false; no claim is made about wallet
authentication, signer custody or a newly successful gameplay action.

Remaining actual-game gates include alliance leadership transfer/return and
expulsion/rejoin, controlled combat after NewAccount protection expires,
separately bounded planet sales and withdrawals, and real approved NFT ownership
transitions. Governance/sovereignty requires a launch-scope decision and separate
authorization. Mainnet security, configuration and deployment gates remain.
