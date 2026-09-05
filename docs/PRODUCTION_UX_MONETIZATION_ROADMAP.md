# GAMESOL production UX and monetization roadmap

## Outcome

Turn the existing devnet game into one coherent, production-grade space strategy experience without replacing real on-chain behavior with mock gameplay data.

The first production-quality vertical slice is:

1. Create or restore the permanent passkey account.
2. Prepare gameplay access without exposing wallet infrastructure jargon.
3. Claim a real devnet homeworld.
4. Navigate universe -> galaxy -> system -> planet.
5. Complete one real planet action and one real fleet action.
6. Discover an alliance or decision market.
7. Open the store, understand an offer, and complete or safely cancel a real USDC purchase.

The existing public devnet build stays operational while this work is developed behind a release flag or preview route. The new UI must use the same real programs, accounts, RPC layer, and transaction clients.

## Evidence from the current frontend

The August 24 visual audit reproduced the following problems at desktop and 390 x 844 mobile sizes:

- Universe navigation has weak visual hierarchy. Important controls are small and separated from the object or task they affect.
- Mobile compresses the wallet, coordinates, navigation, and markets into ambiguous icon-only controls.
- The universe is visually atmospheric, but it does not clearly communicate what is selectable, owned, actionable, dangerous, or commercially relevant.
- Large dialogs become bottom sheets on mobile, but their information hierarchy and actions are not redesigned for the smaller viewport.
- The decision-market empty state occupies most of the screen without giving the player a useful next action.
- Gameplay terminology, blockchain terminology, and infrastructure terminology compete for attention.
- Primary actions, secondary actions, disabled states, status labels, and warnings do not yet form a consistent visual language.

The source has accumulated multiple UI generations:

- `App.tsx`: approximately 460 KB
- `UniverseLab.tsx`: approximately 155 KB
- `PlanetWorld.tsx`: approximately 134 KB
- 691 inline style blocks
- 414 modal references
- 340 declarations below 10 px
- 267 buttons but only 42 explicit `aria-label` declarations

This means isolated CSS polishing will continue producing regressions. A shared interaction and presentation foundation has to come first.

## Product principles

### One universe, one shell

Universe, galaxy, system, planet, fleets, alliances, governance, markets, quests, store, and account management must feel like layers of one product. They should not look like separate demos joined by modal links.

### The scene is the game; UI explains and commands it

3D space remains visually dominant. Persistent UI should answer only:

- Where am I?
- What do I own?
- What is happening now?
- What can I do next?
- What will this action cost and when will it finish?

### Complexity is revealed progressively

New players see goals and plain-language actions. Experienced players can enable dense tables, keyboard shortcuts, compact windows, filters, batch actions, and advanced transaction details.

### Blockchain is proof, not vocabulary

Default copy uses `game account`, `play balance`, `Quick Play`, `confirm`, and `completed`. PDA, rent, signer, RPC, blockhash, instruction, and account addresses live under Advanced or Verify on Solana.

### Every purchase is understandable

Before a USDC purchase, show the exact price, destination world/account, permanent or consumable nature, reset period, gameplay effect, and refund/failure behavior. Never present decision-market volume or ANTIMATTER movement as store revenue.

### No fake production state

Production and devnet player surfaces use real chain data. Automated visual tests may use frozen, clearly test-only snapshots captured from real devnet accounts; those fixtures must never enter the production data path or appear as live state.

## Target information architecture

### Desktop shell

- **Top command bar:** location breadcrumb, account state, compact resources, notifications, search/jump.
- **Left navigation rail:** Universe, Worlds, Fleets, Alliance, Markets, Store. Labels remain visible until the player explicitly selects compact mode.
- **Center scene:** universe/galaxy/system/planet with clear hover, selection, ownership, threat, and live-event states.
- **Right context inspector:** selected galaxy, star, planet, fleet, proposal, or offer. The inspector changes with selection instead of opening a new modal for every object.
- **Bottom activity strip:** queues, missions, arrivals, proposal deadlines, transaction state, and alerts.

### Mobile shell

- Five-item bottom navigation: Universe, Worlds, Fleets, Alliance, More.
- A single contextual bottom sheet for the selected spatial object.
- Wallet/account status inside the profile sheet, not squeezed into the scene toolbar.
- Minimum 44 x 44 px primary targets; 48 x 48 px is the preferred mobile standard.
- Safe-area aware sticky primary action.
- No essential interaction available only through hover.

