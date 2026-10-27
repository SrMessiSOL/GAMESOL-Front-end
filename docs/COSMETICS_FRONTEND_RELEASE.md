# Cosmetics Frontend Release

Scope: existing devnet deployment only. User approved GitHub and Vercel
publication after live Lazor purchase/equipment and local responsive checks.

- Ion ownership and Battlecruiser equipment verified from the devnet program.
- Exactly one successful 1-test-USDC purchase; balance 99.501 test USDC.
- Refresh restored the equipped skin without another purchase or signature.
- Desktop 1440x900 and mobile 390x844 checked; mobile button layout corrected.
- This isolated release passed 445 tests, zero failures/skips, and its build.
- System, galaxy and universe ships read verified owner-bound equipment.
  Invalid or missing records render Standard without hiding the vessel.
- Shared ship geometry, size hierarchy and mission indicators are unchanged.
- No local wallet bridge, signing key, test-only route or agent API is included.
- Existing backend/API behavior and dependencies are unchanged by this release.

Independent-browser checks and mainnet readiness remain separate gates.
No new program deployment, authority change or mainnet action is included.
Scheduled automation remains PAUSED.

Live asset and inventory verification receipts are saved under
`test-runs/cosmetics-live-release/` after publication.

## Hosted Verification

GitHub application commit: `b21f1ad` on `feat/crypto-ufos-wallet-link`.
Deployment: https://frontend-a4czo5a36-srmessisols-projects.vercel.app
Main URL: https://chained-universe.vercel.app/app

Both endpoints passed the read-only verifier. Their 31 public script/style
assets are byte-identical to one another. The cloud build is not byte-identical
to the local build; build-environment differences remain explicit rather than
being reported as a successful local hash comparison. No production secrets
were retrieved. Deployed cosmetics controls, local-helper exclusions and
devnet inventory/travel readers passed the hosted checks.

Latest readback: owned mask 10 (Ion and Solar); Battlecruiser equips Ion;
Light Fighter equips Solar; balance 96.501 test USDC. The user changed the
loadout during verification; this publication run submitted no transactions.

The 22 public planets were inspected read-only. One attack was already at its
destination awaiting resolution, with no mission in transit. Therefore a
moving skinned ship is not yet visually certified on the public deployment.
No mission was launched or resolved to manufacture a visual test.

Signed-in main-URL browser checks passed after reload: Ion Owned and equipped
on Battlecruiser, hangar/3D preview visible, correct owned Solar state,
disabled Equipped action, and reachable footer. Desktop 1440x900 and mobile
390x845 had no horizontal overflow. Normal browser sizing was restored.
The scheduled GAMESOL checklist automation was read back as PAUSED.
