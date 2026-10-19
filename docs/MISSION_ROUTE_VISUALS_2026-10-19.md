# Mission Route Visual Fix

Status: local only, not pushed or deployed. Automation remains PAUSED.
No wallet approval, resource spending, mission launch or chain mutation.

## Changes

- Empty colonization destinations retain their authoritative galaxy, system and
  position even before a planet account exists. Local empty slots are no longer
  misclassified as remote-system departures.
- The endpoint follows the same presentation orbit, star offset, phase and
  angular velocity as the visible empty-slot marker. The ship stops outside the
  target body rather than crossing its center.
- Fleet slots now have stable distinct route IDs. Two destinations previously
  could produce the same source-based ID and collide during React updates.
- Travel progress advances from the snapshot timestamp, not the scene clock's
  accumulated elapsed time. Refreshing data no longer adds scene age twice.
- Removed the navigation-console collapse/expand button and its state; the
  existing navigation controls remain visible. The separate navigation-details
  panel disclosure remains unchanged.

## Verification

- All 390 frontend/server regression tests passed.
- Seven focused route/navigation regressions passed.
- TypeScript check and production build passed.
- The actual embedded game renderer was checked using a DEV-only fixture with
  one colony ship traveling to empty slot 2. This is not a newly launched live
  devnet mission or an authentication/ownership test.
- Desktop 1440x1000, mobile 390x844 and narrow mobile 320x740: canvas rendered,
  no horizontal overflow, zero navigation-collapse controls, navigation usable.
- Screenshot pixel samples in the scene region found 4,111 bright samples on
  desktop and 698 on mobile; the canvas is not blank. Two mobile captures had
  124 changed scene samples above the chosen difference threshold, confirming
  animation continues. Screenshots were taken in system-survey framing.

[Desktop screenshot](mission-route-desktop-2026-10-19.jpg),
[mobile screenshot](mission-route-mobile-2026-10-19.jpg),
[narrow-mobile screenshot](mission-route-narrow-2026-10-19.jpg).

Local game: http://127.0.0.1:4187/app
Read-only visual fixture: http://127.0.0.1:4187/app?system-demo=colony
The fixture is guarded by `import.meta.env.DEV` and does not enable simulated
missions on the published game. The public Vercel deployment is unchanged.
