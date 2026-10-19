# Frozen Instruction Inventory V1

Generated from canonical program entry points. Coverage is tracked by the linked master checklist, not inferred from this inventory.

| Program | Instruction | Source line | Checklist |
| --- | --- | ---: | --- |
| game-state | `set_commander_identity` | 21 | T22 |
| game-state | `clear_commander_identity` | 25 | T22 |
| game-state | `configure_ufo` | 30 | T32 |
| game-state | `start_ufo_expedition` | 33 | T23 |
| game-state | `advance_ufo_expedition` | 36 | T23 |
| game-state | `claim_ufo_loot` | 39 | T23 |
| game-state | `equip_ufo_loot` | 42 | T23 |
| game-state | `abort_ufo_expedition` | 45 | T23 |
| game-state | `initialize_lazor_player` | 51 | T01 |
| game-state | `sponsor_account_rent` | 57 | T02 |
| game-state | `initialize_player` | 64 | T01 |
| game-state | `rotate_vault` | 86 | T02 |
| game-state | `initialize_vault_for_existing_player` | 108 | T02 |
| game-state | `revoke_vault` | 130 | T02 |
| game-state | `extend_vault` | 134 | T02 |
| game-state | `initialize_homeworld` | 138 | T01 |
| game-state | `initialize_colony` | 145 | T01 |
| game-state | `sync_planet_owner_index_vault` | 153 | T01 |
| game-state | `initialize_public_homeworld` | 160 | T01 |
| game-state | `initialize_public_colony` | 167 | T01 |
| game-state | `sync_public_planet_view` | 174 | T01 |
| game-state | `initialize_quest_state` | 178 | T16 |
| game-state | `initialize_quest_progress` | 182 | T16 |
| game-state | `initialize_quest_reward_targets` | 186 | T16 |
| game-state | `initialize_store_config` | 192 | T32 |
| game-state | `update_store_config` | 199 | T32 |
| game-state | `rotate_store_config_admin` | 203 | T32 |
| game-state | `purchase_store_pack` | 210 | T17 |
| game-state | `daily_check_in` | 218 | T16 |
| game-state | `daily_check_in_vault` | 222 | T16 |
| game-state | `claim_quest` | 226 | T16 |
| game-state | `claim_quest_vault` | 230 | T16 |
| game-state | `create_alliance` | 238 | T18 |
| game-state | `join_alliance` | 247 | T18 |
| game-state | `request_join_alliance` | 251 | T18 |
| game-state | `request_join_alliance_vault` | 255 | T18 |
| game-state | `approve_join_request` | 259 | T18 |
| game-state | `reject_join_request` | 263 | T18 |
| game-state | `expel_alliance_member` | 267 | T18 |
| game-state | `transfer_alliance_leadership` | 271 | T18 |
| game-state | `leave_alliance` | 275 | T18 |
| game-state | `claim_alliance_mission` | 279 | T21 |
| game-state | `initialize_alliance_treasury` | 287 | T19 |
| game-state | `initialize_alliance_treasury_vault` | 291 | T19 |
| game-state | `deposit_alliance_resources` | 297 | T19 |
| game-state | `deposit_alliance_resources_vault` | 311 | T19 |
| game-state | `upgrade_alliance_building` | 325 | T20 |
| game-state | `claim_system_sovereignty` | 332 | T31 |
| game-state | `fund_system_sovereignty` | 348 | T31 |
| game-state | `set_system_sovereignty_specialization` | 356 | T31 |
| game-state | `initialize_alliance_governance` | 370 | T31 |
| game-state | `initialize_gamesol_governance` | 378 | T31 |
| game-state | `enroll_alliance_in_gamesol_governance` | 386 | T31 |
| game-state | `sync_alliance_gamesol_governance` | 392 | T31 |
| game-state | `create_alliance_decision` | 399 | T31 |
| game-state | `execute_alliance_decision` | 425 | T31 |
| game-state | `produce` | 434 | T05 |
| game-state | `produce_vault` | 438 | T05 |
| game-state | `start_build` | 442 | T06 |
| game-state | `start_build_vault` | 446 | T06 |
| game-state | `finish_build` | 454 | T06 |
| game-state | `finish_build_vault` | 458 | T06 |
| game-state | `start_research` | 462 | T07 |
| game-state | `start_research_vault` | 466 | T07 |
| game-state | `finish_research` | 474 | T07 |
| game-state | `finish_research_vault` | 478 | T07 |
| game-state | `build_ship` | 482 | T08 |
| game-state | `build_ship_vault` | 491 | T08 |
| game-state | `finish_ship_build` | 500 | T08 |
| game-state | `finish_ship_build_vault` | 504 | T08 |
| game-state | `build_defense` | 508 | T09 |
| game-state | `build_defense_vault` | 517 | T09 |
| game-state | `finish_defense_build` | 526 | T09 |
| game-state | `finish_defense_build_vault` | 530 | T09 |
| game-state | `launch_fleet` | 537 | T10 |
| game-state | `launch_fleet_vault` | 541 | T10 |
| game-state | `lock_resources_for_market` | 548 | T24 |
| game-state | `release_resources_from_market` | 556 | T24 |
| game-state | `transfer_resources_from_market` | 564 | T24 |
| game-state | `resolve_transport` | 572 | T11 |
| game-state | `resolve_transport_vault` | 576 | T11 |
| game-state | `resolve_transport_empty` | 584 | T11 |
| game-state | `resolve_transport_empty_vault` | 592 | T11 |
| game-state | `resolve_attack` | 600 | T14 |
| game-state | `resolve_attack_vault` | 604 | T14 |
| game-state | `resolve_espionage` | 612 | T13 |
| game-state | `resolve_espionage_vault` | 616 | T13 |
| game-state | `resolve_colonize` | 624 | T12 |
| game-state | `resolve_colonize_vault` | 628 | T12 |
| game-state | `transfer_planet` | 636 | T26 |
| game-state | `transfer_planet_from_market` | 642 | T25 |
| game-state | `initialize_game_config` | 648 | T32 |
| game-state | `update_antimatter_mint` | 655 | T32 |
| game-state | `rotate_game_config_admin` | 662 | T32 |
| game-state | `claim_antimatter_faucet` | 669 | T32 |
| game-state | `accelerate_build_with_antimatter` | 673 | T15 |
| game-state | `accelerate_research_with_antimatter` | 677 | T15 |
| game-state | `accelerate_ship_build_with_antimatter` | 681 | T15 |
| game-state | `accelerate_defense_build_with_antimatter` | 685 | T15 |
| game-state | `accelerate_mission_with_antimatter` | 689 | T15 |
| market | `initialize_market` | 22 | T32 |
| market | `initialize_escrow` | 26 | T32 |
| market | `update_market_config` | 30 | T32 |
| market | `rotate_market_config_admin` | 37 | T32 |
| market | `create_offer` | 44 | T24 |
| market | `cancel_offer` | 53 | T24 |
| market | `accept_offer` | 57 | T24 |
| market | `create_planet_listing` | 61 | T25 |
| market | `cancel_planet_listing` | 68 | T25 |
| market | `buy_planet_listing` | 72 | T25 |

## Catalog Definitions

Every indexed definition below is in scope. An aggregate pass does not certify every item. Use the parent checklist row and retain item-specific receipts when closing it.

### BUILDINGS (13)

