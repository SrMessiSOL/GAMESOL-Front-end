# First-seller passkey packet correction

Live NewAccount listing failed before submission at 1,284 / 1,232 bytes.
The earlier cancellation/approval error hid this diagnostic until a completed
passkey attempt. No listing or token payment resulted from the failed packet.

The client now selects the existing verified frozen UFO address table for the
canonical passkey market CreateOffer bundle, optionally preceded by its existing
matched rent sponsorship. No new table, transaction split, program upgrade or
authority change is needed.

The sponsor admits this representation only with one preceding passkey check,
one Lazor execute, the market CreateOffer discriminator, fixed account order,
valid type/minimum terms, canonical config/counter/index/obligation PDAs and an
optional matching approved rent instruction. Existing signature-verified
simulation, on-chain account/seed checks and debit limits remain in place.
Offer seeds and planet ownership remain enforced by the invoked programs.

The real-SDK long-Preview fixture measures 1,251 bytes uncompressed with rent
and 1,099 compressed; without rent it measures 1,228 and 1,076. These synthetic
signature fixtures are never submitted and are not the exact captured live
WebAuthn bytes. Negative tests reject substituted fixed accounts, invalid
resource/amount/price, extra payloads/actions, absent or reordered passkey checks
and repeated wallet executions. Full suite: 205 passed, zero failures.

Preview build and real retry must be recorded separately. This document does
not certify successful buyer settlement. Current approved payment-round spend:
0 test ANTIMATTER and 0 test USDC, against a cap of 2 and 1 respectively.
