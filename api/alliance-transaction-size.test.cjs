const test = require('node:test');
const assert = require('node:assert/strict');
const { Keypair, PublicKey, TransactionMessage, VersionedTransaction, AddressLookupTableAccount } = require('@solana/web3.js');
const { _test } = require('./lazor-paymaster.js');
const { allianceTransactionFixture } = require('../server/alliance-transaction-fixture.cjs');
const { storeTransactionFixture } = require('../server/store-transaction-fixture.cjs');

test('alliance owner passkey packets fit with and without sponsored rent', async () => {
  for (const rent of [false, true]) {
    const f = await allianceTransactionFixture(rent);
    assert.ok(f.oldCompressed.serialize().length > 1232);
    assert.ok(f.compressed.serialize().length <= 1232);
    const policy = _test.assertTransactionPolicy(f.compressed, { publicKey: f.payer }, [f.table]);
    assert.equal(policy.approvedRentBundle, rent);
    assert.equal(policy.maximumDebit, rent ? 50000000 : 250000);
  }
});

test('compressed alliance creation rejects substituted accounts, payloads and extra commands', async () => {
  const mutations = [
    ...Array.from({ length: 15 }, (_, index) => inner => { inner.at(-1).keys[index].pubkey = Keypair.generate().publicKey; }),
    inner => { inner.at(-1).data = Buffer.concat([inner.at(-1).data, Buffer.from([0])]); },
    inner => { inner.at(-1).data.writeUInt32LE(0xffffffff, 8); },
    inner => { inner.at(-1).data[0] ^= 1; },
    inner => { inner.at(-1).keys.pop(); },
    inner => { inner.unshift(inner.at(-1)); },
    inner => { inner[0].keys[1].pubkey = Keypair.generate().publicKey; },
  ];
  for (const mutate of mutations) {
    const f = await allianceTransactionFixture(true, mutate);
    assert.throws(() => _test.assertTransactionPolicy(f.compressed, { publicKey: f.payer }, [f.table]));
  }
});

test('alliance table cannot sponsor missing/reordered passkeys, multiple executes or store purchases', async () => {
  const f = await allianceTransactionFixture();
  for (const instructions of [f.wrapped.slice(1), [...f.wrapped].reverse(), [...f.wrapped, f.wrapped.at(-1)], (await storeTransactionFixture(false)).wrapped]) {
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: f.payer, recentBlockhash: PublicKey.default.toBase58(), instructions }).compileToV0Message([f.table]));
    assert.throws(() => _test.assertTransactionPolicy(tx, { publicKey: f.payer }, [f.table]));
  }
});

test('alliance table rejects mutable, deactivated, altered and substituted lookup contents', async () => {
  const f = await allianceTransactionFixture();
  for (const state of [
    { ...f.table.state, authority: Keypair.generate().publicKey },
    { ...f.table.state, deactivationSlot: 1n },
    { ...f.table.state, addresses: [Keypair.generate().publicKey, ...f.table.state.addresses.slice(1)] },
  ]) assert.throws(() => _test.assertTransactionPolicy(f.compressed, { publicKey: f.payer }, [new AddressLookupTableAccount({ key: f.table.key, state })]));
});