- BUILDINGS-00: `{ idx: 0, key: "metalMine", name: "Metal Mine", icon: "⬡", desc: "Extracts metal from the planet crust." }`
- BUILDINGS-01: `{ idx: 1, key: "crystalMine", name: "Crystal Mine", icon: "◈", desc: "Processes surface crystal formations." }`
- BUILDINGS-02: `{ idx: 2, key: "deuteriumSynthesizer", name: "Deuterium Synthesizer", icon: "◉", desc: "Extracts deuterium from the atmosphere." }`
- BUILDINGS-03: `{ idx: 3, key: "solarPlant", name: "Solar Plant", icon: "☀", desc: "Converts sunlight to energy." }`
- BUILDINGS-04: `{ idx: 4, key: "fusionReactor", name: "Fusion Reactor", icon: "⚛", desc: "Burns deuterium for high-yield energy." }`
- BUILDINGS-05: `{ idx: 5, key: "roboticsFactory", name: "Robotics Factory", icon: "🤖", desc: "Automated workers — halves build time." }`
- BUILDINGS-06: `{ idx: 6, key: "naniteFactory", name: "Nanite Factory", icon: "🔬", desc: "Nano assemblers — massive build speed." }`
- BUILDINGS-07: `{ idx: 7, key: "shipyard", name: "Shipyard", icon: "🚀", desc: "Constructs ships and defense units." }`
- BUILDINGS-08: `{ idx: 8, key: "metalStorage", name: "Metal Storage", icon: "🏗", desc: "Increases metal cap." }`
- BUILDINGS-09: `{ idx: 9, key: "crystalStorage", name: "Crystal Storage", icon: "🏗", desc: "Increases crystal cap." }`
- BUILDINGS-10: `{ idx: 10, key: "deuteriumTank", name: "Deuterium Tank", icon: "🏗", desc: "Increases deuterium cap." }`
- BUILDINGS-11: `{ idx: 11, key: "researchLab", name: "Research Lab", icon: "🔭", desc: "Required for all technology research." }`
- BUILDINGS-12: `{ idx: 12, key: "missileSilo", name: "Missile Silo", icon: "🎯", desc: "Legacy missile infrastructure." }`

### SHIPS (14)

- SHIPS-00: `{ key: "smallCargo", name: "Small Cargo", icon: "📦", atk: 5, cargo: 5_000, cost: { m: 2000, c: 2000, d: 0 } }`
- SHIPS-01: `{ key: "largeCargo", name: "Large Cargo", icon: "🚛", atk: 5, cargo: 25_000, cost: { m: 6000, c: 6000, d: 0 } }`
- SHIPS-02: `{ key: "lightFighter", name: "Light Fighter", icon: "✈", atk: 50, cargo: 50, cost: { m: 3000, c: 1000, d: 0 } }`
- SHIPS-03: `{ key: "heavyFighter", name: "Heavy Fighter", icon: "⚡", atk: 150, cargo: 100, cost: { m: 6000, c: 4000, d: 0 } }`
- SHIPS-04: `{ key: "cruiser", name: "Cruiser", icon: "🛸", atk: 400, cargo: 800, cost: { m: 20000, c: 7000, d: 2000 } }`
- SHIPS-05: `{ key: "battleship", name: "Battleship", icon: "⚔", atk: 1000, cargo: 1500, cost: { m: 45000, c: 15000, d: 0 } }`
- SHIPS-06: `{ key: "battlecruiser", name: "Battlecruiser", icon: "🔱", atk: 700, cargo: 750, cost: { m: 30000, c: 40000, d: 15000 } }`
- SHIPS-07: `{ key: "bomber", name: "Bomber", icon: "💣", atk: 1000, cargo: 500, cost: { m: 50000, c: 25000, d: 15000 } }`
- SHIPS-08: `{ key: "destroyer", name: "Destroyer", icon: "💥", atk: 2000, cargo: 2000, cost: { m: 60000, c: 50000, d: 15000 } }`
- SHIPS-09: `{ key: "deathstar", name: "Deathstar", icon: "🌑", atk: 200000, cargo: 1000000, cost: { m: 5000000, c: 4000000, d: 1000000 } }`
- SHIPS-10: `{ key: "recycler", name: "Recycler", icon: "♻", atk: 1, cargo: 20_000, cost: { m: 10000, c: 6000, d: 2000 } }`
- SHIPS-11: `{ key: "espionageProbe",name: "Espionage Probe",icon: "👁", atk: 0, cargo: 0, cost: { m: 0, c: 1000, d: 0 } }`
- SHIPS-12: `{ key: "colonyShip", name: "Colony Ship", icon: "🌍", atk: 50, cargo: 7500, cost: { m: 10000, c: 20000, d: 10000 } }`
- SHIPS-13: `{ key: "solarSatellite",name: "Solar Satellite",icon: "🛰", atk: 1, cargo: 0, cost: { m: 0, c: 2000, d: 500 } }`

### RESEARCH (10)

- RESEARCH-00: `{ name: "Energy Technology", key: "energyTech", desc: "Raises Fusion Reactor energy output by 10%.", cost: [0, 800, 400] }`
- RESEARCH-01: `{ name: "Combustion Drive", key: "combustionDrive", desc: "Improves travel speed for combustion-drive ships.", cost: [400, 0, 600] }`
- RESEARCH-02: `{ name: "Impulse Drive", key: "impulseDrive", desc: "Improves travel speed for impulse-drive ships.", cost: [2000, 4000, 600] }`
- RESEARCH-03: `{ name: "Hyperspace Drive", key: "hyperspaceDrive", desc: "Improves travel speed for hyperspace-drive ships.", cost: [10000, 20000, 6000] }`
- RESEARCH-04: `{ name: "Computer Technology", key: "computerTech", desc: "Advances toward additional usable mission slots.", cost: [0, 400, 600] }`
- RESEARCH-05: `{ name: "Astrophysics", key: "astrophysics", desc: "Advances colonization capacity and colony requirements.", cost: [4000, 2000, 1000] }`
- RESEARCH-06: `{ name: "Intergalactic Research Network", key: "igrNetwork", desc: "Increases the research-network level and laboratory requirements.", cost: [240000, 400000, 160000] }`
- RESEARCH-07: `{ name: "Weapons Technology", key: "weaponsTechnology", desc: "Increases weapons effectiveness for ships and defenses.", cost: [800, 200, 0] }`
- RESEARCH-08: `{ name: "Shielding Technology", key: "shieldingTechnology", desc: "Increases shielding effectiveness for ships and defenses.", cost: [200, 600, 0] }`
- RESEARCH-09: `{ name: "Armor Technology", key: "armorTechnology", desc: "Increases armor effectiveness for ships and defenses.", cost: [1000, 0, 0] }`

### DEFENSE (10)

- DEFENSE-00: `{ name: "Rocket Launcher", key: "rocketLauncher", role: "KINETIC BATTERY", desc: "Reliable surface defense for the first layer of a planetary grid.", cost: [2000, 0, 0] }`
- DEFENSE-01: `{ name: "Light Laser", key: "lightLaser", role: "LASER BATTERY", desc: "Low-cost directed-energy coverage for sustained perimeter defense.", cost: [1500, 500, 0] }`
- DEFENSE-02: `{ name: "Heavy Laser", key: "heavyLaser", role: "HEAVY BATTERY", desc: "Reinforced laser emplacement for stronger orbital resistance.", cost: [6000, 2000, 0] }`
- DEFENSE-03: `{ name: "Gauss Cannon", key: "gaussCannon", role: "MASS DRIVER", desc: "High-impact electromagnetic artillery for hardened targets.", cost: [20000, 15000, 2000] }`
- DEFENSE-04: `{ name: "Ion Cannon", key: "ionCannon", role: "ION BATTERY", desc: "Shield-focused energy defense supported by advanced technology.", cost: [2000, 6000, 0] }`
- DEFENSE-05: `{ name: "Plasma Turret", key: "plasmaTurret", role: "PLASMA BATTERY", desc: "Endgame surface weapon requiring a mature technology stack.", cost: [50000, 50000, 30000] }`
- DEFENSE-06: `{ name: "Small Shield Dome", key: "smallShieldDome", role: "PLANETARY SHIELD", desc: "A unique defensive field protecting the planetary command zone.", cost: [10000, 10000, 0] }`
- DEFENSE-07: `{ name: "Large Shield Dome", key: "largeShieldDome", role: "PLANETARY SHIELD", desc: "A unique large-scale field for advanced planetary protection.", cost: [50000, 50000, 0] }`
- DEFENSE-08: `{ name: "Anti-Ballistic Missile", key: "antiBallisticMissile", role: "MISSILE DEFENSE", desc: "Interceptor stockpile produced through the planetary missile silo.", cost: [8000, 0, 2000] }`
- DEFENSE-09: `{ name: "Interplanetary Missile", key: "interplanetaryMissile", role: "STRATEGIC MISSILE", desc: "Long-range missile inventory enabled by silo infrastructure.", cost: [12500, 2500, 5000] }`

