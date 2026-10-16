# Per-account Quick Play restoration

## Change

The old single `lazorkit-session` record was replaced when another account was
used on the same website. Each account now has a distinct durable localStorage
record, scoped to the current game and market program IDs. A matching legacy
record is migrated without deleting or overwriting the legacy value.

Existing account-scoped records take precedence over legacy records, including
revocations. Keypair consistency and account identity are checked before use.
Restoration still checks the on-chain session and expiry. The usual session
lifetime is unchanged. Storage alone cannot turn Quick Play on.

This supports refresh and browser reopening with normal persistent browser
storage. It does not synchronize session credentials across websites, browser
profiles or devices, and does not survive clearing browser data or closing a
private browsing session. These are not promised behaviors.

## Checks

- Full frontend/server suite: 202 passed, zero failures.
- Actual storage functions tested across A/B/A account changes and a fresh
  JavaScript runtime with the same persistent storage.
- Revoking A leaves B unchanged; revoked A cannot be resurrected by legacy data.
- Wrong account, corrupt keypair and different program scope fail closed.
- Existing tests cover expired/revoked on-chain sessions, stale activation reads,
  account changes while reading status and stale account UI responses.
- Real Preview checks passed: Default ON after refresh, closing/reopening its
  test tab, and signing out to NewAccount then back to Default. Default was
  authorized once only; no second Quick Play activation was used.
- No real browser-process restart is claimed. Reopening a tab and automated
  fresh-runtime storage tests are distinct from closing every browser window.

## Spending Boundary

No token spending is needed for these checks. The subsequent devnet payment test
has a user-approved total cap of 2 test ANTIMATTER and 1 test USDC. Spent in that
round so far: zero. No mainnet action, NFT transfer, withdrawal, planet sale or
authority change is included.
