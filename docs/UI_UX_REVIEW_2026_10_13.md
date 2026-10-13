# Live Game UI/UX Review

## Verdict

The game shell is recognizable, but command screens have inconsistent styling.
This is a shared live-versus-preview CSS problem, not only shipyard polish.
Do not publish the isolated shipyard patch as a complete UI repair.

Review used the signed-in live homeworld and read-only navigation. No purchases,
claims, upgrades, alliance creation, orders, or wallet authorization were submitted.

## Highest-impact findings

1. **High: layout styles missing from live command screens.** Shipyard, research,
   defense, quests, reports, alliance, and market show concatenated labels and
   values instead of readable metric groups. The corresponding rules in
   `planet-world-local.css` are scoped to `.production-preview`; actual planet
   command screens use `.planet-world`. Research/shipyard rules begin at line 633,
   quest metrics at 835, and alliance mode controls at 903.
2. **High: raw browser-default buttons.** Confirmed in research's technology
   preview, report empty-state mission button, alliance modes/creation review,
   and market empty-state sell/refresh controls. Mobile alliance measurements
   returned 19px for the creation-review control and 31px for mode buttons,
   below a comfortable 44px target. Use shared command controls and explicit
   selected, disabled, pending, focus, and error states.
3. **Medium: excessive lock/warning clutter and tiny secondary typography.**
   The shipyard opens with all 14 hulls, none buildable, each repeating lock and
   resource warnings. Defense does the same. Prioritize the prerequisite and
   first attainable hull; put advanced locked catalogs behind an explicit view.
   Reserve compact monospace for numbers, not every description/action.
4. **Medium: inconsistent resource identity and balances across screens.**
   Store uses actual USDC artwork and structured reward rows; market still
   uses emoji resource symbols and stored resources. Live market showed 75
   deuterium while the projected planet balance was 78. The market invocation
   at `PlanetWorld.tsx:2719` still passes `state.resources` as `liveRes`.
   Display projected resources consistently while retaining on-chain validation.
5. **Medium: duplicated headings and explanatory copy crowd the next action.**
   Several screens repeat command labels in the modal header, eyebrow, and
   heading, then explain how to use the interface. An early planet exposes
   research, fleet, defense, markets, quests, alliances, store, and reports at
   once. Preserve access through secondary navigation, but emphasize one next
   objective and its actual missing requirement.

## Reviewed surfaces

- Shipyard: live screenshot, inventory/prerequisites, quantity, locked hulls.
- Research: loaded level-zero laboratory, metrics, preview toggle.
- Defenses: loaded locked catalog and blank-looking artwork slots.
- Quests: loaded 58 objectives, 7 claimable; repeated metrics and reward rows.
- Reports: zero-history state with raw mission button.
- Alliance: zero-network state, mode buttons, mobile control measurement.
- Market: zero-offer state, resource balances, tabs, filters, raw empty buttons.
- Store: loaded daily packs; more coherent pricing, original USDC icon, and
  disabled affordability state than the other command screens.
- UFO missions: previously checked live desktop/mobile and portrait persistence;
  active encounter/abort/claim states were not re-executed in this review.

## Game loop and first-session reduction

Current loop: grow resource production, build infrastructure and ships, launch
missions, resolve outcomes, and reinvest resources.

A 30-second first turn should present one attainable upgrade, its cost and
effect, then one confirmation and a visible timer. Completion should point to
the next production or fleet milestone, not a catalog of unavailable systems.

Keep: planet HUD, focused building objective, commander portrait, contextual
queues, UFO identity and missions. Delay: advanced hulls/defenses, alliance
creation, governance and trade until relevant or explicitly opened. Remove:
repeated instructional introductions, duplicate status labels, zero-value
reward rows, and browser-default command buttons.

## Repair sequence

1. Shared live layout rules for metrics, section headings, loading/empty states,
   catalogs, and command buttons. Do not blindly enable all preview styling.
2. Consistent typography, readable inactive states, 44px actions, and keyboard
   focus. Use icon-plus-label commands and actual selected-state semantics.
3. Progressive disclosure for locked catalogs and contextual prerequisite links.
4. Unified resource icon/balance display and verified asset fallbacks.
5. Desktop/mobile screenshots and bounds checks per command surface, including
   loaded, empty, disabled, pending, and error states before publication.

## Limits

No fresh-account onboarding, nonempty battle reports, alliance membership,
market offers, active fleet, or active UFO mission was available for full live
interaction checks. Camera motion and passkey popup recovery were not retested.
The requested 390px mobile override reported an effective 585px DOM viewport,
so exact 390px coverage is not claimed for this review. Smaller-width checks
must be repeated with verified viewport dimensions before release.

Evidence screenshots: `.vercel/ui-check/review-market.png` and
`.vercel/ui-check/review-alliance-mobile.png` (local only).

Publication remains on hold. Local shipyard CSS changes and their two layout
regression tests are not deployed and do not resolve the other findings.