### STORE_PACKS (25)

- STORE_PACKS-00: `{ period: 1, id: 0, group: "Daily", title: "Daily Metal Cache", hint: "Focused metal refill for one active session.", priceUsdc: 1_000_000n, reward: { metal: 3000, crystal: 0, deuterium: 0 } }`
- STORE_PACKS-01: `{ period: 1, id: 1, group: "Daily", title: "Daily Crystal Cache", hint: "Focused crystal refill for one active session.", priceUsdc: 1_000_000n, reward: { metal: 0, crystal: 2000, deuterium: 0 } }`
- STORE_PACKS-02: `{ period: 1, id: 2, group: "Daily", title: "Daily Deuterium Cache", hint: "Focused fuel refill for one active session.", priceUsdc: 1_000_000n, reward: { metal: 0, crystal: 0, deuterium: 750 } }`
- STORE_PACKS-03: `{ period: 1, id: 3, group: "Daily", title: "Daily Supply Drop", hint: "Metal, crystal, and deuterium together.", priceUsdc: 3_000_000n, reward: { metal: 3000, crystal: 2000, deuterium: 750 } }`
- STORE_PACKS-04: `{ period: 1, id: 4, group: "Daily", title: "Daily Logistics Crate", hint: "A modest boost without skipping progression.", priceUsdc: 5_000_000n, reward: { metal: 8000, crystal: 5000, deuterium: 2000 } }`
- STORE_PACKS-05: `{ period: 1, id: 5, group: "Daily", title: "Daily Builder Cache", hint: "Extra daily materials for active builders.", priceUsdc: 7_500_000n, reward: { metal: 14000, crystal: 9000, deuterium: 3500 } }`
- STORE_PACKS-06: `{ period: 1, id: 16, group: "Daily", title: "Daily Defense Shield", hint: "Adds 6 hours of attack protection, capped on-chain.", priceUsdc: 1_000_000n, reward: { metal: 0, crystal: 0, deuterium: 0 }, shieldSeconds: 6 * 60 * 60 }`
- STORE_PACKS-07: `{ period: 2, id: 0, group: "Weekly", title: "Weekly Metal Reserve", hint: "Focused weekly metal for construction queues.", priceUsdc: 5_000_000n, reward: { metal: 35000, crystal: 0, deuterium: 0 } }`
- STORE_PACKS-08: `{ period: 2, id: 1, group: "Weekly", title: "Weekly Crystal Reserve", hint: "Focused weekly crystal for research and ships.", priceUsdc: 5_000_000n, reward: { metal: 0, crystal: 24000, deuterium: 0 } }`
- STORE_PACKS-09: `{ period: 2, id: 2, group: "Weekly", title: "Weekly Deuterium Reserve", hint: "Focused weekly fuel for fleet activity.", priceUsdc: 5_000_000n, reward: { metal: 0, crystal: 0, deuterium: 10000 } }`
- STORE_PACKS-10: `{ period: 2, id: 3, group: "Weekly", title: "Weekly Foundry Pack", hint: "Balanced material to keep queues moving.", priceUsdc: 15_000_000n, reward: { metal: 35000, crystal: 24000, deuterium: 10000 } }`
- STORE_PACKS-11: `{ period: 2, id: 4, group: "Weekly", title: "Weekly Expansion Pack", hint: "Supports fleet and building momentum.", priceUsdc: 30_000_000n, reward: { metal: 80000, crystal: 55000, deuterium: 25000 } }`
- STORE_PACKS-12: `{ period: 2, id: 5, group: "Weekly", title: "Weekly War Chest", hint: "Heavier weekly support for active commanders.", priceUsdc: 45_000_000n, reward: { metal: 140000, crystal: 90000, deuterium: 40000 } }`
- STORE_PACKS-13: `{ period: 2, id: 16, group: "Weekly", title: "Weekly Defense Shield", hint: "Adds 24 hours of attack protection, capped on-chain.", priceUsdc: 5_000_000n, reward: { metal: 0, crystal: 0, deuterium: 0 }, shieldSeconds: 24 * 60 * 60 }`
- STORE_PACKS-14: `{ period: 3, id: 0, group: "Monthly", title: "Monthly Metal Reserve", hint: "Focused monthly metal for large construction.", priceUsdc: 20_000_000n, reward: { metal: 180000, crystal: 0, deuterium: 0 } }`
- STORE_PACKS-15: `{ period: 3, id: 1, group: "Monthly", title: "Monthly Crystal Reserve", hint: "Focused monthly crystal for research growth.", priceUsdc: 20_000_000n, reward: { metal: 0, crystal: 125000, deuterium: 0 } }`
- STORE_PACKS-16: `{ period: 3, id: 2, group: "Monthly", title: "Monthly Deuterium Reserve", hint: "Focused monthly fuel for fleet operations.", priceUsdc: 20_000_000n, reward: { metal: 0, crystal: 0, deuterium: 60000 } }`
- STORE_PACKS-17: `{ period: 3, id: 3, group: "Monthly", title: "Monthly Sector Pack", hint: "A larger but capped monthly resource bundle.", priceUsdc: 60_000_000n, reward: { metal: 180000, crystal: 125000, deuterium: 60000 } }`
- STORE_PACKS-18: `{ period: 3, id: 4, group: "Monthly", title: "Monthly Command Pack", hint: "Strong monthly support for established planets.", priceUsdc: 100_000_000n, reward: { metal: 400000, crystal: 275000, deuterium: 140000 } }`
- STORE_PACKS-19: `{ period: 3, id: 5, group: "Monthly", title: "Monthly Builder Pack", hint: "Deep resource support for long build plans.", priceUsdc: 150_000_000n, reward: { metal: 700000, crystal: 450000, deuterium: 220000 } }`
- STORE_PACKS-20: `{ period: 3, id: 6, group: "Monthly", title: "Monthly Fleet Pack", hint: "Large support for active shipyard cycles.", priceUsdc: 200_000_000n, reward: { metal: 1000000, crystal: 650000, deuterium: 320000 } }`
- STORE_PACKS-21: `{ period: 3, id: 7, group: "Monthly", title: "Monthly Research Pack", hint: "Premium monthly support for research-heavy players.", priceUsdc: 250_000_000n, reward: { metal: 1350000, crystal: 900000, deuterium: 450000 } }`
- STORE_PACKS-22: `{ period: 3, id: 8, group: "Monthly", title: "Monthly Empire Pack", hint: "A high-cap monthly bundle for mature accounts.", priceUsdc: 300_000_000n, reward: { metal: 1750000, crystal: 1150000, deuterium: 600000 } }`
- STORE_PACKS-23: `{ period: 3, id: 9, group: "Monthly", title: "Monthly Deep Space Pack", hint: "Largest monthly resource support before caps.", priceUsdc: 400_000_000n, reward: { metal: 2500000, crystal: 1700000, deuterium: 850000 } }`
- STORE_PACKS-24: `{ period: 3, id: 16, group: "Monthly", title: "Monthly Defense Shield", hint: "Adds 3 days of attack protection, capped on-chain.", priceUsdc: 12_500_000n, reward: { metal: 0, crystal: 0, deuterium: 0 }, shieldSeconds: 3 * 24 * 60 * 60 }`