### High-density mode

Following the useful part of EVE's Photon approach, experienced players can switch windows between Comfortable and Compact density. Compact mode changes spacing and information density; it must not remove close, minimize, help, or primary-action controls.

## The interaction system

Replace the current collection of independent overlays with three standardized surfaces:

1. **Dialog:** destructive confirmation, short error, passkey approval, purchase confirmation. One decision, no nested scrolling.
2. **Sheet/Inspector:** object details, filters, fleet preview, mobile context. Dismissible and connected to the selected scene object.
3. **Workspace:** alliance management, governance, decision markets, store catalog, inventory, empire management. Full-height, routable, and capable of tabs, search, sorting, and pagination.

Every surface must provide:

- a consistent close control in the same corner;
- Escape/back behavior and focus restoration;
- focus trapping where appropriate;
- sticky title/status and sticky action footer;
- loading, empty, error, success, and partially available states;
- plain-language summary with optional advanced on-chain details;
- no nested modal on top of another modal.

## Visual system

### Typography

- Use the display face only for major titles and identity moments.
- Use a highly legible sans-serif for instructions, descriptions, values, and forms.
- Use monospace only for coordinates, timers, compact telemetry, and addresses.
- Default body text: 14 px desktop, 16 px mobile.
- Default compact metadata: no smaller than 11 px desktop or 12 px mobile.
- Avoid full-uppercase paragraphs and extreme letter spacing.

### Color and hierarchy

- Neutral panels carry information; cyan indicates selection/action; green success; amber warning; red danger; violet governance/decision markets.
- Color is never the only status signal. Pair it with icon, label, pattern, or shape.
- Text under 18 pt targets at least 4.5:1 contrast.
- Increase panel opacity when dense text is displayed over bright stars, planets, or nebulae.

### Spatial presentation

- Make selectable objects visually legible before hover.
- Separate visual scale from hit-target scale so stars and galaxies remain immense but easy to select.
- Selection should create a stable focus state, not just a transient glow.
- Labels use collision avoidance, distance-based detail, and clustering.
- Motion communicates orbit, travel, selection, and danger; decorative motion is reduced and supports `prefers-reduced-motion`.

### Assets

- Define quality bars for stars, planets, ships, buildings, icons, VFX, audio, and empty-state illustrations.
- Use one lighting and color pipeline so planet appearance remains consistent between system and planet views.
- Use authored LODs and texture budgets rather than lowering the entire scene indiscriminately on mobile.

## Core screen redesigns

### 1. Onboarding

Collapse the current five technical steps into three player-facing chapters:

1. **Create your game account** — passkey creation/restoration.
2. **Prepare to play** — balance and Quick Play handled together, with recovery guidance.
3. **Claim your first world** — commander identity, homeworld choice, and immediate arrival in the planet scene.

Acceptance targets:

- Median completion under five minutes once required devnet funds exist.
- No unexplained blockchain term on the primary path.
- Refresh/retry at every network boundary.
- Returning players never see completed setup as an unfinished wizard.
- Cross-device recovery is explained before the player deposits meaningful assets.

### 2. Universe, galaxy, and system navigation

- Add zoom-level breadcrumb and selected-object inspector.
- Make ownership, alliance, population, activity, danger, and live market signals filterable.
- Provide search and jump by galaxy/system/planet name and coordinates.
- Add overview/list mode for accessibility and high-density empires.
- Preserve believable stellar scale and collision-safe orbits while enlarging selectable hit volumes.
- Keep camera position stable across background-tab throttling and recompute moving fleet targets from the current orbital state.

### 3. Planet command

- Make the planet the hero visual.
- Replace ten icon-only operation buttons with grouped, labeled commands: Develop, Technology, Fleet, Defense, Economy, Alliance.
- Always show active build/research/ship queues and their real completion times.
- Empire switcher supports 50+ planets through search, filters, favorites, alerts, and virtualization.
- Batch actions are opt-in, previewed, and checked against real available resources.

### 4. Fleets

- Dedicated fleet workspace for active, returning, awaiting-resolution, and available fleets.
- Route preview shows origin, destination, duration, fuel, cargo, risk, and blockers before confirmation.
- Spatial fleet paths remain cinematic, while the workspace remains the authoritative operational view.
- Arrived fleets awaiting resolution do not remain visually flying through empty space.

