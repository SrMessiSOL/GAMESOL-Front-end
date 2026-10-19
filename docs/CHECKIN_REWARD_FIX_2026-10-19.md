# Daily check-in quote and storage correction

## Changes

- Shared dailyCheckInReward helper matches the program: missed day resets to 1,
  yesterday increments, same-day claimed card shows the earned streak, bonus
  caps at 30 days. Rewards use bonus = min(streak, 30) * 50, then integer /2
  crystal and /5 deuterium bonuses.
- Actual PlanetWorld and older command view use the same dynamic definition.
- Copy states reset at 00:00 UTC and consecutive UTC days, not 24-hour cooldown.
- Card eligibility and click guards include the bonus in resource storage.
- Client re-reads planet and quest, projects production, rejects overflow and
  today's duplicate before quest setup, signing preparation or submission.
- Missing quest data fails closed. Simulation and final program constraints
  remain authoritative if state changes after checking.

## Verification

- 380 automated frontend/server/API tests passed, zero failed/skipped.
- Seven focused tests cover first/missed day, continuation, claimed reward,
  capped streak, UTC boundary, all three exact-fit/one-over caps, base-fits but
  bonus-overflows, actual client guard before signing and missing/claimed data.
- Production TypeScript/bundle build passed. Initial Preview caught an overly
  broad ResourceDelta return annotation; corrected before successful Preview.
- Successful Preview: https://frontend-1jshuvk23-srmessisols-projects.vercel.app
- Stable QA preserved Default sign-in and showed today's claimed 550 metal,
  325 crystal and 110 deuterium, matching the previously verified chain delivery.
- Desktop 1280x900 and mobile 390x844 checked. Mobile scroll width 390; no
  horizontal overflow, overlapping copy or reward/button clipping.
- Evidence: checkin-bonus-desktop-2026-10-19.png and
  checkin-bonus-mobile-2026-10-19.png.

## Boundaries

No purchases, additional claims, USDC/AM spending, program upgrade, economy or
authority changes. Storage edge cases are automated fixtures using the real
client and helper, not manipulated live planets. Today's account was already
claimed; no second claim or midnight transition was attempted.
