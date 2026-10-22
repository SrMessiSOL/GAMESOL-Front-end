# Colony Resolution Slot Encoding

User report: accelerated colony ready in mission slot 2, but Resolve colonize
reports MissionInFlight / Nothing was submitted.

## Root Cause

InitializeColonyParams contains twelve transferable fleet counts plus
solar_satellite, followed by the separate u8 mission slot argument. The browser
encoder additionally wrote a zero u32 colony_ship field. The program consumed
that zero as solar_satellite and read the following zero as slot 0, regardless of
the selected slot appended four bytes later. Slot 0 was still travelling while
slot 1 had been accelerated and was ready. This was not a failed acceleration.

Removed only the extra colony_ship write from encodeColonyArgs. The program
consumes the Colony Ship from the stored mission; it never accepted this field.
No program, account layout, timing rule, authority or AM price changes.

## Verification

- Regression calls the actual resolveColonize builder for slots 0 and 1, decodes
  timestamps, name, coordinates, cargo, all thirteen fleet fields and trailing
  slot, requiring no extra bytes. The prior encoding fails this byte-layout test.
- Read-only devnet simulation uses original player's existing Homeworld mission
  to 9:583:3. Old bytes reproduce MissionInFlight (6033); corrected bytes succeed
  and use 178,760 compute units including test-only funding and compute budget.
- Simulation uses an unsigned transaction with signature verification disabled;
  its temporary rent transfer exists only inside simulation. No keys loaded,
  transaction sent, account created or funds spent.
- [Simulation evidence](colony-slot-diagnostic-2026-10-22.json).
- All 71 agent/API tests pass; TypeScript and the production frontend build pass.

Published fix e75d535 to GitHub and Vercel production release
https://frontend-c3nauhy85-srmessisols-projects.vercel.app. The public
https://chained-universe.vercel.app alias was explicitly updated; public/release
HTML match verified. Before the alias update, the main URL still served old code.

Clicked Resolve arrival once after refreshing the public game. The original
account's Quick Play/Lazor transaction finalized successfully at slot 513748629:
49E3ZXUC3v8j9ayo4Adppm1Z7CsSaNxsvX967unMtz9dPSdxeFWcLmXqRstBC9HY3PeS7KrVf7bGQkRpw995B8rg.
Colony 9:583:3 exists at 5sPw5GQ523UrHrQVQrSvFg8pUSisMQwD5Jpp7SjhTLGC,
owned by G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r. Source slot 2 is
empty, UI shows 1 / 2 free slots, and slot 1 to 6:35:3 is unchanged. Receipt
confirms no extra AM burn or relaunch. No USDC purchase or program upgrade.
[Live chain evidence](colony-slot-live-resolution-2026-10-22.json).
Automation remains paused.
