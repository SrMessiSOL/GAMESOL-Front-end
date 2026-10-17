# Alliance Quote UI Verification

Preview frontend-43pvfd4j1-srmessisols-projects.vercel.app passed actual-account
visual checks on desktop (normal Chrome viewport) and mobile 390x844. Default's
Research Grid is level 2; the other three buildings are level 1. All rendered
next-level quotes matched exactly at both viewports:

| Building | Metal | Crystal | Deuterium | Test AM |
| --- | ---: | ---: | ---: | ---: |
| Logistics Hub level 2 | 19,800 | 7,920 | 3,940 | 99 |
| Research Grid level 3 | 17,820 | 44,550 | 17,730 | 222.75 |
| Defense Coordination level 2 | 15,840 | 15,840 | 5,910 | 118.8 |
| Trade Network level 2 | 11,880 | 11,880 | 11,820 | 198 |

The 390px viewport has a 374px alliance dialog and no horizontal body overflow.
Actual scrolling verified lower cards, quote wrapping, buttons and persistent
header/navigation. No upgrade, purchase or token payment was made in these
visual checks. Screenshots: alliance-quotes-desktop.png,
alliance-quotes-mobile-top.png and alliance-quotes-mobile-bottom.png.

Backend rates are unchanged: 100 basis points per Trade Network level and 150
per Defense Coordination level. Both frontend views now share the same
treasury-aware quote. Three focused tests and the prior full 233-test suite
passed; the Vercel Preview production build passed before publication.

The real Research Grid level-2 discount receipt and raw observed snapshots are
recorded separately in TRADE_NETWORK_DEVNET_PROOF_2026-10-17.md and JSON.
