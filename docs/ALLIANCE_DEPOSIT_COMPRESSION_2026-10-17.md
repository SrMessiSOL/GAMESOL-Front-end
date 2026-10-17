# Alliance daily ANTIMATTER deposit compression

The live 100-test-ANTIMATTER deposit failed before submission at 1,269/1,232 bytes.
The passkey send path selected compression for alliance creation but not deposits.

The client now selects the existing frozen alliance table for exactly one daily
mission 3 deposit of 100,000,000 raw ANTIMATTER, zero game resources, eleven accounts,
and the exact 42-byte instruction payload. Other deposits retain existing behavior.
The sponsor validates fixed config PDAs, membership and treasury PDA derivations,
the ANTIMATTER mint, canonical owner ATA, treasury token recipient and token program.
The program continues to enforce alliance membership, planet ownership, mission
eligibility and token authorization. No authority, signature, simulation, debit
limit or mainnet restriction is relaxed.

Verified before publication:

- 214 frontend/server tests passed, including four new packet/policy/client tests.
- Production TypeScript/Vite build passed.
- SDK fixtures fit at 1,015 bytes on the public origin and 1,038 on a longer Preview origin.
  These are synthetic packet-layout tests, not submitted transactions.
- Changed accounts, amount, payload, period, extra commands, missing/reordered
  passkeys, repeated executes, mutable or altered address tables are rejected.
- Existing table `75BH1eVqgoUm3UK5bW9GSQgQdsE7QV1Jcsw244xsuqPv` verified finalized
  on devnet: correct owner, frozen, active, exact 29 manifest addresses.

No new table or program upgrade is required. Real deposit and Logistics Hub
activation remain pending until the user approves the corrected live transaction.
The user's scope is 100 test ANTIMATTER deposited, 50 consumed from alliance
accounting for Hub level 1, NewAccount's 500-deuterium contribution, and no USDC.
