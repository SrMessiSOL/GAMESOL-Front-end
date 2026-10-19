# Devnet Frontend Command Guards

## Changes

- Shared pre-signing simulation for normal Lazor game commands across buildings,
  research, fleets, defenses, quests, store, alliances, UFO commands and markets.
- Explicit devnet genesis verification, unsigned RPC simulation only. A failed
  or unavailable check stops the command; there is no fallback that opens Lazor.
- Existing frozen lookup tables are used only when a simulated packet needs
  compression. No tables, funds or signing authorities are created or changed.
- Signature-precompile positions are preserved. Session commands simulate the
  SDK-wrapped instructions. Passkey commands check the raw game instruction
  bundle before preparing a new passkey challenge.
- Existing pending planet purchases bypass NEW-intent eligibility checks so
  confirmed payments can still reconcile without another purchase or approval.
- Friendly blocked-action messages replace backend error names and raw mint
  identifiers. Original logs stay attached to the error for diagnostics.
- Whole-number and integer-width validation happens before encoding quantities,
  IDs, coordinates, fleet speed, resource amounts and alliance contributions.
- Shared building readiness covers fields, maximum levels, construction and
  cross-queue conflicts. Requirements use actual display names from the catalog.
- Store cards, purchase reviews, click handling and fresh client reads check
  destination storage. Unaffordable packs stop before quest setup can sign.
- Deployed program verification confirmed that resource rewards cannot overflow
  storage and shield store packs are unsupported. Shield packs remain disabled.
- Quest claims account for reward storage, completion, prior claims and the
  required reward world. Daily streak changes still receive a fresh program check.
- Contributions show resource/AM shortages; infrastructure uses treasury-aware
  costs, role checks and maximum-level guards. The client rechecks leader role.

## Verification

- Full frontend/server/API suite: 366 passed, zero failures or skipped tests.
- Disabled purchase colours and cursor use the same readiness conditions as
  confirmation; regression covers all 32 combinations of the five blockers.
- TypeScript/Vite Preview builds passed.
- 26 read-only devnet rehearsals, including 8 allowed commands and 18 blocked
  cases, using the actual frontend client builders; no wallet signing or send
  methods are permitted in the rehearsal adapter.
- Allowed examples: construction, research, quest reward, cargo launch, resource
  listing, crystal contribution, funded leader upgrade and funded daily pack.
- Negative examples include locked hulls/defenses/research, empty fleets/queues,
  invalid quests, missing funds, oversized deliveries, unsupported shield packs,
  role restrictions and malformed quantities/contributions.
- Independent raw-instruction simulations confirm the DEPLOYED program rejects
  oversized store delivery and shield packs, rather than relying on UI code alone.
- Rehearsal slot: 512673221. The watched NewAccount planet, wallet and sponsor
  accounts stayed unchanged. Report: `command-preflight-devnet-2026-10-19.json`.
- Desktop 1280x900 and responsive mobile 390x844 checks cover building details,
  ten research paths, fourteen hulls, ten defense classes, UFO eligibility, fleet
  idle state, quests, store, alliance upgrades/contributions and market purchase
  storage. Dialogs remain within the viewport with no page horizontal overflow.
- Browser checks are non-spending: inspect/review actions only, never confirm a
  purchase, claim a reward, launch a fleet, contribute or approve a wallet prompt.

## Boundaries

This is eligibility protection, not a new authentication boundary. Simulation
uses `sigVerify: false` and does not prove control of a wallet or replace actual
signed transaction validation. Raw passkey simulation cannot certify the final
wrapped compute budget, sponsor policy or passkey proof. Real send preflight and
all on-chain constraints remain enabled. State can change after checking and
before approval; those races still require honest reconciliation.

No program upgrade, economy change, grant, authority change, token spending or
mainnet write is included. Legacy vault setup, withdrawals, governance activation,
physical-device wallets and the remaining mainnet release matrix are not certified
by this frontend pass. Responsive checks are browser emulation, not physical phones.

## Published And Smoke Checked

- Source commits: `053ffd6` and final disabled-state polish `617da93`, pushed to
  `feat/crypto-ufos-wallet-link` on `SrMessiSOL/GAMESOL-Front-end`.
- Final immutable Production build:
  `https://frontend-sh8jtofl9-srmessisols-projects.vercel.app`.
- Both `chained-universe.vercel.app` and `gamesol-devnet-qa.vercel.app` point to
  that exact build. The final blocked-button appearance was checked at desktop
  and mobile widths before switching the main game alias.
- Public RPC genesis rechecked as devnet. Public browser loaded the final
  immutable asset host and restored Default / Homeworld 9:427:13 and UFO #513.
- Post-publication read-only smoke check: Default's 100.5 test-USDC balance is
  sufficient for a 20-USDC pack, but oversized Metal/Deuterium reserves are
  correctly disabled for storage, not funds. A fitting Crystal reserve remains
  reviewable. The daily pack review opened and was cancelled without Lazor.
- No game transaction, passkey approval, token payment, reward claim, mission
  launch or upgrade was submitted during these checks. Browser sizing restored.
