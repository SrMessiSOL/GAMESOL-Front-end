# Trade Network Discount - Finalized Devnet Proof

Research Grid advanced from level 1 to level 2 in finalized transaction
`5WmzGZvqGVbN7EE6aT9D85Tojnwt5aNxXaM9cgb8Dp8y1s5bwVa3yvE8do6oHFm5JgY4tp1pSDafb4Ru9oZjCZ8T`,
slot 512199141, meta.err null, UpgradeAllianceBuilding instruction.

Both snapshots were read from program-owned accounts using the shipped decoders
after checking the Solana devnet genesis hash. Exact BigInt assertions passed:

| Resource | Base price | Actual debit | Discount |
| --- | ---: | ---: | ---: |
| Metal | 8,000 | 7,920 | 1% Trade Network |
| Crystal | 20,000 | 19,800 | 1% Trade Network |
| Deuterium | 8,000 | 7,880 | 1.5% Defense Coordination |
| Test AM | 150 | 148.5 | 1% Trade Network |

Treasury changed from 64,000 M / 41,000 C / 21,545 D / 815 AM to
56,080 M / 21,200 C / 13,665 D / 666.5 AM. Alliance XP increased 7,282 -> 7,912
(+630: 600 base plus 5% pre-upgrade Research Grid bonus). Other building levels
and deposit counters stayed unchanged. Wallet token pre/post balances are
identical in the upgrade receipt: AM was deducted from the already-funded
alliance treasury accounting, not charged again from the wallet. Fee 10,000
devnet lamports. Live UI shows Research Grid Lv 2 and the matching balances.

Funding was verified independently:
- Weekly Expansion purchase vBqwiV7HFEmN2qkdSJUXL7rBT7db4w9wkwmuXRkawkvN6tNi1YZ8mKB86cmUz85ggeQykRH8BPqbPaGDu9VgSHA
  debited exactly 30 test USDC and credited 30 to the configured store treasury.
- Monthly Sector Reserve 2FW31wVJgW5CvbNGWLqpztUapFRNA9aofe58pr1DUivZzF17ziCmycAHeDFfhaYYADSK2VoMVULqpWCKQrfoMFek
  deposited 60,000 M / 40,000 C / 20,000 D. Wallet token balances unchanged.
- The earlier upgrade approval timeout submitted no command and changed no
  treasury balance. Only the final confirmed upgrade above consumed resources.

Raw public snapshots and assertions: trade-network-devnet-proof-2026-10-17.json.
No mainnet action, authority change or additional resource pack purchase was
performed. Local UI quote fixes pass 233 tests and the production build but
remain unpublished pending their separate visual check.
