# System UI and alliance synchronization release

## Verified scope

Reuse the existing developed Empire presentation in /app, without replacing
the current game with the older GitHub main/graphics branches. Preserve wallet,
UFO, prerequisite, sponsorship and gameplay fixes. No program upgrade.

- Compact orbital strip: 15 columns / 30px desktop; eight columns / 32px mobile.
- Desktop navigation no longer overlaps System Intel.
- Empire starts closed, with its existing search/filter/operate controls available.
- Survey camera action clears planet focus; portrait composition increases
  distance to fit the narrow horizontal field, without changing landscape zoom.
- App and PlanetWorld alliance state refresh on focus / visibility return and
  every 15 seconds while open. Hidden pages skip reads; stale account/client
  responses are discarded. Background reads retain the current screen.

## QA startup remediation

The QA alias stalled before React mounted while the identical direct deployment
loaded. Requests independently returned correct JS/CSS, not a program or RPC
error. Exact browser/alias transport cause was not established.

Vercel release assets now reference their immutable deployment host rather than
the movable alias. Local builds retain relative assets. Host validation rejects
URLs, paths, ports and arbitrary domains. This remediated the observed QA stall:
the same QA origin loaded, restored Default, loaded #513 (256px), retained Quick
Play ON, and successfully submitted a supported game command. Browser storage,
credentials and wallet origins were not changed or cleared. API/paymaster paths
remain on the page origin. Static asset responses already allow public CORS.

## Real two-account synchronization test

- Sender: Default, G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r.
- Observer: independently signed-in NewAccount, Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd.
- One daily 1,000-metal resource contribution, with Quick Play; no owner prompt.
- Finalized signature: 3zYUMAuLcrvPdGwzovd8hnPCDubxiks389MBQFms3GDv5j3GKLQqrM3k2uGPSatdHx9MMEihL2tbW1R2t2MEu2SD.
- Slot 512328286, error null; 10,000 devnet lamport fee.
- Treasury metal 56,080 -> 57,080; total metal deposited 78,000 -> 79,000.
- Crystal 21,200, deuterium 13,665, treasury AM 666.5 unchanged.
- Receipt pre/post token balances unchanged: zero USDC/AM spent.
- NewAccount's already-open alliance command displayed 57,080 without reload
  or clicking another section. Member-only restrictions remained disabled.
- Default's contribution changed to COMPLETED; no repeat contribution.
- This round tests real treasury propagation; role changes are covered by
  regression tests and the separately recorded prior leadership lifecycle,
  not a new leadership/expulsion mutation in this round.

## Test boundaries

- All 246 frontend/server tests pass, including asset host validation, actual
  3D alliance loader, account races, recovery, compact UI and portrait camera fit.
- Vercel builds run TypeScript, bundle and server compilation.
- Signed-in desktop/mobile checks include system controls, avatar restoration,
  wallet modal, Empire and alliance views. Mobile is an emulated 390x844
  viewport, not a physical-device passkey/wallet certification.
- Final portrait camera visual recheck passed. Earlier investigation notes in SYSTEM_UI_REUSE and
  DEVNET_REMAINING_PASS describe superseded candidates and blockers.

## Publication

Release candidate: frontend-rm6qcogxg, reached through the stable QA alias.
It survived another alias update without losing Default sign-in or #513.

Final scene-pixel checks pass:

| View | Screenshot dimensions | Distinct sampled colors | Lit samples |
| --- | --- | --- | --- |
| Desktop focus | 1280x585 | 1,739 | 747 |
| Mobile focus | 390x844 | 964 | 401 |
| Desktop survey | 1280x585 | 1,410 | 1,288 |

Desktop controls and System Intel have nonintersecting bounds. Mobile page
width and scrollWidth are both 390; #513 artwork is loaded at natural width
256. Fresh mobile opens compact navigation details, with usable level controls.
The wallet modal fits and scrolls, Quick Play remains ON, and the Empire roster
opens/closes. Orbital selection correctly identifies Devnet Colony and Homeworld.

Verified screenshots: system-final-desktop.jpg, system-final-mobile.jpg,
system-final-mobile-slots.jpg, system-final-survey.jpg, system-wallet-mobile.jpg,
and alliance-sync-newaccount.jpg. Production receipt is appended after deployment.

### Published And Checked

- Source commit: 0911511 on feat/crypto-ufos-wallet-link, pushed to GitHub.
- Production deployment: https://frontend-pqz9ibwz0-srmessisols-projects.vercel.app.
- Public alias: https://chained-universe.vercel.app/app, explicitly assigned.
- Production TypeScript, Vite and server build completed successfully.
- Public HTML and canonical entry assets return 200; entry is
  /assets/index-CcrWaFDf.js on the production deployment host.
- RPC returns the devnet genesis EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG.
- Real #513 image endpoint returns 200, image/jpeg, 3,873 bytes.
- Existing public game session restores Default and #513 without another sign-in.
  Artwork natural width 256; compact desktop and narrow responsive orbital
  controls verified again on the published page. Viewport overrides reset.
- Final production screenshots: system-production-desktop.jpg and
  system-production-mobile.jpg. Production narrow-page DOM width/scrollWidth
  both 585 with 32px-tall orbital buttons; QA's explicit 390x844 check is above.
- No mainnet action, authority change, USDC or ANTIMATTER payment.
