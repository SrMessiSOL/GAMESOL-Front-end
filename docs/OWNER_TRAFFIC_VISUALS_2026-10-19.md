# Owner labels and two-ended mission visibility

## Scope
- Foreign planets show the current owner's case-preserving wallet label; full address in the tooltip. Own worlds keep YOUR WORLD.
- Mission endpoints use authoritative source/destination coordinates, including empty colony destinations.
- Departure and arrival beacons appear at planet, system or galaxy scale. Return legs reverse direction; completed legs show awaiting-resolution markers.
- Accessible endpoint navigation lists aggregate all missions rather than dropping missions after a destination cap.
- No transactions, spending, program upgrade, authority changes or automation restart.

## Checks
- Clean release: 402 tests passed, including ownership transfer labels, empty destinations, return legs, waiting markers, aggregate counts and scale filtering.
- TypeScript passed in the working checkout.
- Actual browser screenshots: desktop 1440x1000; mobile 390x844 and 320x740.
- Foreign wallet label and inspect button fit on mobile. Full address preserved in tooltip.
- System departure and arrival points, galaxy destination navigation, universe endpoints and empty cross-galaxy destination inspected.
- Narrow mobile document width equals viewport width (320); no browser console errors observed.
- Desktop scene pixel sampling: 1,346 distinct colors in the canvas region; scene is nonblank.
- Visual fixture is DEV-only, explicitly marked NO ON-CHAIN DATA, with two worlds and three routes. This is rendering proof, not a new signed flight test.
- Automation configuration verified PAUSED.

## Release Boundary
Only the owner/traffic UI, shared snapshot helper and focused regression tests belong to this release. Unrelated local agent API, SDK and checklist work is excluded.