### QUEST_DEFINITIONS (54)

- QUEST_DEFINITIONS-00: `{ period: 0, id: 0, group: "Tutorial", title: "Establish command", hint: "Create your first planet and open the command surface.", reward: { metal: 500, crystal: 300, deuterium: 0 }, requirements: [] }`
- QUEST_DEFINITIONS-01: `{ period: 0, id: 1, group: "Tutorial", title: "Upgrade Metal Mine Lv 2", hint: "Metal is the backbone of early construction.", reward: { metal: 700, crystal: 200, deuterium: 0 }, requirements: [questReq("Metal Mine", 2, s => s.planet.metalMine)] }`
- QUEST_DEFINITIONS-02: `{ period: 0, id: 2, group: "Tutorial", title: "Upgrade Crystal Mine Lv 2", hint: "Crystal unlocks research and higher infrastructure.", reward: { metal: 400, crystal: 600, deuterium: 0 }, requirements: [questReq("Crystal Mine", 2, s => s.planet.crystalMine)] }`
- QUEST_DEFINITIONS-03: `{ period: 0, id: 3, group: "Tutorial", title: "Upgrade Solar Plant Lv 2", hint: "Power shortages slow the whole colony.", reward: { metal: 350, crystal: 300, deuterium: 0 }, requirements: [questReq("Solar Plant", 2, s => s.planet.solarPlant)] }`
- QUEST_DEFINITIONS-04: `{ period: 0, id: 4, group: "Tutorial", title: "Start deuterium production", hint: "Deuterium fuels fleets and advanced tech.", reward: { metal: 400, crystal: 250, deuterium: 150 }, requirements: [questReq("Deuterium Synthesizer", 1, s => s.planet.deuteriumSynthesizer)] }`
- QUEST_DEFINITIONS-05: `{ period: 0, id: 5, group: "Tutorial", title: "Increase metal capacity", hint: "Storage protects production from hitting the cap.", reward: { metal: 300, crystal: 300, deuterium: 0 }, requirements: [questReq("Metal Storage", 1, s => s.planet.metalStorage)] }`
- QUEST_DEFINITIONS-06: `{ period: 0, id: 6, group: "Tutorial", title: "Build Robotics Factory Lv 1", hint: "Robotics shortens build times.", reward: { metal: 800, crystal: 400, deuterium: 0 }, requirements: [questReq("Robotics Factory", 1, s => s.planet.roboticsFactory)] }`
- QUEST_DEFINITIONS-07: `{ period: 0, id: 7, group: "Tutorial", title: "Build Shipyard Lv 1", hint: "The shipyard opens fleet and defense construction.", reward: { metal: 1000, crystal: 700, deuterium: 100 }, requirements: [questReq("Shipyard", 1, s => s.planet.shipyard)] }`
- QUEST_DEFINITIONS-08: `{ period: 0, id: 8, group: "Tutorial", title: "Build Research Lab Lv 1", hint: "Research unlocks engines, colonies, and combat tech.", reward: { metal: 800, crystal: 900, deuterium: 200 }, requirements: [questReq("Research Lab", 1, s => s.planet.researchLab)] }`
- QUEST_DEFINITIONS-09: `{ period: 0, id: 9, group: "Tutorial", title: "Research Energy Technology", hint: "Energy tech supports deeper industry and shields.", reward: { metal: 600, crystal: 600, deuterium: 200 }, requirements: [questReq("Energy Technology", 1, s => s.research.energyTech)] }`
- QUEST_DEFINITIONS-10: `{ period: 0, id: 10, group: "Tutorial", title: "Research Combustion Drive", hint: "Combustion drive prepares early cargo movement.", reward: { metal: 600, crystal: 300, deuterium: 300 }, requirements: [questReq("Combustion Drive", 1, s => s.research.combustionDrive)] }`
- QUEST_DEFINITIONS-11: `{ period: 0, id: 11, group: "Tutorial", title: "Build your first ship", hint: "Ships turn resources into movement and reach.", reward: { metal: 900, crystal: 600, deuterium: 150 }, requirements: [questReq("Fleet ships", 1, totalQuestShips)] }`
- QUEST_DEFINITIONS-12: `{ period: 0, id: 12, group: "Tutorial", title: "Build a Small Cargo", hint: "Cargo ships let you move resources between planets.", reward: { metal: 1000, crystal: 700, deuterium: 150 }, requirements: [questReq("Small Cargo", 1, s => s.fleet.smallCargo)] }`
- QUEST_DEFINITIONS-13: `{ period: 0, id: 13, group: "Tutorial", title: "Build a Rocket Launcher", hint: "Basic defenses make planets harder to raid.", reward: { metal: 800, crystal: 200, deuterium: 0 }, requirements: [questReq("Rocket Launcher", 1, s => s.planet.rocketLauncher)] }`
- QUEST_DEFINITIONS-14: `{ period: 0, id: 14, group: "Tutorial", title: "Research Computer Technology", hint: "Computer tech expands usable mission slots over time.", reward: { metal: 700, crystal: 700, deuterium: 250 }, requirements: [questReq("Computer Technology", 1, s => s.research.computerTech)] }`
- QUEST_DEFINITIONS-15: `{ period: 0, id: 15, group: "Tutorial", title: "Build an Espionage Probe", hint: "Probes prepare scouting and information play.", reward: { metal: 600, crystal: 500, deuterium: 250 }, requirements: [questReq("Espionage Probe", 1, s => s.fleet.espionageProbe)] }`
- QUEST_DEFINITIONS-16: `{ period: 0, id: 16, group: "Tutorial", title: "Build a Light Laser", hint: "Layer defenses instead of relying on one unit.", reward: { metal: 800, crystal: 500, deuterium: 0 }, requirements: [questReq("Light Laser", 1, s => s.planet.lightLaser)] }`
- QUEST_DEFINITIONS-17: `{ period: 0, id: 17, group: "Tutorial", title: "Research Impulse Drive", hint: "Impulse drive unlocks stronger movement options.", reward: { metal: 1500, crystal: 1500, deuterium: 600 }, requirements: [questReq("Impulse Drive", 1, s => s.research.impulseDrive)] }`
- QUEST_DEFINITIONS-18: `{ period: 0, id: 18, group: "Tutorial", title: "Research Astrophysics", hint: "Astrophysics is the road to expansion.", reward: { metal: 1500, crystal: 1800, deuterium: 700 }, requirements: [questReq("Astrophysics", 1, s => s.research.astrophysics)] }`
- QUEST_DEFINITIONS-19: `{ period: 0, id: 19, group: "Tutorial", title: "Hold five defenses", hint: "A small defense grid is better than an empty planet.", reward: { metal: 1200, crystal: 900, deuterium: 200 }, requirements: [questReq("Defense units", 5, totalQuestDefenses)] }`
- QUEST_DEFINITIONS-20: `{ period: 0, id: 20, group: "Tutorial", title: "Build a Colony Ship", hint: "Complete command training and claim the final tutorial reward.", reward: { metal: 5000, crystal: 5000, deuterium: 2000 }, requirements: [questReq("Colony Ship", 1, s => s.fleet.colonyShip)] }`
- QUEST_DEFINITIONS-21: `{ period: 1, id: 0, group: "Daily", title: "Daily check-in", hint: "Resets daily at 00:00 UTC. Consecutive UTC days increase the bonus, capped at 30 days.", reward: { metal: 500, crystal: 300, deuterium: 100 }, requirements: [], checkIn: true }`
- QUEST_DEFINITIONS-22: `{ period: 1, id: 1, group: "Daily", title: "Metal Mine Lv 3", hint: "Keep basic metal production moving.", reward: { metal: 1000, crystal: 500, deuterium: 100 }, requirements: [questReq("Metal Mine", 3, s => s.planet.metalMine)] }`
- QUEST_DEFINITIONS-23: `{ period: 1, id: 2, group: "Daily", title: "Crystal Mine Lv 3", hint: "Keep crystal production balanced.", reward: { metal: 500, crystal: 1000, deuterium: 100 }, requirements: [questReq("Crystal Mine", 3, s => s.planet.crystalMine)] }`
- QUEST_DEFINITIONS-24: `{ period: 1, id: 3, group: "Daily", title: "Solar Plant Lv 4", hint: "A powered colony is a productive colony.", reward: { metal: 700, crystal: 700, deuterium: 150 }, requirements: [questReq("Solar Plant", 4, s => s.planet.solarPlant)] }`
- QUEST_DEFINITIONS-25: `{ period: 1, id: 4, group: "Daily", title: "Deuterium Synthesizer Lv 2", hint: "Fuel growth without overpaying the player.", reward: { metal: 600, crystal: 500, deuterium: 300 }, requirements: [questReq("Deuterium Synthesizer", 2, s => s.planet.deuteriumSynthesizer)] }`
- QUEST_DEFINITIONS-26: `{ period: 1, id: 5, group: "Daily", title: "Shipyard Lv 2", hint: "Keep fleet construction options open.", reward: { metal: 1200, crystal: 900, deuterium: 250 }, requirements: [questReq("Shipyard", 2, s => s.planet.shipyard)] }`
- QUEST_DEFINITIONS-27: `{ period: 1, id: 6, group: "Daily", title: "Own 3 ships", hint: "Maintain a small operational fleet.", reward: { metal: 1500, crystal: 1000, deuterium: 250 }, requirements: [questReq("Fleet ships", 3, totalQuestShips)] }`
- QUEST_DEFINITIONS-28: `{ period: 1, id: 7, group: "Daily", title: "Own 3 defenses", hint: "Do not leave the planet naked.", reward: { metal: 1200, crystal: 800, deuterium: 150 }, requirements: [questReq("Defense units", 3, totalQuestDefenses)] }`
- QUEST_DEFINITIONS-29: `{ period: 1, id: 8, group: "Daily", title: "Energy Technology Lv 1", hint: "Review your research base each day.", reward: { metal: 800, crystal: 800, deuterium: 250 }, requirements: [questReq("Energy Technology", 1, s => s.research.energyTech)] }`
- QUEST_DEFINITIONS-30: `{ period: 1, id: 9, group: "Daily", title: "Computer Technology Lv 1", hint: "Mission control starts with computer tech.", reward: { metal: 800, crystal: 1000, deuterium: 300 }, requirements: [questReq("Computer Technology", 1, s => s.research.computerTech)] }`
- QUEST_DEFINITIONS-31: `{ period: 2, id: 0, group: "Weekly", title: "Research Lab Lv 2", hint: "Build toward a stronger tech floor.", reward: { metal: 6000, crystal: 7000, deuterium: 2000 }, requirements: [questReq("Research Lab", 2, s => s.planet.researchLab)] }`
- QUEST_DEFINITIONS-32: `{ period: 2, id: 1, group: "Weekly", title: "Shipyard Lv 2", hint: "Keep construction capacity ready.", reward: { metal: 8000, crystal: 5000, deuterium: 1500 }, requirements: [questReq("Shipyard", 2, s => s.planet.shipyard)] }`
- QUEST_DEFINITIONS-33: `{ period: 2, id: 2, group: "Weekly", title: "Own 5 ships", hint: "A small fleet enables transport and response.", reward: { metal: 9000, crystal: 6000, deuterium: 2500 }, requirements: [questReq("Fleet ships", 5, totalQuestShips)] }`
- QUEST_DEFINITIONS-34: `{ period: 2, id: 3, group: "Weekly", title: "Own 5 defenses", hint: "Build a basic defensive shell.", reward: { metal: 8000, crystal: 7000, deuterium: 1500 }, requirements: [questReq("Defense units", 5, totalQuestDefenses)] }`
- QUEST_DEFINITIONS-35: `{ period: 2, id: 4, group: "Weekly", title: "Metal Mine Lv 5", hint: "Upgrade core production over time.", reward: { metal: 10000, crystal: 3000, deuterium: 500 }, requirements: [questReq("Metal Mine", 5, s => s.planet.metalMine)] }`
- QUEST_DEFINITIONS-36: `{ period: 2, id: 5, group: "Weekly", title: "Crystal Mine Lv 5", hint: "Balance metal with crystal growth.", reward: { metal: 4000, crystal: 10000, deuterium: 500 }, requirements: [questReq("Crystal Mine", 5, s => s.planet.crystalMine)] }`
- QUEST_DEFINITIONS-37: `{ period: 2, id: 6, group: "Weekly", title: "Deuterium Synthesizer Lv 4", hint: "Prepare fuel for higher activity.", reward: { metal: 5000, crystal: 4000, deuterium: 3000 }, requirements: [questReq("Deuterium Synthesizer", 4, s => s.planet.deuteriumSynthesizer)] }`
- QUEST_DEFINITIONS-38: `{ period: 2, id: 7, group: "Weekly", title: "Combustion Drive Lv 2", hint: "Improve early fleet movement.", reward: { metal: 5000, crystal: 3000, deuterium: 3000 }, requirements: [questReq("Combustion Drive", 2, s => s.research.combustionDrive)] }`
- QUEST_DEFINITIONS-39: `{ period: 2, id: 8, group: "Weekly", title: "Computer Technology Lv 2", hint: "Make mission management part of progress.", reward: { metal: 4000, crystal: 5000, deuterium: 3000 }, requirements: [questReq("Computer Technology", 2, s => s.research.computerTech)] }`
- QUEST_DEFINITIONS-40: `{ period: 2, id: 9, group: "Weekly", title: "Own 5 Small Cargo", hint: "Cargo capacity supports trading and relocation.", reward: { metal: 9000, crystal: 7000, deuterium: 1500 }, requirements: [questReq("Small Cargo", 5, s => s.fleet.smallCargo)] }`
- QUEST_DEFINITIONS-41: `{ period: 2, id: 10, group: "Weekly", title: "Own 10 Rocket Launchers", hint: "A starter defense wall discourages easy raids.", reward: { metal: 12000, crystal: 3000, deuterium: 500 }, requirements: [questReq("Rocket Launcher", 10, s => s.planet.rocketLauncher)] }`
- QUEST_DEFINITIONS-42: `{ period: 3, id: 0, group: "Monthly", title: "Impulse Drive Lv 1", hint: "Start the midgame engine path.", reward: { metal: 30000, crystal: 25000, deuterium: 12000 }, requirements: [questReq("Impulse Drive", 1, s => s.research.impulseDrive)] }`
- QUEST_DEFINITIONS-43: `{ period: 3, id: 1, group: "Monthly", title: "Astrophysics Lv 1", hint: "Prepare for expansion and colony strategy.", reward: { metal: 25000, crystal: 35000, deuterium: 15000 }, requirements: [questReq("Astrophysics", 1, s => s.research.astrophysics)] }`
- QUEST_DEFINITIONS-44: `{ period: 3, id: 2, group: "Monthly", title: "Own 25 ships", hint: "Hold a meaningful active fleet.", reward: { metal: 45000, crystal: 30000, deuterium: 15000 }, requirements: [questReq("Fleet ships", 25, totalQuestShips)] }`
- QUEST_DEFINITIONS-45: `{ period: 3, id: 3, group: "Monthly", title: "Own 25 defenses", hint: "Build lasting planetary protection.", reward: { metal: 40000, crystal: 35000, deuterium: 12000 }, requirements: [questReq("Defense units", 25, totalQuestDefenses)] }`
- QUEST_DEFINITIONS-46: `{ period: 3, id: 4, group: "Monthly", title: "Metal Mine Lv 10", hint: "Reach a real production milestone.", reward: { metal: 50000, crystal: 15000, deuterium: 3000 }, requirements: [questReq("Metal Mine", 10, s => s.planet.metalMine)] }`
- QUEST_DEFINITIONS-47: `{ period: 3, id: 5, group: "Monthly", title: "Crystal Mine Lv 10", hint: "Sustain research and higher construction.", reward: { metal: 20000, crystal: 50000, deuterium: 3000 }, requirements: [questReq("Crystal Mine", 10, s => s.planet.crystalMine)] }`
- QUEST_DEFINITIONS-48: `{ period: 3, id: 6, group: "Monthly", title: "Solar Plant Lv 12", hint: "Power the late early-game economy.", reward: { metal: 25000, crystal: 25000, deuterium: 5000 }, requirements: [questReq("Solar Plant", 12, s => s.planet.solarPlant)] }`
- QUEST_DEFINITIONS-49: `{ period: 3, id: 7, group: "Monthly", title: "Research Lab Lv 5", hint: "Unlock deeper research trees.", reward: { metal: 30000, crystal: 40000, deuterium: 15000 }, requirements: [questReq("Research Lab", 5, s => s.planet.researchLab)] }`
- QUEST_DEFINITIONS-50: `{ period: 3, id: 8, group: "Monthly", title: "Shipyard Lv 5", hint: "Prepare heavier fleet production.", reward: { metal: 45000, crystal: 35000, deuterium: 10000 }, requirements: [questReq("Shipyard", 5, s => s.planet.shipyard)] }`
- QUEST_DEFINITIONS-51: `{ period: 3, id: 9, group: "Monthly", title: "Computer Technology Lv 5", hint: "Improve command capacity.", reward: { metal: 30000, crystal: 35000, deuterium: 20000 }, requirements: [questReq("Computer Technology", 5, s => s.research.computerTech)] }`
- QUEST_DEFINITIONS-52: `{ period: 3, id: 10, group: "Monthly", title: "Own a Colony Ship", hint: "Expansion should come from real preparation.", reward: { metal: 60000, crystal: 50000, deuterium: 20000 }, requirements: [questReq("Colony Ship", 1, s => s.fleet.colonyShip)] }`
- QUEST_DEFINITIONS-53: `{ period: 3, id: 11, group: "Monthly", title: "Own a Battleship", hint: "A heavy fleet milestone for committed players.", reward: { metal: 70000, crystal: 50000, deuterium: 25000 }, requirements: [questReq("Battleship", 1, s => s.fleet.battleship)] }`

