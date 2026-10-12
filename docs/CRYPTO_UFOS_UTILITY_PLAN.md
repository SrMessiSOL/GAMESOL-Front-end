# Crypto UFOs Commander Utility

Status: proposal only. No bonuses, rewards, NFT locks, or token promises are deployed.

## Verified collection evidence

Mainnet collection: `53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb`.
Source: the existing GAMESOL DAS-backed `/api/crypto-ufos` collection reader, pages 1-3, inspected 2026-10-12. It returned 63 eligible, unburned compressed assets from 72 requested records. This is a metadata sample, not the collection supply or a complete trait-frequency census.
Marketplace reference: https://www.tensor.trade/trade/cryptoufos

Observed categories: `Background`, `Body`, `Accesory`, `Eyes`, `Hair`, `Mouth`, `Rarity Rank`.
Keep the original metadata spelling `Accesory`; display it as Accessory. Normalize whitespace for matching (`3D  Glasses` contains two spaces), but preserve original values in the trait inspector.

Examples: Crypto UFO #8342 has Silver UFO / Choker / Normal / Bitcoiner / Dracula; #785 has Red UFO / Gold Chain / Regular Shades / Bitcoiner / Mustache. They are public collection examples, not claims about any player's wallet.

## Product Direction

Make UFOs distinct commanders with founder identity and optional expedition specializations, not a purchased advantage in PvP. Each holder gets the same baseline access. More NFTs and higher rarity must not compound power.

### 1. Founder identity: ship first

- Selected real NFT as commander portrait: already implemented.
- Founder insignia on the commander profile, alliance roster, and battle-report identity after authenticated ownership is implemented.
- Body/background-derived uniform, command-frame palette, banner, and ship decals using the real NFT artwork.
- No passive resource multiplier, combat stats, yield, ICO entitlement, or promised ANTIMATTER allocation.

### 2. Body: one expedition doctrine

These are proposed equal-budget roles, not live bonuses:

| Observed Body | Doctrine | Exclusive PvE contract theme |
| --- | --- | --- |
| Silver UFO | Engineer | Repair stations and recover damaged infrastructure |
| Blue UFO | Navigator | Chart safe routes and survey stellar anomalies |
| Red UFO | Escort | Protect civilian expeditions from NPC hazards |
| Green UFO | Biologist | Survey ecosystems and catalogue planetary samples |
| Gold UFO | Quartermaster | Deliver relief supplies and coordinate convoys |
| Pink UFO | Envoy | First-contact and alliance liaison expeditions |

Start with different objectives and cosmetics, not different economic rewards. Standard commanders retain equivalent contracts. Give each doctrine a distinctive mission chain and a balanced, non-transferable commander reputation track. Only consider a small PvE time/fuel tradeoff after real mission simulations and economy review; no PvP damage, shielding, production, or market-fee changes.

### 3. Eyes: optional mission route

| Observed Eyes | Proposed route |
| --- | --- |
| VR / 3D Glasses | Simulation and anomaly-analysis route |
| Nerd Glasses / Horned Rim Glasses | Research and survey route |
| Eye Patch | Salvage route |
| Classic Shades / Regular Shades / Small Sun Glasses / Violet Shades | Reconnaissance route |
| Normal / Small Eyes / O0 / Clown Eyes Blue / Clown Eyes Green | First-contact route |

Routes offer a choice of objectives, narration, and cosmetic milestones. They do not add independent stacking stat bonuses. Reconnaissance here means PvE missions, not restoring the abandoned privacy or spy-ship migration.

### 4. Other traits: personality and recognition

- `Hair`: commander callsign/title and command-room presentation. Observed examples include Bitcoiner, Tiara, Hoodie, Bandana, Cap, Fedora, Peak Spike, and Mohawk Dark.
- `Accesory`: insignia/decals. Gold Chain, Silver Chain, Choker, Earring, Frown, Mole, and Clown Nose do not alter treasury or market authority.
- `Mouth`: dialogue/personality set. Observed examples include Dracula, Happy, Bored, Pipe, Red Lips, and beard variants. A trait must never imply a real-world financial reward.
- `Background`: profile/banner palette only; keep text contrast and normal game HUD colors intact.
- `Rarity Rank`: collectible recognition only. Do not use it as a combat multiplier or infer reliable rarity percentages from this sample.
- Unknown/new traits: normal commander baseline and original artwork; never fabricate a trait or silently grant a bonus.

## Equip And Ownership Rules

1. One active UFO commander per game account; no fleet-wide NFT stacking.
2. Switching portrait stays immediate and free. Gameplay doctrine changes use a proposed 24-hour cooldown and cannot modify an already launched mission.
3. No NFT staking, burning, transferring, or delegation is required.
4. Record expedition eligibility at launch. Selling/transferring an NFT blocks new holder-only contracts once ownership is rechecked; it must not erase legitimately completed missions or retroactively change outcomes.
5. Reward receipts are keyed by game account, season, and contract. Add collection-wide asset-use limits where necessary to stop moving one NFT between accounts to repeat founder claims.
6. Mission progress belongs to the game account, not transferable NFT market value. No permanent economic benefit survives selling the NFT.
7. DAS errors must not grant privileges or falsely claim a sale. Show verification pending, preserve legitimate existing mission receipts, and prevent new privileged launches until verification succeeds.

## Security Boundary Before Any Gameplay Utility

Today's read-only connection and local avatar preference are cosmetic, not proof that a caller controls the NFT wallet. Anyone can submit a public owner address. They must NEVER authorize rewards, founder grants, or stat changes.

For utility, require an explicit opt-in proof of NFT-wallet control (domain-bound, nonce-bound, expiring message signed by the holding wallet) and a verified game-account identity. Reuse an existing authenticated game session or a normal game claim transaction; do not introduce a second LazorKit signature into the gallery/portrait flow. If existing game authentication cannot be verified on the server, that is a prerequisite to solve, not a reason to trust a client-supplied commander address.

Verify live mainnet DAS ownership and exact collection/compression/burn status, then maintain a unique asset-to-game-account authorization with expiry, revocation, replay protection, rate limits, and explicit wallet/account-change handling. The privileged game backend/program enforces eligibility and claims; client-provided traits and localStorage never do.

Mainnet NFT Merkle roots cannot be verified directly by a devnet game program. Devnet utility tests need a clearly bounded server attestation or separate test collection. For a mainnet release, choose and audit either same-chain compressed-NFT ownership verification or an explicitly trusted, constrained attestation authority. Never present a DAS response as an on-chain proof.

## Delivery Order

1. Complete UI navigation polish and the authenticated founder-identity milestone.
2. Audit the full collection metadata: all trait values, frequencies, missing traits, mutability/update authority, and collection verification.
3. Approve the doctrine mapping with the Crypto UFOs community; existing art traits were not originally designed as gameplay stats.
4. Build one playable devnet expedition chain for two doctrines, with identical reward budgets and no token reward changes.
5. Test wallet switches, NFT sales, stale providers, replay, account-link conflicts, cooldown bypass, and claim farming. Run mission/economy simulations.
6. Publish exact utility rules, trust assumptions, caps, and transfer behavior before mainnet activation.

Decision needed before implementation: founder identity + cosmetic mission chains first (recommended), or opt-in PvE sidegrades after balance tests. PvP power by rarity is excluded from this proposal.
