const test = require('node:test');
const assert = require('node:assert/strict');
const {Keypair, PublicKey, TransactionMessage, VersionedTransaction} = require('@solana/web3.js');
const {_test} = require('./lazor-paymaster.js');
const {planetBuyerFixture} = require('../server/planet-buyer-fixture.cjs');

test('SDK deferred planet purchases fit public and long Preview origins including ATA setup', async () => {
  for (const origin of ['https://chained-universe.vercel.app', 'https://frontend-5qbez2oeb-srmessisols-projects.vercel.app']) {
    for (const setup of [false, true]) {
      const f = await planetBuyerFixture(setup, undefined, origin, true);
      console.log(JSON.stringify({origin, setup, bytes: f.compressed.serialize().length}));
      assert(f.compressed.serialize().length <= 1232);
      assert(f.authorizationTransaction.serialize().length <= 1232);
      const policy = _test.assertTransactionPolicy(f.compressed, {publicKey: f.payer}, [f.table]);
      assert.equal(policy.approvedRentBundle, setup);
      assert.equal(policy.deferredMarketExecution, true);
      const approval = _test.assertTransactionPolicy(f.authorizationTransaction, {publicKey: f.payer}, [], {transaction: f.compressed, tables: [f.table]});
      assert.equal(approval.maximumDebit, 5000000);
    }
  }
});
test('deferred approvals reject missing, substituted and altered purchase intents', async () => {
  const f = await planetBuyerFixture(false, undefined, undefined, true);
  assert.throws(() => _test.assertTransactionPolicy(f.authorizationTransaction, {publicKey: f.payer}));
  const other = await planetBuyerFixture(false, undefined, undefined, true);
  assert.throws(() => _test.assertTransactionPolicy(f.authorizationTransaction, {publicKey: f.payer}, [], {transaction: other.compressed, tables: [other.table]}));
  for (const offset of [1,33,65,75,79,80,81,120]) {
    const copy = VersionedTransaction.deserialize(f.authorizationTransaction.serialize());
    copy.message.compiledInstructions[1].data[offset] ^= 1;
    assert.throws(() => _test.assertTransactionPolicy(copy, {publicKey: f.payer}, [], {transaction: f.compressed, tables: [f.table]}));
  }
});
test('deferred execution rejects swapped refund, wallet, vault and extra outer actions', async () => {
  for (const index of [0,1,2,4]) {
    const f = await planetBuyerFixture(false, undefined, undefined, true);
    const ix = f.wrapped[0]; ix.keys[index].pubkey = Keypair.generate().publicKey;
    const tx = new VersionedTransaction(new TransactionMessage({payerKey: f.payer, recentBlockhash: PublicKey.default.toBase58(), instructions: f.wrapped}).compileToV0Message([f.table]));
    assert.throws(() => _test.assertTransactionPolicy(tx, {publicKey: f.payer}, [f.table]));
  }
  const f = await planetBuyerFixture(false, undefined, undefined, true);
  const tx = new VersionedTransaction(new TransactionMessage({payerKey: f.payer, recentBlockhash: PublicKey.default.toBase58(), instructions: [...f.wrapped,...f.wrapped]}).compileToV0Message([f.table]));
  assert.throws(() => _test.assertTransactionPolicy(tx, {publicKey: f.payer}, [f.table]));
});
test('planet purchase rejects fixed-account substitutions and unauthorized companions', async () => {
  for (const mutate of [
    ...[2,4,5,6,9,10,11,12,13,16,17,18].map(i => inner => {inner.at(-1).keys[i].pubkey = Keypair.generate().publicKey;}),
    inner => {inner.at(-1).keys[1].pubkey = inner.at(-1).keys[0].pubkey;},
    inner => {inner.at(-1).data[0] ^= 1;},
    inner => {inner.at(-1).data = Buffer.concat([inner.at(-1).data, Buffer.from([0])]);},
    inner => {inner[0].keys[1].pubkey = Keypair.generate().publicKey;},
    inner => {inner[1].keys[2].pubkey = Keypair.generate().publicKey;},
    inner => {inner.push(inner.at(-1));},
    inner => {inner.reverse();},
  ]) {
    const f = await planetBuyerFixture(true, mutate);
    assert.throws(() => _test.assertTransactionPolicy(f.compressed, {publicKey: f.payer}, [f.table]));
  }
});
test('planet purchase requires one preceding passkey, one execute, and frozen exact table', async () => {
  const f = await planetBuyerFixture(false);
  for (const instructions of [f.wrapped.slice(1), [...f.wrapped].reverse(), [...f.wrapped, f.wrapped.at(-1)]]) {
    const tx = new VersionedTransaction(new TransactionMessage({payerKey: f.payer,
      recentBlockhash: PublicKey.default.toBase58(), instructions}).compileToV0Message([f.table]));
    assert.throws(() => _test.assertTransactionPolicy(tx, {publicKey: f.payer}, [f.table]));
  }
  f.table.state.addresses[0] = Keypair.generate().publicKey;
  assert.throws(() => _test.assertTransactionPolicy(f.compressed, {publicKey: f.payer}, [f.table]));
});
