# Buyer settlement packet correction

The first seller's offer is finalized on devnet:
`4h42N5uQHo7b89RS7E3Urb4EbeQ27fuydNXSEhMZPbt5ix8XhrEKqrxnf7ThU86jXyLpU9tUHDUUx2KPhQWQ5p3G`.
Offer: `4N95GepBEWijDoyTjM9ppD2qRqoZ1bfYMtRP1g7Xvnma`.
Seller NewAccount offers 1,000 metal for 1 test ANTIMATTER to Default.

The initial buyer attempt failed serialization before submission. Its bundle
includes the seller's missing token-account setup, rent funding and settlement.

## Frozen Table

Table `27YmCszGdf22GGz9rw2Ab41knv2V9ecwP3XSzCvScuzC` has 34 public addresses.
Owner, devnet genesis, exact contents, active status and absent authority were
independently read and verified after freezing. Setup used 0.00647676 test SOL,
below the approved 0.02 cap. See `src/market-lookup-table.json` for finalized
creation/extension/freeze receipts. No token or program authority changed.

## Scope And Evidence

- Client selects the market table for the existing resource AcceptOffer bundle,
  with bounded optional rent/associated-token-account setup.
- Sponsor requires one preceding passkey check, one wallet execute, canonical
  market config, mint, treasury, escrow, authority, seller counter and obligation,
  and matched buyer/seller ATA setup. Program account/ownership checks and
  signature-verified simulation still enforce the remaining dynamic accounts.
- No token-transfer command outside the existing market settlement is admitted.
- Packet fixture with first-seller setup: 1,126 bytes; without setup: 1,091.
- Fresh blockhash is obtained after the owner's passkey response, avoiding reuse
  of the earlier display blockhash. Approval scope and instruction bytes do not
  change.
- Full suite: 210 tests passed. Negative cases cover substituted fixed accounts,
  ATA recipients, payloads, extra actions, changed tables and missing/reordered
  passkey verification.
- Unsigned simulation of the actual open offer passed at 95,178 compute units,
  logging AcceptOffer and 1,000 metal credited. Tracked accounts remained unchanged.
  Reproduce with `node server/check-market-buyer-preflight.cjs` while offer is open.
  This is not a signed Lazor payment or successful settled purchase.

Approved round cap: 2 test ANTIMATTER and 1 test USDC. Spent before the real
buyer retry: zero. No mainnet action, NFT transfer, withdrawal or planet sale.
