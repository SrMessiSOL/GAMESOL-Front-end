# Resource market storage preflight

Reported failure: NewAccount tried to buy Default's 28,000-crystal offer for
1 test AM. Live QA showed `ResourceCapExceeded` (6066 / 0x17b2) from the
game's TransferResourcesFromMarket CPI during transaction simulation.

Read-only devnet verification: NewAccount crystal cap 10,000; stored crystal
1,145 at the checkpoint, with accrued UI estimate 1,421. AM balance remained
1,000,000 raw (1 test AM), unchanged from the preceding confirmed sale. Offer
remained listed. No purchase retry or signing was performed by the agent.

Root cause: resource-buy confirmation checked price and market unlock but did
not check destination storage. The program correctly rejected the oversized
delivery; the UI incorrectly invited an impossible wallet approval.

## Fix and checks

- Shared bigint capacity check rejects missing data and invalid resource/amount.
- Review displays remaining capacity and disables confirmation on overflow.
- Planet market UI uses the same projected resource object as the header.
- MarketClient reads fresh destination state and projects production before
  constructing/signing a resource purchase. A client regression exercises the
  actual acceptOffer method and verifies no preparation/submission on overflow.
- Full suite: 306 tests passed, zero failed/skipped. Local and Preview builds pass.
- Final Preview `frontend-6cnzy8b0r-srmessisols-projects.vercel.app`, assigned to
  stable `gamesol-devnet-qa.vercel.app` for the existing NewAccount login.
- Same live 28,000-crystal offer tested on desktop and 390x844 responsive view:
  warning shows room for 8,579, confirmation disabled. No wallet prompt opened.
- Screenshots `market-storage-fixed-desktop.jpg`, `market-storage-fixed-mobile.jpg`.

## Publication verified October 19

- GitHub commit `469f2e2`, branch `feat/crypto-ufos-wallet-link`, pushed.
- Production build `frontend-qbmpgsota-srmessisols-projects.vercel.app` completed.
- Both `chained-universe.vercel.app` and `gamesol-devnet-qa.vercel.app` explicitly
  assigned to that exact production deployment.
- Public address loaded successfully as Default; QA retained NewAccount's
  separate login. The buyer interaction was tested on QA against the identical
  production deployment, not by switching the public address's signed-in account.
- Opening the 28,000-crystal order displays room for 8,579 and disables CONFIRM
  BUY before any Lazor prompt. Desktop and 390x844 responsive checks passed.
- Re-ran all six storage regressions successfully after publication, including
  the actual client overflow rejection before payment construction/submission.
- Evidence: `market-storage-published-desktop.jpg` and
  `market-storage-published-mobile.jpg`. Browser viewport reset afterward.

No storage/economy/program/authority changes or USDC/AM spending. This does not
make the oversized order fit: expand storage normally or choose a smaller offer.
This release does not certify every game-program constraint has an equivalent
fresh frontend guard; see `FRONTEND_PROGRAM_CHECK_PARITY_2026-10-19.md`.
