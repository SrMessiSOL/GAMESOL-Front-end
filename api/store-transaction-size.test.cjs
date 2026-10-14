const test = require('node:test');
const assert = require('node:assert/strict');
const { Keypair, PublicKey, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const { _test } = require('./lazor-paymaster.js');
const { storeTransactionFixture } = require('../server/store-transaction-fixture.cjs');

test('real passkey store layouts fit after compression with and without rent sponsorship', async () => {
  for (const rent of [false, true]) {
    const f = await storeTransactionFixture(rent);
    assert.ok(f.transaction.serialize().length > 1232);
    assert.ok(f.compressed.serialize().length <= 1232);
    const policy = _test.assertTransactionPolicy(f.compressed, { publicKey: f.payer }, [f.table]);
    assert.equal(policy.approvedRentBundle, rent);
    assert.equal(policy.maximumDebit, rent ? 50000000 : 250000);
  }
});

test('compressed store route rejects altered bundles and noncanonical accounts', async () => {
  for (const mutate of [
    inner => { inner.at(-1).data[8] = 0; },
    inner => { inner.at(-1).data[9] = 255; },
    inner => { inner.at(-1).data = Buffer.concat([inner.at(-1).data, Buffer.from([0])]); },
    inner => { inner.at(-1).keys.pop(); },
    ...[1, 2, 4, 7, 8, 9, 10].map(index => inner => { inner.at(-1).keys[index].pubkey = Keypair.generate().publicKey; }),
    inner => { inner.at(-1).programId = Keypair.generate().publicKey; },
    inner => { inner.unshift(inner.at(-1)); },
    inner => { inner[0].keys[1].pubkey = Keypair.generate().publicKey; },
  ]) {
    const f = await storeTransactionFixture(true, mutate);
    assert.throws(() => _test.assertTransactionPolicy(f.compressed, { publicKey: f.payer }, [f.table]));
  }
});

test('compression cannot authorize missing passkeys, extra executes or reordered verification', async () => {
  for (const change of [
    instructions => instructions.slice(1),
    instructions => [...instructions, instructions.at(-1)],
    instructions => [...instructions].reverse(),
  ]) {
    const f = await storeTransactionFixture(false);
    const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: f.payer,
      recentBlockhash: PublicKey.default.toBase58(), instructions: change(f.wrapped) }).compileToV0Message([f.table]));
    assert.throws(() => _test.assertTransactionPolicy(transaction, { publicKey: f.payer }, [f.table]));
  }
});
