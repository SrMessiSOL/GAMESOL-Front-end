# Infrastructure continuation: cargo return and funding

All actions in this report are Solana devnet only.

## Cargo return complete

Return acceleration finalized:
`2GbowS4HaDFybAAnTqvupDZyEPQhwpnSqTQUJqmJLiv11sJLihNJTZ8hecpKmmF4s5Y88xtC9pmtuQTGS1is78bm`.
Return resolution finalized:
`2FpfQHcbvt15LtBBKRBN5fHWVpqx5kSf5DXVitcNuJZD5A38e3BNW5pLJXLjaFkF161onMkTg9uZdNfdtcwaLVmR`.
Independent finalized assertions verified Homeworld smallCargo = 1,
activeMissions = 0, every mission entry missionType = 0. UI: 1/1 slots free.

## Resource funding

Weekly Fuel Stockpile, 6,000 metal + 5,000 deuterium, finalized:
`3yYvKDsnm5EXyxK6DVkq8AkjiQdNGGz5a9L41V1vsYwi7hvKjHndUWEmqt2gc4k91Hzs5SDWBiq8AA1PMUSucFkx`.
Treasury became 13,000 metal / 13,000 crystal / 8,000 deuterium / 50 AM.
Alliance XP 1,832 -> 2,316 (+484), consistent with Hub level 1:
(450 + floor(11,000/1,000)) + floor(461 * 5%) = 484.

## Weekly AM compression

The daily 100-AM compression path now also accepts the exact weekly catalog
deposit: period 2, mission 3, 1,000 AM, zero game-resource amounts. No arbitrary
amounts, monthly missions, extra commands, recipient changes, or additional
authority are allowed. Existing frozen table, passkey checks and sponsor
debit/simulation rules are unchanged. Monthly deposit remains excluded.

SDK packet fixtures: 1,015 bytes public origin; 1,038 longer Preview origin.
Full regression suite: 219 passed, zero failures.

The user authorized test funds for Research Grid, Defense Coordination and Trade
Network upgrades and bonus verification. Weekly AM funding and these upgrades
remain pending, not certified by the above packet or unit tests.

Actual backend effects to verify:
- Research Grid: 5% alliance infrastructure upgrade XP per level.
- Defense Coordination: 1.5% infrastructure deuterium cost discount per level.
- Trade Network: 1% infrastructure metal, crystal and AM cost discount per level.
These are not currently personal research speed, combat defense, or marketplace
fee bonuses. An additional upgrade may be needed to observe an activated discount.
