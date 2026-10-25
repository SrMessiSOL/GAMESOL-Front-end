# Defense UI Guard Release

Devnet only. No program or authority change. Automation remains PAUSED.

## Changes

- Unsupported missile blueprints cannot be commissioned, including legacy stock.
- Unique domes reject quantity greater than one and existing online domes.
- The SDK checks invalid orders before wallet preparation and rechecks dome stock
  against a fresh planet read.
- Defense availability/status/action labels share the same guard.
- Desktop defense action columns are 160px; the dome action says "One dome only"
  rather than wrapping the full explanatory status into a tall button.

## Checks Before Publication

The read-only browser fixture extracts the actual defense JSX and option
expressions, uses the actual React controls/art/styles/modal containers, and
provides mocked eligibility states. It is not a signed live-wallet test.

Chrome CSS viewports 390x844 and 1440x900: unsupported missiles, quantity-two
domes, existing dome, legacy missile stock, busy/upgrading shipyard, missing
resources and locked prerequisites behave correctly. Mobile zero/negative/
fractional/u32-overflow quantities disable all actions. All 17 recorded states
have no horizontal overflow or prepared commands. Blocked and enabled defense
buttons are 44px high after the desktop column correction. Scrolling reaches
lower dome and missile blueprints. No transaction or spending occurred.

88 command/preflight/modal/availability tests pass. The production TypeScript
and Vite build passes. The broader agent suite previously passed 103/103.
The fixture is local test tooling, not a production route or authentication bypass.

T08/T09 remain PARTIAL. This release is availability protection, not a claim
that unsupported missiles, remaining advanced construction or combat are tested.
