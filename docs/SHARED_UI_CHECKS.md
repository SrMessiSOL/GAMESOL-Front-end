# Shared UI Verification

October 13, 2026. Final correction recheck passed; approved for publication.

## Verified build

`frontend-kiell6mha-srmessisols-projects.vercel.app`

- Actual existing devnet commander signed in; no game or fund transactions.
- Wallet inspected on desktop and a verified 390 x 844 CSS viewport.
- All wallet buttons measured at least 44px high. Scroll reached lower controls.
- Focus began inside wallet; Escape closed it and restored the opener.
- Duplicate sign-out and sponsor-check actions removed.
- Research, shipyard, defense, reports, market, quests, alliance and store
  inspected at 1280 x 900 and 390 x 844, with screenshots and control bounds.
- Measured command buttons had no sub-43px heights or horizontal overflow.
- Alliance and market were additionally awaited until their loaded states.
- Missions inspected in its current completed-UFO/empty-fleet state on mobile.
- Deposit and withdrawal forms inspected, without submitting either.

## Corrections discovered during inspection

- Account opener overlapped close controls on tall panels. Hide it while a
  planet command dialog is open; this also prevents unintended stacked dialogs.
- Long toolbar titles need wrapping on mobile.
- Manage Funds typography remained too small; added readable shared sizing.

## Final build to recheck

`frontend-ihp3o5pmb-srmessisols-projects.vercel.app`
Cloud compilation passed. All 95 automated checks passed.
The user approved the separate sign-in and the authenticated recheck passed.

Required before promoting the live alias:

1. Close-button clicks work on tall research/quest/shipyard panels without
   opening the account menu; opener is hidden only while a command dialog exists.
2. Mobile market and research toolbar titles do not overlap their close control.
3. Account and Manage Funds typography and scrolling remain correct at desktop
   and 390 x 844, including deposit and withdrawal forms (no transfer).
4. Remaining loaded command screens retain their checked bounds and styles.
5. Reset viewport override and record final screenshots before publication.

Final verification: all eight loaded command panels at verified 1280 x 900 and
390 x 844 reported zero undersized command buttons and zero horizontal control
overflow. All mobile title groups fit beside toolbar actions. The account opener
was hidden while command dialogs were open; DOM hit testing found the close
button itself, not the account opener. Keyboard Enter and Escape dismissed dialogs.

Wallet mobile bounds were x=12..378, y=12..832 in a 390 x 844 viewport. Its scroll
area reached lower controls, with zero buttons under 44px. Manage Funds mobile
had no horizontal overflow or undersized buttons; deposit and withdrawal forms
were inspected without sending anything. Shipyard mobile toolbar and close button
were separately confirmed within viewport bounds after settling.

Screenshots are local in `.vercel/ui-check/final-*`, `shared-*`, and
`wallet-mobile-bottom.png`. Viewport overrides were reset after inspection.

## Limits

Quick Play OFF was observed on the separate stage; it was not renewed. Active
missions, populated battle reports, funded purchases, withdrawal execution and
alliance membership are not live-rehearsed by these layout checks. Empty,
loading and locked states were tested. Do not claim all gameplay states tested.