### DAILY_ROTATING_QUESTS_UI (25)

- DAILY_ROTATING_QUESTS_UI-00: `qCatalog("Metal Mine Lv 3", "Keep basic metal production moving.", "Metal Mine", 3, s => s.planet.metalMine, { metal: 1000, crystal: 500, deuterium: 100 })`
- DAILY_ROTATING_QUESTS_UI-01: `qCatalog("Crystal Mine Lv 3", "Keep crystal production balanced.", "Crystal Mine", 3, s => s.planet.crystalMine, { metal: 500, crystal: 1000, deuterium: 100 })`
- DAILY_ROTATING_QUESTS_UI-02: `qCatalog("Solar Plant Lv 4", "A powered colony is a productive colony.", "Solar Plant", 4, s => s.planet.solarPlant, { metal: 700, crystal: 700, deuterium: 150 })`
- DAILY_ROTATING_QUESTS_UI-03: `qCatalog("Deuterium Synthesizer Lv 2", "Fuel growth without overpaying the player.", "Deuterium Synthesizer", 2, s => s.planet.deuteriumSynthesizer, { metal: 600, crystal: 500, deuterium: 300 })`
- DAILY_ROTATING_QUESTS_UI-04: `qCatalog("Robotics Factory Lv 1", "Keep construction efficiency online.", "Robotics Factory", 1, s => s.planet.roboticsFactory, { metal: 800, crystal: 650, deuterium: 150 })`
- DAILY_ROTATING_QUESTS_UI-05: `qCatalog("Shipyard Lv 2", "Keep fleet construction options open.", "Shipyard", 2, s => s.planet.shipyard, { metal: 1200, crystal: 900, deuterium: 250 })`
- DAILY_ROTATING_QUESTS_UI-06: `qCatalog("Research Lab Lv 1", "Keep the lab ready for unlocks.", "Research Lab", 1, s => s.planet.researchLab, { metal: 900, crystal: 900, deuterium: 250 })`
- DAILY_ROTATING_QUESTS_UI-07: `qCatalog("Energy Technology Lv 1", "Review your research base each day.", "Energy Technology", 1, s => s.research.energyTech, { metal: 800, crystal: 800, deuterium: 250 })`
- DAILY_ROTATING_QUESTS_UI-08: `qCatalog("Computer Technology Lv 1", "Mission control starts with computer tech.", "Computer Technology", 1, s => s.research.computerTech, { metal: 800, crystal: 1000, deuterium: 300 })`
- DAILY_ROTATING_QUESTS_UI-09: `qCatalog("Own 3 Ships", "Maintain a small operational fleet.", "Fleet ships", 3, totalQuestShips, { metal: 1500, crystal: 1000, deuterium: 250 })`
- DAILY_ROTATING_QUESTS_UI-10: `qCatalog("Own 3 Defenses", "Do not leave the planet naked.", "Defense units", 3, totalQuestDefenses, { metal: 1200, crystal: 800, deuterium: 150 })`
- DAILY_ROTATING_QUESTS_UI-11: `qCatalog("Own 2 Small Cargo", "Cargo capacity keeps logistics flexible.", "Small Cargo", 2, s => s.fleet.smallCargo, { metal: 1000, crystal: 700, deuterium: 200 })`
- DAILY_ROTATING_QUESTS_UI-12: `qCatalog("Own a Large Cargo", "Move a heavier payload when the route needs it.", "Large Cargo", 1, s => s.fleet.largeCargo, { metal: 1200, crystal: 900, deuterium: 250 })`
- DAILY_ROTATING_QUESTS_UI-13: `qCatalog("Own 2 Light Fighters", "Keep a starter combat screen.", "Light Fighter", 2, s => s.fleet.lightFighter, { metal: 1100, crystal: 700, deuterium: 200 })`
- DAILY_ROTATING_QUESTS_UI-14: `qCatalog("Own 3 Rocket Launchers", "Maintain a basic defense line.", "Rocket Launcher", 3, s => s.planet.rocketLauncher, { metal: 900, crystal: 500, deuterium: 100 })`
- DAILY_ROTATING_QUESTS_UI-15: `qCatalog("Own a Light Laser", "Layer defenses instead of relying on one unit.", "Light Laser", 1, s => s.planet.lightLaser, { metal: 1000, crystal: 700, deuterium: 100 })`
- DAILY_ROTATING_QUESTS_UI-16: `qCatalog("Own an Espionage Probe", "Information starts with probes.", "Espionage Probe", 1, s => s.fleet.espionageProbe, { metal: 700, crystal: 700, deuterium: 250 })`
- DAILY_ROTATING_QUESTS_UI-17: `qCatalog("Combustion Drive Lv 1", "Prepare early fleet movement.", "Combustion Drive", 1, s => s.research.combustionDrive, { metal: 900, crystal: 600, deuterium: 300 })`
- DAILY_ROTATING_QUESTS_UI-18: `qCatalog("Metal Storage Lv 1", "Protect production from caps.", "Metal Storage", 1, s => s.planet.metalStorage, { metal: 700, crystal: 500, deuterium: 100 })`
- DAILY_ROTATING_QUESTS_UI-19: `qCatalog("Crystal Storage Lv 1", "Protect crystal from caps.", "Crystal Storage", 1, s => s.planet.crystalStorage, { metal: 500, crystal: 700, deuterium: 100 })`
- DAILY_ROTATING_QUESTS_UI-20: `qCatalog("Deuterium Tank Lv 1", "Protect fuel from caps.", "Deuterium Tank", 1, s => s.planet.deuteriumTank, { metal: 600, crystal: 500, deuterium: 250 })`
- DAILY_ROTATING_QUESTS_UI-21: `qCatalog("Own a Colony Ship", "Keep expansion capacity ready.", "Colony Ship", 1, s => s.fleet.colonyShip, { metal: 1400, crystal: 1200, deuterium: 400 })`
- DAILY_ROTATING_QUESTS_UI-22: `qCatalog("Own a Heavy Fighter", "Begin heavier combat production.", "Heavy Fighter", 1, s => s.fleet.heavyFighter, { metal: 1400, crystal: 1000, deuterium: 350 })`
- DAILY_ROTATING_QUESTS_UI-23: `qCatalog("Shielding Technology Lv 1", "Start defensive research.", "Shielding Technology", 1, s => s.research.shieldingTechnology, { metal: 900, crystal: 1100, deuterium: 250 })`
- DAILY_ROTATING_QUESTS_UI-24: `qCatalog("Armor Technology Lv 1", "Improve fleet durability.", "Armor Technology", 1, s => s.research.armorTechnology, { metal: 1100, crystal: 800, deuterium: 250 })`

