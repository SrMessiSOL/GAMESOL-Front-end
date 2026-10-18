# Planet Listing Compression and Devnet Verification

## Release

- Code commit: `6d53694`, branch `feat/crypto-ufos-wallet-link`.
- Production deployment: `frontend-i9xz73e8f-srmessisols-projects.vercel.app`.
- Public game: https://chained-universe.vercel.app/app
- Public page and deployment-pinned entry bundle both returned HTTP 200.
- No program upgrade, authority change, new lookup table, or economy change.

## Fix and Checks

Planet listings were not routed through the existing frozen lookup table. The observed owner-approved packet was 1,233 bytes, exceeding Solana's 1,232-byte limit. The client now selects compression for the exact planet-listing shape. Sponsor policy checks its discriminator, minimum price, canonical fixed accounts and bounded optional rent setup. Existing single-passkey and single-execute restrictions remain intact.

The complete suite passed 249 tests before the additional client-route test was added; all four planet-specific tests then passed, including the added route test. TypeScript and the production build passed. Packet fixtures cover public and long Preview origins, with and without rent. Negative cases cover substituted fixed accounts, invalid price, extra instructions, incorrect rent recipient, missing/late passkey and repeated execute.

## Finalized Devnet Results

Seller: `G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r` (SrMessiGAMESOL / portal Default).

Colony: `CyKmBAd6FttU8szoaUEao1cY7iUQGEhZGCJaAW7wgkFD`, coordinates `9:427:1`.

- Listing for 1 test ANTIMATTER: `3Nyyk5sPGh7KTJWdhRcp6e22yghrFG8LEHwvZBDNkmpgs7X6fR81sZ4TG4iwA5RoKesF4X4enwz2dDuNpgroGjmG`, slot `512336416`, error null.
- Cancellation: `2ra4CeDtjboV8qZ1E4ekCUUf8LMF3qFGhjLPcEi744gp9sCwHAJPi4nmSQirExzkCBYFfF5yCgmx6imq7PYGBS1X`, slot `512336599`, error null.
- Each transaction fee: 10,000 devnet lamports.
- Both receipts: pre/post token balances unchanged. No USDC or ANTIMATTER spent.
- After cancellation: public UI reports no active planet listings; colony authority remains the seller; active missions zero.
- Listing index remains allocated after cancellation; its existence alone is not an active-listing indicator.

Screenshots: `planet-listing-confirmed.jpg`, `planet-listing-cancelled.jpg`.

## Remaining

Planet purchase and return purchase between accounts are not yet tested. This release verifies listing/cancellation only, not settlement, transferred ownership indexes, or seller access revocation.
