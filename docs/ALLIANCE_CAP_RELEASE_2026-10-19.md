# Alliance Cap Release Checks - 2026-10-19

Scope: publish only the level-25 infrastructure cap guard, capped-state copy,
related regressions and these QA artifacts. The local agent API and its unrelated
SDK preparation helpers are excluded. No game program, economy or authority is
changed. Automated checklist work remains PAUSED.

## Visual Checks

Rendered the actual `PlanetWorld.tsx` infrastructure JSX with its actual CSS,
catalog, cost function and shared cap guard in a read-only local fixture. No
wallet, signing callback, token spend or on-chain state override was used.
These are component viewport checks, not physical-device or live level-25 proof.

- Desktop 1440 x 1000: all four level-25 buttons disabled; maximum-level status
  visible and no fictitious level-26 quote; no overlap.
- Mobile 390 x 844: all four controls fit in one column, disabled states and
  status text visible, no horizontal overflow.
- Narrow mobile 320 x 740: no horizontal overflow.
- Level 24 with funded treasury: all four upgrade buttons remain enabled.
- Shared SDK: fresh treasury read blocks all four capped commands before any
  wallet instruction/sign request; program remains the final authority.
- Alternate App UI: same cap guard, disabled maximum-level label, no next-level
  price at cap. Source/regression checked; not a separate browser-render proof.

Evidence: [desktop](cap-fix-desktop-2026-10-19.jpg),
[mobile](cap-fix-mobile-2026-10-19.jpg).

Regression/build/deployment outcomes are recorded with the published commit and
Vercel release receipt. Higher-level devnet and isolated-validator results remain
in their existing checklist entries; this release does not mark the whole game
fully tested or mainnet ready.