### WEEKLY_ROTATING_QUESTS_UI (23)

- WEEKLY_ROTATING_QUESTS_UI-00: `qCatalog("Research Lab Lv 2", "Build toward a stronger tech floor.", "Research Lab", 2, s => s.planet.researchLab, { metal: 6000, crystal: 7000, deuterium: 2000 })`
- WEEKLY_ROTATING_QUESTS_UI-01: `qCatalog("Shipyard Lv 2", "Keep construction capacity ready.", "Shipyard", 2, s => s.planet.shipyard, { metal: 8000, crystal: 5000, deuterium: 1500 })`
- WEEKLY_ROTATING_QUESTS_UI-02: `qCatalog("Own 5 Ships", "A small fleet enables transport and response.", "Fleet ships", 5, totalQuestShips, { metal: 9000, crystal: 6000, deuterium: 2500 })`
- WEEKLY_ROTATING_QUESTS_UI-03: `qCatalog("Own 5 Defenses", "Build a basic defensive shell.", "Defense units", 5, totalQuestDefenses, { metal: 8000, crystal: 7000, deuterium: 1500 })`
- WEEKLY_ROTATING_QUESTS_UI-04: `qCatalog("Metal Mine Lv 5", "Upgrade core production over time.", "Metal Mine", 5, s => s.planet.metalMine, { metal: 10000, crystal: 3000, deuterium: 500 })`
- WEEKLY_ROTATING_QUESTS_UI-05: `qCatalog("Crystal Mine Lv 5", "Balance metal with crystal growth.", "Crystal Mine", 5, s => s.planet.crystalMine, { metal: 4000, crystal: 10000, deuterium: 500 })`
- WEEKLY_ROTATING_QUESTS_UI-06: `qCatalog("Deuterium Synthesizer Lv 4", "Prepare fuel for higher activity.", "Deuterium Synthesizer", 4, s => s.planet.deuteriumSynthesizer, { metal: 5000, crystal: 4000, deuterium: 3000 })`
- WEEKLY_ROTATING_QUESTS_UI-07: `qCatalog("Combustion Drive Lv 2", "Improve early fleet movement.", "Combustion Drive", 2, s => s.research.combustionDrive, { metal: 5000, crystal: 3000, deuterium: 3000 })`
- WEEKLY_ROTATING_QUESTS_UI-08: `qCatalog("Computer Technology Lv 2", "Make mission management part of progress.", "Computer Technology", 2, s => s.research.computerTech, { metal: 4000, crystal: 5000, deuterium: 3000 })`
- WEEKLY_ROTATING_QUESTS_UI-09: `qCatalog("Own 5 Small Cargo", "Cargo capacity supports trading and relocation.", "Small Cargo", 5, s => s.fleet.smallCargo, { metal: 9000, crystal: 7000, deuterium: 1500 })`
- WEEKLY_ROTATING_QUESTS_UI-10: `qCatalog("Own 10 Rocket Launchers", "A starter defense wall discourages easy raids.", "Rocket Launcher", 10, s => s.planet.rocketLauncher, { metal: 12000, crystal: 3000, deuterium: 500 })`
- WEEKLY_ROTATING_QUESTS_UI-11: `qCatalog("Own a Large Cargo", "Move larger payloads between planets.", "Large Cargo", 1, s => s.fleet.largeCargo, { metal: 8000, crystal: 8000, deuterium: 2000 })`
- WEEKLY_ROTATING_QUESTS_UI-12: `qCatalog("Own 5 Light Fighters", "Maintain a basic response wing.", "Light Fighter", 5, s => s.fleet.lightFighter, { metal: 8000, crystal: 5000, deuterium: 1500 })`
- WEEKLY_ROTATING_QUESTS_UI-13: `qCatalog("Own 2 Heavy Fighters", "Add stronger ships to the roster.", "Heavy Fighter", 2, s => s.fleet.heavyFighter, { metal: 9000, crystal: 8000, deuterium: 3000 })`
- WEEKLY_ROTATING_QUESTS_UI-14: `qCatalog("Own a Recycler", "Prepare debris recovery.", "Recycler", 1, s => s.fleet.recycler, { metal: 8000, crystal: 7000, deuterium: 2500 })`
- WEEKLY_ROTATING_QUESTS_UI-15: `qCatalog("Own 5 Probes", "Keep scouting capacity available.", "Espionage Probe", 5, s => s.fleet.espionageProbe, { metal: 5000, crystal: 6000, deuterium: 2000 })`
- WEEKLY_ROTATING_QUESTS_UI-16: `qCatalog("Solar Plant Lv 8", "Support higher production.", "Solar Plant", 8, s => s.planet.solarPlant, { metal: 8000, crystal: 5000, deuterium: 1000 })`
- WEEKLY_ROTATING_QUESTS_UI-17: `qCatalog("Robotics Factory Lv 3", "Improve build cadence.", "Robotics Factory", 3, s => s.planet.roboticsFactory, { metal: 8000, crystal: 6000, deuterium: 1500 })`
- WEEKLY_ROTATING_QUESTS_UI-18: `qCatalog("Energy Technology Lv 2", "Push energy science forward.", "Energy Technology", 2, s => s.research.energyTech, { metal: 6000, crystal: 7000, deuterium: 2500 })`
- WEEKLY_ROTATING_QUESTS_UI-19: `qCatalog("Weapons Technology Lv 1", "Start combat research.", "Weapons Technology", 1, s => s.research.weaponsTechnology, { metal: 8000, crystal: 5000, deuterium: 2000 })`
- WEEKLY_ROTATING_QUESTS_UI-20: `qCatalog("Shielding Technology Lv 1", "Improve defensive strength.", "Shielding Technology", 1, s => s.research.shieldingTechnology, { metal: 7000, crystal: 8000, deuterium: 2000 })`
- WEEKLY_ROTATING_QUESTS_UI-21: `qCatalog("Armor Technology Lv 1", "Improve ship durability.", "Armor Technology", 1, s => s.research.armorTechnology, { metal: 8000, crystal: 7000, deuterium: 2000 })`
- WEEKLY_ROTATING_QUESTS_UI-22: `qCatalog("Own 5 Light Lasers", "Layer early defenses.", "Light Laser", 5, s => s.planet.lightLaser, { metal: 7000, crystal: 5000, deuterium: 1000 })`

