# Cosmetics Devnet Upgrade

## Verified Deployment

- Program: `J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq`.
- Upgrade authority and game admin remain
  `EhT4UUmsHyd41bZSGzj1W72yu2EptHk8sEvnK7aaNuBu`.
- Existing payer: `HAHnFdgoASDzzma7fP9nfKo5nByU1uStYR964QhWnL2X`.
- Signer and payer keypairs were verified inside WSL without disclosing secrets.
- Deployed bytes match the validator-tested 1,618,008-byte SBF binary exactly:
  `eb233bec110551e379ec0d855277b35d352deb81e21b69a4da20f67d421a58fb`.
- Finalized upgrade slot: 515525994.
- Upgrade signature:
  `3px3PzXdTUx7dJrZnWeTovK1uTPihYJMea4YcCgq7NERVk4ybvQYGdYZ6qjyJocC8DX9Wr3Lrcz3grAWyKxnGNmF`.
- Allocation extended by exactly 50,112 bytes. Buffer verified byte-for-byte and
  consumed; refund returned to the existing payer. No authority changes.
- Existing game/market admin-and-mint controls and legacy store config unchanged.

## Actual Cost

- Deployment ceiling: 8.504887800 test SOL gross temporary funding.
- Actual deployment gross: 8.492892800 test SOL.
- Temporary buffer rent returned: 8.220318840 test SOL.
- Net deployment payer debit: 0.272573960 test SOL.
- New cosmetic store rent: 0.001021080 test SOL, paid by the existing admin.
- Configuration fee: 0.000010000 test SOL, paid by the existing payer.
- No mainnet funds used. No token mint or treasury authority changed.

## Store Configuration

- Cosmetic store: `EWam2Hnr9LQ8tmDorqtszxVuBiikWo7oZqoyCRWaojkq`.
- Canonical Circle devnet USDC: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- Existing treasury: `79yUJWLDkkaWSHR6cfXYD8MxvxcUC9XnnimYKyHfGBGd`.
- Configuration signature:
  `FiT6sEsbpa6PkfFVrsm3QRFExWFMxDmt6XbCpbdHJwR9aioyvyREL17Z4M5HEojJsJZwVsEqkk4UigocBjT3NDj`.
- Activation submitted after a signed simulation passed; configuration read back
  exactly. No USDC transferred during setup.

## Lazor Test Status

- Unpublished localhost game signed in as the original commander
  `G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r`.
- Planned test: one Ion unlock for 1 test USDC, then free Battlecruiser equip.
- Baseline: 100.501 test USDC; no cosmetic inventory account.
- The approval window timed out before submission. Independent devnet readback
  still shows 100.501 test USDC and no inventory: zero purchase spending.
- Buying, equipping and refresh persistence with Lazor are NOT yet certified.
  User passkey approval is required. Do not count the completed local-validator
  cases as completed Lazor/devnet cases.
- Timeout feedback now distinguishes a pre-submission approval timeout from an
  unknown submitted-payment outcome; the latter still requires reconciliation.
- Local test sponsor uses the existing policy with the devnet payer key confined
  to WSL/server memory. It is loopback-only, origin-restricted and not published.

Evidence: `docs/test-runs/cosmetics-devnet-2026-10-27/`.
Latest live readback after user purchase approval: balance 99.501 test USDC,
owned mask 2 (Ion), all equipped slots still Standard. Exactly 1 test USDC
was debited from the baseline. The UI also shows Ion Owned.
The subsequent equip attempt was blocked by Chrome's approval-window popup
policy before submission. Equip and refresh persistence remain pending;
do not repeat the purchase. The user can click Equip Ion directly.
Local deployment gates: 8 tests passed (including prior loader/cap regressions).
Final frontend/server regression suite: 502 passed, zero failures or skips.
Production build passed locally; existing chunk-size warnings remain.
The historical inventory-only candidate's source pin is intentionally no longer
valid after subsequent development; it was not weakened or used to approve this
candidate. The current cosmetics gate pins the actual tested binary and receipts.

Frontend remains unpublished. Scheduled automation remains PAUSED.

## Final live acceptance

The receipt verifier now passes: Ion owned, Battlecruiser slot 6 equipped to
skin 1, balance 99.501 test USDC, exactly one successful purchase and a
successful equip through Lazor. Evidence: `lazor-verified.json` in the directory
above. A full page refresh restored Ion from the on-chain inventory without a
new purchase or approval.

Desktop 1440x900 and mobile 390x844 CSS-pixel checks completed. The live 3D
preview rendered Ion, the equipped action stayed disabled, mobile scrolling
reached every skin and the footer, and neither viewport had page overflow.
Fixed a shared flex-button override that squeezed livery names by restoring
the local grid layout. Eight focused cosmetic tests passed after this fix.
No further payment, frontend publication, or authority change was performed.