### 5. Alliances and governance

- Alliance workspace: Overview, Members, Territory, Treasury, Projects, Governance, History.
- Permissions and membership eligibility are shown before the player reaches an action.
- Alliance-only markets visibly explain who may trade and why.
- Public players may inspect proposal summaries and market state without being shown an enabled trade control when ineligible.
- Proposal lifecycle uses a consistent timeline: Draft -> Stake -> Trading -> Finalizing -> Resolved -> Executed/Unexecuted.
- Resolved proposals show the decision, settlement, claimed positions, execution transaction, and resulting game-state change.

### 6. Decision-market directory

- Convert the current global modal into a routable workspace.
- Tabs: Live, Needs Stake, Finalizing, Resolved.
- Search and filter by alliance, system, proposal type, deadline, volume, and eligibility.
- Empty state links to alliance discovery or explains how the first market is created.
- Proposal cards show outcome prices, liquidity, time remaining, eligibility, and affected game action without requiring a second modal.

### 7. USDC store

Initial catalog:

- 1.99-4.99 USDC: first-purchase offers and small cosmetics.
- 4.99 USDC: main entry offer.
- 9.99-14.99 USDC: commander or monthly pass.
- 19.99-24.99 USDC: season pass or alliance campaign package.
- 49.99 USDC: premium visual collection.
- 99.99 USDC: optional supporter/founder package.

Store navigation: Featured, Passes, Cosmetics, Utility, Alliance, Purchase History.

Purchase flow:

1. Offer card communicates value and restrictions.
2. Preview shows the destination and exact resulting assets/effects.
3. Confirmation shows total USDC, current balance, network, and signing behavior.
4. Pending state is persistent and can survive navigation.
5. Success links directly to the delivered item or upgraded world.
6. Failure explains the next action without exposing raw RPC errors by default.

Launch underwriting:

- Early: 1.5% monthly payer conversion x 8 USDC ARPPU = 0.12 USDC/MAU/month.
- Healthy target: 3% x 20 USDC = 0.60 USDC/MAU/month.
- Strong LiveOps: 5% x 40 USDC = 2.00 USDC/MAU/month.

Do not use high-spending strategy benchmarks as the launch forecast. USDC checkout and account funding introduce friction that native mobile IAP does not.

## Technical refactor

### Foundation packages

Create shared layers before redesigning individual features:

```text
src/
  app-shell/
  design-system/
    tokens/
    primitives/
    patterns/
  features/
    onboarding/
    universe/
    empire/
    planet/
    fleet/
    alliance/
    governance/
    store/
  chain/
  telemetry/
```

Required primitives include Button, IconButton, Field, Select, Tabs, DataTable, Badge, Tooltip, Toast, Dialog, Sheet, Workspace, EmptyState, ErrorState, Skeleton, TransactionStatus, ResourceAmount, TokenAmount, Address, Countdown, and VirtualList.

### State and navigation

- Replace independent boolean modal state with a typed route/overlay state machine.
- Give major workspaces real URLs so refresh, back, and deep links work.
- Keep chain clients and parsed on-chain state independent of presentation components.
- Normalize transaction lifecycle into idle, preparing, awaiting approval, submitted, confirming, confirmed, failed, and expired.
- Deduplicate store, alliance, wallet, and modal implementations currently present in multiple surfaces.

### Performance budgets

- Maintain 60 FPS on a representative desktop scene and at least 30 FPS on supported mobile hardware.
- Interaction response under 100 ms for local UI; INP target under 200 ms.
- No network polling tied directly to render frames.
- One cached account subscription per unique account, shared across consumers.
- RPC backoff, request coalescing, stale-while-revalidate, and explicit last-updated state.
- Route-level code splitting for planet, governance, markets, and store.
- Virtualize 50+ planets, hundreds of reports, and 100+ proposal histories.

## Delivery sequence

### Phase 0 — Baseline and guardrails (2-3 days)

- Inventory routes, modal variants, chain clients, account subscriptions, and production-only feature flags.
- Capture desktop/mobile baselines for every real devnet state available.
- Add visual, accessibility, bundle, RPC-request, and frame-time measurements.
- Define release flag and preview deployment. Do not replace the working `/app` route.

Exit: baseline report, screen matrix, design tokens, and zero ambiguity about the active production shell.

### Phase 1 — Design system and application shell (1 week)

