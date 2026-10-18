# Planet Market Round Trip - Devnet

## Outcome

The colony at `9:427:1` was sold from SrMessiGAMESOL to NewAccount for 1 test AM and then sold back for 1 test AM. Both purchases finalized successfully through the corrected Preview, using the installed Lazor SDK's deferred authorization/execution flow. No new address table, program upgrade, authority change, USDC spending, or mainnet action was involved.

- Original owner: `G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r` (portal Default).
- NewAccount: `Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd`.
- Colony: `CyKmBAd6FttU8szoaUEao1cY7iUQGEhZGCJaAW7wgkFD`.
- Tested Preview: `frontend-790ol43p2-srmessisols-projects.vercel.app`, through `gamesol-devnet-qa.vercel.app`.

## Root Fix

Planet purchases were omitted from the existing compression routing. Adding the existing market lookup table alone produced a 1,227-byte basic public-origin packet, but a 1,262-byte setup packet, and longer Preview origins could also exceed 1,232 bytes. A participant-specific table would not solve the general product flow.

Planet purchases now use the existing SDK `authorizePrepare` and `executeDeferredFromPayload` APIs. A single passkey approval commits to the exact instruction and account hashes; the second transaction executes that approved command. Fixtures measure 924-byte authorization and 762-797-byte execution packets, including first-seller token account setup and long Preview origins. The existing frozen market table is reused.

Sponsor policy requires the exact paired purchase intent for authorization, validates both hashes, canonical deferred PDA, wallet, expiry, and fixed accounts. Execution is restricted to a canonical planet purchase with the sponsor as rent refund destination. On-chain signature verification and simulation remain enabled. Recovery retains submitted signatures and the exact payload; uncertain submissions cannot silently create a second approval or payment. Expired-record reclamation is restricted to the original sponsor and refunded to that sponsor.

## Finalized Receipts

| Action | Signature | Slot |
| --- | --- | --- |
| Original lists colony | `3VrqN1Rx5QKGMais62LnMWPm5Tvhssa7QbiCr3NdXJnhE2akKN63TMx78sncQz7cZHcS9qMBAKUGUd4v426HHD9n` | 512341523 |
| NewAccount authorizes | `2zxXx6bkio6fPJQEqht6NAk29FZgkFEWRX71UAHV3C6F8zxgJ16WLz1uNsfUaM4WtyVcPPnGkeRdHLz5CHicXsXq` | 512342044 |
| NewAccount buys colony | `4hLMw8kfkDwrxQ7aqRSYahyZ5bpzmKbXpQk2mjHv8HFirRgtQwsZxiyS7bxjdvjf1L22rMViGM1hPFfTjzQejAUn` | 512342055 |
| NewAccount lists it back | `5FNrYmvCUwL7XJ9xnQmponoqEowM1iU85BaTuojo1CgLDp3WJctSJMqh53VKQp32jENvYuRjoM83mXxaHSeqG2Po` | 512342840 |
| Original authorizes return purchase | `5i6ijHoEmnzW4vQUKPSRdtMRdR7jdfwfUBDHinPfAwN4qLEawzH5fiA4mYQrEQvHNKcVUh8PxjaRZR5JDyNDHND2` | 512343272 |
| Original buys colony back | `21qah5jhv6QrtrPVhBsoaK51xvX8PVhLGJaPjFzXfjZbhs8NdtS7ZfMppK5AMnYnivoPfL6kpKz8ZJuDBVJCkRf8` | 512343284 |

All listed receipts have null transaction errors. Each purchase's authorization cost 10,000 devnet lamports in network fees and execution cost 5,000, totaling 30,000 lamports for the two purchases, excluding listing and test-funding fees. Each temporary deferred account received 1,544,320 lamports of rent and closed after execution, returning the rent to the sponsor.

## Exact AM Settlement

Balances are raw six-decimal token amounts. The baseline is after a 0.01-test-AM transfer from Original to NewAccount; its prior 0.9975 balance was below the 1-AM minimum. The free faucet was unavailable and did not provide funds.

| Balance | Before first purchase | After first purchase | After return purchase |
| --- | ---: | ---: | ---: |
| Original | 4728251990000 | 4728252987500 | 4728251987500 |
| NewAccount | 1007500 | 7500 | 1005000 |
| Protocol treasury | 9476422002500 | 9476422005000 | 9476422007500 |
| Market escrow | 0 | 0 | 0 |

Each buyer paid 1,000,000 raw AM; each seller received 997,500; treasury received 2,500. Total protocol fees: 5,000 raw AM = 0.005 test AM (0.25% per purchase). The 0.01 funding transfer moved existing test tokens between the two accounts and was not a protocol fee.

## Ownership and UI

The read-only verifier `server/verify-planet-market-roundtrip.cjs` uses a single finalized `getMultipleAccountsInfoAndContext` snapshot with a minimum context slot anchored to the latest listing receipt. Early sequential reads straddled finalization and temporarily mixed old and new data; the coherent snapshots resolved this. No ownership-program change was necessary.

At finalized slot 512343313:

- Planet authority, coordinate authority, player profile pointer and canonical ownership registry all identify Original.
- Original owner index slot 2 is active and is the registry's current index; its old slot 1 remains inactive.
- NewAccount owner index slot 1 is inactive; its homeworld index remains active.
- Listing index is inactive, listing account is closed, market escrow is zero, active missions are zero.
- Profile `planet_count` is a monotonically allocated owner-index slot counter, not the current number of active worlds.

After the first purchase, refreshed UI showed Original with one world and NewAccount with two. NewAccount could open and operate the acquired colony and relist it. After the return purchase, refreshed Original UI again showed two worlds. Desktop and mobile (390x844) checks passed; mobile document width and scroll width both measured 390 pixels. Listings were empty after settlement. Quick Play remained available for Original after switching accounts; market purchases still required their own passkey approval.

Screenshots: `planet-purchase-newaccount-empire.jpg`, `planet-return-purchase-review.jpg`, `planet-roundtrip-desktop.jpg`, `planet-roundtrip-mobile.jpg`, `planet-market-empty-mobile.jpg`.

## Validation Boundaries

267 frontend/server tests and the TypeScript/Vite production build passed before Preview execution. Packet-size, authorization substitution, invalid companions, replay prevention in the client coordinator, account switching, interrupted confirmation, expired-approval recovery and payload persistence have local automated coverage. The live chain tests above prove the successful two-way sale, ownership transfer, fee settlement, and successful-execution rent refunds; forced network interruption and expired deferred-account reclamation were not separately exercised on devnet. No mainnet readiness or independent security-audit claim is made.
