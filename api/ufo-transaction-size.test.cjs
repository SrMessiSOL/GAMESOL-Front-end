const test = require('node:test');
const assert = require('node:assert/strict');
const { AddressLookupTableAccount, Keypair } = require('@solana/web3.js');
const { _test } = require('./lazor-paymaster.js');
const { ufoTransactionFixture } = require('../server/ufo-transaction-fixture.cjs');

test('real Lazor session launch exceeds the packet limit without compression and fits with the pinned table', async () => {
  const f = await ufoTransactionFixture();
  assert.equal(f.plain.serialize().length, 1335);
  assert.equal(f.compressed.serialize().length, 1152);
  const policy = _test.assertTransactionPolicy(f.compressed, f.sponsor, [f.table]);
  assert.equal(policy.approvedRentBundle, true);
  assert.equal(policy.maximumDebit, 50000000);
  const keys = _test.resolvedTransactionKeys(f.compressed.message, [f.table]);
  const outer = f.compressed.message.compiledInstructions[1];
  const inner = _test.parseCompactInstructions(f.compressed.message, outer, keys);
  assert.equal(inner.length, 2);
  assert.equal(inner[1].accounts.length, 8);
  assert.equal(inner[1].programId.toBase58(), 'J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq');
});

test('advance and claim fit with and without protocol fees and keep routine debit limits', async () => {
  for (const action of ['advance', 'claim']) for (const fees of [false, true]) {
    const f = await ufoTransactionFixture(action, fees);
    assert.ok(f.compressed.serialize().length <= 1232);
    assert.equal(_test.assertTransactionPolicy(f.compressed, f.sponsor, [f.table]).maximumDebit, 250000);
  }
});

test('sponsor rejects unverified, mutable, deactivated, altered and malformed tables', async () => {
  const f = await ufoTransactionFixture();
  assert.throws(() => _test.assertTransactionPolicy(f.compressed, f.sponsor));
  for (const change of [
    t => { t.key = Keypair.generate().publicKey; },
    t => { t.state.authority = Keypair.generate().publicKey; },
    t => { t.state.deactivationSlot = 1n; },
    t => { t.state.addresses[0] = Keypair.generate().publicKey; },
    t => { t.state.addresses.pop(); },
  ]) {
    const table = new AddressLookupTableAccount({ key: f.table.key, state: { ...f.table.state, addresses: [...f.table.state.addresses] } });
    change(table);
    assert.throws(() => _test.assertTransactionPolicy(f.compressed, f.sponsor, [table]));
  }
  for (const index of [255, f.compressed.message.addressTableLookups[0].writableIndexes[0]]) {
    const malformed = await ufoTransactionFixture();
    malformed.compressed.message.addressTableLookups[0].readonlyIndexes.push(index);
    assert.throws(() => _test.assertTransactionPolicy(malformed.compressed, malformed.sponsor, [malformed.table]));
  }
});

test('address tables cannot sponsor commands without the paired UFO proof', async () => {
  const f = await ufoTransactionFixture();
  f.compressed.message.compiledInstructions.shift();
  assert.throws(() => _test.assertTransactionPolicy(f.compressed, f.sponsor, [f.table]), /restricted/);
});

test('simulation accounts for loaded writable rent and fee accounts rather than just static keys', async () => {
  const f = await ufoTransactionFixture();
  const keys = _test.resolvedTransactionKeys(f.compressed.message, [f.table]);
  const writable = keys.filter((_, index) => f.compressed.message.isAccountWritable(index));
  assert.ok(writable.some(key => !f.compressed.message.staticAccountKeys.some(staticKey => staticKey.equals(key))));
  let observed;
  const rpc = {
    getMultipleAccountsInfo: async received => { assert.deepEqual(received, writable); return received.map(key => ({ lamports: key.equals(f.sponsor.publicKey) ? 1000000 : 100 })); },
    simulateTransaction: async (_, options) => {
      observed = options;
      return { value: { err: null, accounts: writable.map(key => ({ lamports: key.equals(f.sponsor.publicKey) ? 995000 : 100, owner: '11111111111111111111111111111111' })) } };
    },
  };
  await _test.simulateAndMeasure(rpc, f.compressed, f.sponsor, { maximumDebit: 250000, approvedRentBundle: false }, [f.table]);
  assert.deepEqual(observed.accounts.addresses, writable.map(key => key.toBase58()));
  assert.equal(observed.sigVerify, true);
  await assert.rejects(_test.simulateAndMeasure(rpc, f.compressed, f.sponsor, { maximumDebit: 4000, approvedRentBundle: false }, [f.table]), /limit/);
});

test('table resolution verifies the on-chain owner before trusting table contents', async () => {
  const f = await ufoTransactionFixture();
  await assert.rejects(_test.fetchTransactionTables({ getAccountInfo: async () => ({ owner: Keypair.generate().publicKey }) }, f.compressed.message), /unavailable/);
});

test('live quoted UFO rent passes accounting while the obsolete overfunded estimate remains rejected', async () => {
  const f = await ufoTransactionFixture();
  const keys = _test.resolvedTransactionKeys(f.compressed.message, [f.table]);
  const writable = keys.filter((_, index) => f.compressed.message.isAccountWritable(index));
  const start = f.inner[f.inner.length - 1];
  const rents = new Map(start.keys.slice(3, 6).map((key, index) => [key.pubkey.toBase58(), index === 0 ? 5867400 : 731520]));
  let debit = 7330440 + 5000;
  const rpc = {
    getMultipleAccountsInfo: async () => writable.map(key => key.equals(f.sponsor.publicKey) ? { lamports: 1000000000 } : null),
    simulateTransaction: async () => ({ value: { err: null, accounts: writable.map(key => ({ lamports: key.equals(f.sponsor.publicKey) ? 1000000000 - debit : rents.get(key.toBase58()) || 0, owner: rents.has(key.toBase58()) ? 'J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq' : '11111111111111111111111111111111' })) } }),
  };
  const policy = _test.assertTransactionPolicy(f.compressed, f.sponsor, [f.table]);
  await _test.simulateAndMeasure(rpc, f.compressed, f.sponsor, policy, [f.table]);
  debit = 10043280 + 5000;
  await assert.rejects(_test.simulateAndMeasure(rpc, f.compressed, f.sponsor, policy, [f.table]), /must be consumed/);
});