- Implement tokens and shared primitives.
- Build desktop command shell and mobile bottom navigation.
- Standardize dialogs, sheets, workspaces, transaction feedback, empty states, and close behavior.
- Establish Comfortable and Compact density modes.

Exit: shell and primitives pass desktop/mobile keyboard, focus, contrast, and target-size checks.

### Phase 2 — Production vertical slice (1-2 weeks)

- Redesign onboarding, universe selection, system selection, one planet command, and transaction completion.
- Keep every action connected to real devnet state.
- Add plain-language error mapping and persistent submitted-transaction status.

Exit: a new player reaches a real homeworld and completes a real action without entering a legacy UI.

### Phase 3 — Empire, planet, and fleet operations (2 weeks)

- 50+ planet switcher, search, filters, alerts, queues, fleet workspace, and route preview.
- Reconcile planet visuals between system and planet views.
- Add batch-safe previews and virtualization.

Exit: stress wallet can manage 50+ planets without navigation collapse or material frame loss.

### Phase 4 — Alliance, governance, and markets (2 weeks)

- Alliance workspace, member permissions, treasury, proposal lifecycle, market eligibility, global directory, history, execution proof.
- Replace the current governance modal with a routable workspace.

Exit: eligible and ineligible players can correctly understand and complete their permitted proposal actions.

### Phase 5 — Store and LiveOps foundation (1-2 weeks)

- Catalog, offer details, USDC confirmation, pending/success/failure states, purchase history, passes, cosmetics, and event slots.
- Instrument the full funnel without recording sensitive wallet material.
- Add server-/program-enforced limits and transparent reset timers.

Exit: real devnet purchase delivers exactly once, is recoverable after refresh, and is reflected in purchase history.

### Phase 6 — Production hardening and rollout (1-2 weeks)

- Cross-browser/mobile QA, accessibility, reduced motion, latency and 429 resilience, transaction reconciliation, security review, analytics validation, and load testing.
- Gradually expose the new shell to internal, test cohort, then all devnet players.
- Retain rollback until equivalent functionality is proven.

Exit: no critical regression, defined performance budgets met, and old shell removal approved separately.

## Metrics and release gates

### Player experience

- Passkey start -> homeworld completion rate.
- Median time to first meaningful action.
- Successful return-session rate.
- Navigation misclick/backtrack rate.
- Transaction failure and abandonment rate by step.
- Planet-switch time for 1, 10, and 50+ world accounts.

### Store

- Store exposure -> open -> offer detail -> purchase start -> submitted -> confirmed.
- Monthly payer conversion.
- ARPPU and revenue per MAU.
- First-purchase time and repeat-purchase rate.
- Revenue by cosmetics, pass, utility, and alliance categories.
- Sponsored transaction cost per MAU and per payer.

### Quality

- Zero raw RPC or program errors on the default player path.
- Zero inaccessible essential icon-only controls.
- All primary mobile controls at least 44 x 44 px.
- Text and non-text contrast pass the defined thresholds.
- No clipped modal header, close button, footer, or unscrollable content at supported breakpoints.
- No production route displays synthetic empire, planet, fleet, market, or balance data.

## First implementation package

The first pull request-sized package should contain only:

1. Design tokens and typography correction.
2. Shared Button, IconButton, Dialog, Sheet, Workspace, EmptyState, and TransactionStatus.
3. New desktop/mobile shell behind a flag.
4. Universe toolbar and decision-market directory migrated to those primitives.
5. Automated checks for 390 x 844, 768 x 1024, 1366 x 768, and 1920 x 1080.

This immediately fixes the most visible amateur inconsistencies while creating the foundation needed to redesign onboarding, planet management, alliances, and the store without repeating the current modal fragmentation.

## Research anchors

- EVE Photon UI: unified design language, customizable density, compact windows, clearer grouping, readable typography, persistent preferences.
- Apple Human Interface Guidelines: 44 x 44 pt default mobile controls and adequate spacing.
- WCAG 2.2: at least 24 x 24 CSS px targets at AA, with 44 x 44 as the enhanced target.
- Android game/app guidance: 48 x 48 dp touch targets.
- AppMagic 2025: strategy-game spending, $4.99 common offers, premium bundle growth, and alternative-payment adoption.
- Sensor Tower 2025/2026 LiveOps research: passes, recurring events, alliance competitions, collections, and connected event layers as sustainable monetization systems.
