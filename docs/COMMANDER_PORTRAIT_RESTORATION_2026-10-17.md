# Commander portrait versus temporary utility ownership

Local changes:
- PFP title contains the NFT name only; no expired/checking/unavailable status
  or ownership-status styling is attached to the cosmetic avatar.
- After a validated on-chain commander identity is read, its asset ID can render
  the real canonical artwork endpoint immediately, without waiting for DAS.
- This fallback has checkedAt = 0, so it never grants ownership eligibility.
  Booster/loot verification and server-side ownership proofs remain unchanged.
- A successful ownership read replaces fallback metadata; a confirmed transfer
  removes the portrait. Cleared identities and different commanders/holders
  never restore another saved portrait. No browser storage is required.

Tests: all 223 frontend/server tests passed, including executable provider tests
for fresh-browser delayed/failed ownership reads, transfer removal, identity
scoping and actual PFP render output without expired labels.
Production TypeScript/Vite build passed. #513's canonical artwork endpoint
returned HTTP 200, image/jpeg, 3,873 bytes without a wallet signature.
No production publication was performed, pending the live browser checks.

Live state discovery:
Default commander identity PDA `J4hNcR3AkQSqDVffg9Z9DmRLQsHWzS4R4ZTE4RkgJNS2`
has nonce 2, zero owner and asset, verifiedAt = 0. It was explicitly cleared by
finalized `ClearCommanderIdentity` transaction
`35n3rcxWnrGETo8YpqvkKbRipaigxV8TFJQhY3oJA67bhKJeA7sN4hYZiMuhURYXeGYQSkL2Z3oHRWG8aA6te8Kd`
on October 17 at 02:28:39 Buenos Aires time. This is not temporary ownership expiry.
No avatar save/clear transaction was submitted during this fix. Restoring #513
now needs a new user-approved ownership-verified save, not resurrection from cache.

Actual desktop/mobile browser checks are blocked because the browser-control
runtime cannot create its local kernel assets (path unavailable). Do not claim
these visual checks passed or that the cleared live identity was restored.