### MONTHLY_ROTATING_QUESTS_UI (23)

- MONTHLY_ROTATING_QUESTS_UI-00: `qCatalog("Impulse Drive Lv 1", "Start the midgame engine path.", "Impulse Drive", 1, s => s.research.impulseDrive, { metal: 30000, crystal: 25000, deuterium: 12000 })`
- MONTHLY_ROTATING_QUESTS_UI-01: `qCatalog("Astrophysics Lv 1", "Prepare for expansion and colony strategy.", "Astrophysics", 1, s => s.research.astrophysics, { metal: 25000, crystal: 35000, deuterium: 15000 })`
- MONTHLY_ROTATING_QUESTS_UI-02: `qCatalog("Own 25 Ships", "Hold a meaningful active fleet.", "Fleet ships", 25, totalQuestShips, { metal: 45000, crystal: 30000, deuterium: 15000 })`
- MONTHLY_ROTATING_QUESTS_UI-03: `qCatalog("Own 25 Defenses", "Build lasting planetary protection.", "Defense units", 25, totalQuestDefenses, { metal: 40000, crystal: 35000, deuterium: 12000 })`
- MONTHLY_ROTATING_QUESTS_UI-04: `qCatalog("Metal Mine Lv 10", "Reach a real production milestone.", "Metal Mine", 10, s => s.planet.metalMine, { metal: 50000, crystal: 15000, deuterium: 3000 })`
- MONTHLY_ROTATING_QUESTS_UI-05: `qCatalog("Crystal Mine Lv 10", "Sustain research and higher construction.", "Crystal Mine", 10, s => s.planet.crystalMine, { metal: 20000, crystal: 50000, deuterium: 3000 })`
- MONTHLY_ROTATING_QUESTS_UI-06: `qCatalog("Solar Plant Lv 12", "Power the late early-game economy.", "Solar Plant", 12, s => s.planet.solarPlant, { metal: 25000, crystal: 25000, deuterium: 5000 })`
- MONTHLY_ROTATING_QUESTS_UI-07: `qCatalog("Research Lab Lv 5", "Unlock deeper research trees.", "Research Lab", 5, s => s.planet.researchLab, { metal: 30000, crystal: 40000, deuterium: 15000 })`
- MONTHLY_ROTATING_QUESTS_UI-08: `qCatalog("Shipyard Lv 5", "Prepare heavier fleet production.", "Shipyard", 5, s => s.planet.shipyard, { metal: 45000, crystal: 35000, deuterium: 10000 })`
- MONTHLY_ROTATING_QUESTS_UI-09: `qCatalog("Computer Technology Lv 5", "Improve command capacity.", "Computer Technology", 5, s => s.research.computerTech, { metal: 30000, crystal: 35000, deuterium: 20000 })`
- MONTHLY_ROTATING_QUESTS_UI-10: `qCatalog("Own a Colony Ship", "Expansion should come from real preparation.", "Colony Ship", 1, s => s.fleet.colonyShip, { metal: 60000, crystal: 50000, deuterium: 20000 })`
- MONTHLY_ROTATING_QUESTS_UI-11: `qCatalog("Own a Battleship", "A heavy fleet milestone for committed players.", "Battleship", 1, s => s.fleet.battleship, { metal: 70000, crystal: 50000, deuterium: 25000 })`
- MONTHLY_ROTATING_QUESTS_UI-12: `qCatalog("Own 3 Cruisers", "Build a mid-tier strike group.", "Cruiser", 3, s => s.fleet.cruiser, { metal: 55000, crystal: 45000, deuterium: 18000 })`
- MONTHLY_ROTATING_QUESTS_UI-13: `qCatalog("Own 5 Recyclers", "Prepare serious debris recovery.", "Recycler", 5, s => s.fleet.recycler, { metal: 45000, crystal: 35000, deuterium: 18000 })`
- MONTHLY_ROTATING_QUESTS_UI-14: `qCatalog("Own 10 Heavy Lasers", "Strengthen defensive depth.", "Heavy Laser", 10, s => s.planet.heavyLaser, { metal: 35000, crystal: 30000, deuterium: 8000 })`
- MONTHLY_ROTATING_QUESTS_UI-15: `qCatalog("Own 3 Gauss Cannons", "Add armor-piercing defense.", "Gauss Cannon", 3, s => s.planet.gaussCannon, { metal: 45000, crystal: 35000, deuterium: 10000 })`
- MONTHLY_ROTATING_QUESTS_UI-16: `qCatalog("Own 3 Ion Cannons", "Add shield-focused defense.", "Ion Cannon", 3, s => s.planet.ionCannon, { metal: 35000, crystal: 45000, deuterium: 12000 })`
- MONTHLY_ROTATING_QUESTS_UI-17: `qCatalog("Own a Plasma Turret", "Reach a high-end defense milestone.", "Plasma Turret", 1, s => s.planet.plasmaTurret, { metal: 60000, crystal: 45000, deuterium: 18000 })`
- MONTHLY_ROTATING_QUESTS_UI-18: `qCatalog("Fusion Reactor Lv 3", "Stabilize deeper energy needs.", "Fusion Reactor", 3, s => s.planet.fusionReactor, { metal: 35000, crystal: 35000, deuterium: 16000 })`
- MONTHLY_ROTATING_QUESTS_UI-19: `qCatalog("Nanite Factory Lv 1", "Unlock serious industrial acceleration.", "Nanite Factory", 1, s => s.planet.naniteFactory, { metal: 80000, crystal: 60000, deuterium: 20000 })`
- MONTHLY_ROTATING_QUESTS_UI-20: `qCatalog("Hyperspace Drive Lv 1", "Start the advanced engine path.", "Hyperspace Drive", 1, s => s.research.hyperspaceDrive, { metal: 50000, crystal: 55000, deuterium: 25000 })`
- MONTHLY_ROTATING_QUESTS_UI-21: `qCatalog("IGR Network Lv 1", "Connect research capacity.", "Intergalactic Research Network", 1, s => s.research.igrNetwork, { metal: 45000, crystal: 60000, deuterium: 20000 })`
- MONTHLY_ROTATING_QUESTS_UI-22: `qCatalog("Weapons Technology Lv 3", "Build a stronger combat foundation.", "Weapons Technology", 3, s => s.research.weaponsTechnology, { metal: 55000, crystal: 45000, deuterium: 20000 })`

### ALLIANCE_BUILDINGS (4)

- ALLIANCE_BUILDINGS-00: `{ id: 0, key: "logisticsHub", title: "Logistics Hub", hint: "Shared shipping and contribution capacity." }`
- ALLIANCE_BUILDINGS-01: `{ id: 1, key: "researchGrid", title: "Research Grid", hint: "Shared scientific coordination." }`
- ALLIANCE_BUILDINGS-02: `{ id: 2, key: "defenseCoordination", title: "Defense Coordination", hint: "Alliance-wide defensive organization." }`
- ALLIANCE_BUILDINGS-03: `{ id: 3, key: "tradeNetwork", title: "Trade Network", hint: "Shared market and treasury infrastructure." }`

## Server Endpoints

- api/antimatter-faucet.js
- api/crypto-ufos-image.js
- api/crypto-ufos.js
- api/futarchy-finalizer.js
- api/lazor-paymaster.js
- api/solana-rpc.js
