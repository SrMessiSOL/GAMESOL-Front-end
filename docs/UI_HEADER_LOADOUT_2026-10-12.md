# Planet header and commander loadout check

- Replaced the inline planet header with a labelled, bigint-safe component. Exact balances remain in accessible labels and titles; compact mobile values do not change transaction quantities.
- Reserved space for the account control, separated world name and coordinates, and moved planet commands into a stable bottom band with labelled icon targets.
- Command dialogs now use bounded, scrollable content and responsive facility layouts independently of preview mode.
- Inspected the signed-in production Homeworld 9:427:13: the 3D surface renders, header values do not overlap the account control, and desktop and compact command bars are visible. Chrome viewport emulation reports scaled CSS dimensions, so this is not physical-device proof.
- Wallet-free 320px component validation reports equal document/client widths (316px), with long destination names and the real #7541 metadata fixture.
- UFO frame selection updates immediately and survives refresh; original NFT artwork loads at natural width 256. Booster and loot panels are planned blueprints, not game rewards.
- All 43 focused command, NFT, session, popup-recovery and scene-motion tests pass. No wallet transactions were performed for these UI checks.
- Research, fleet and mission execution remain outside this UI validation; the full devnet loop is not certified by these tests.
