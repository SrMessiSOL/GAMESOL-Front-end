# Devnet planet purchase recovery - October 18, 2026

## Root cause and fix

A successful purchase stayed pending because the game confirmation watcher used
the commander vault address to read a recovery record stored under Lazor's
distinct smart-wallet address. It now uses the linked smart wallet after checking
that its vault matches the connected commander. Account changes cancel the old
watcher and cannot clear another account's pending intent.

Submitted payments show neutral, nonblocking pending status, not a false failure
or another-buy instruction. Confirmed receipts clear only the matching saved
intent, show success and refresh worlds. Recovery performs reads only: it cannot
authorize, execute or reclaim a transaction. Failed or unavailable receipts do
not silently become success. RPC failures retain the payment lock.

Purchase preview/lookup preparation now precedes the fresh signing proof.
Pre-submission freshness checks leave headroom within Lazor's existing age limit;
they do not extend authority or automatically re-sign. Expired unsubmitted proofs
are a neutral review-again state, explicitly reporting no payment sent.

## Verified evidence

- 289 frontend/server tests passed, zero failures/skips; Preview build passed.
- Actual game-effect tests use DIFFERENT smart-wallet/vault identities and check
  successful reconciliation, mismatched-commander rejection and account-change
  cleanup. Recovery tests also cover lost responses, pending/failed receipts,
  failed reclaim, expired approvals and account/listing substitution.
- Live devnet purchase finalized at slot 512467232:
  `5Jv4PmdXDjNxrqjdeZDGs4sLwnqZoCyBWSE6vsczu2wEfbTHNE4WEW245hcVrGNxgiF88djs6aztcE14kEa6oeum`.
- NewAccount paid exactly 1 test AM; Default received 0.9975; treasury received
  0.0025. Escrow zero, listing closed, registry/coordinates/player/index agree.
  Colony 9:427:1 currently belongs to NewAccount, owner-index slot 3.
- The existing successful receipt automatically changed the corrected live QA
  screen to `Planet acquired` / `COMMAND CONFIRMED`, without another purchase or
  approval. Loaded asset host was verified as the tested immutable deployment
  `frontend-qj5pi2eel-srmessisols-projects.vercel.app`.
- Mobile layout checked at 390x844, body width 390 without horizontal overflow.
  Confirmation was observed in accessibility state. Full-page mobile screenshot
  after the success toast dismissed: `payment-mobile-restored-full.jpg`.
- The tab was then closed/reopened without test query parameters. Both worlds
  restored without another sign-in, stuck status or new payment. Desktop proof:
  `payment-recovery-fixed-desktop.jpg`.
- An earlier live unconsumed approval expired and reclaimed its 1,544,320-lamport
  rent to its original sponsor. Reclaim receipt:
  `2NXPSPnkSztauMsmEZm2aJDUQGdcxfQrgZecgz24b8bkeej8Dsq913XMXCFKQpy6e52jPS1T1Xox9ft18Rxzk9tt`.
- Earlier local-validator concurrent purchase/cancel tests confirmed exactly one
  winner in each of four races, including both outcomes. Those are local chain
  tests, not proof of a live concurrent Lazor race.

## Release boundaries

No USDC, mainnet write, program upgrade or authority change was made. Test-only
interruption requires an explicit QA build flag, allowed Preview hostname, query
phase and devnet genesis; production configuration has no such flag and the
public hostname is excluded even when the flag is set.

This validates the targeted recovery fix, not every game mechanic or mainnet
readiness. Full process crashes, physical-device wallet flows, live concurrent
Lazor races, controlled combat after protection expires and independent security
review remain separate gates. The final signing-age preparation change has unit
and build coverage; a new passkey purchase was not required to verify this
wallet-identity correction against the already-finalized live receipt.

Publication and final main-URL checks are recorded below after completion.
