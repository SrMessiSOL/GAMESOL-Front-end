const test = require('node:test');
const assert = require('node:assert/strict');
const {PublicKey, Keypair, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction} = require('@solana/web3.js');
const {_test} = require('./lazor-paymaster.js');
const {storeTransactionFixture} = require('../server/store-transaction-fixture.cjs');
const game = new PublicKey(require('../src/ufo-lookup-table.json').addresses[0]);
const market = new PublicKey('6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA');
const pda = (seed, key, program = market) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...(key ? [key.toBuffer()] : [])], program)[0];
const ts = require('typescript');
const source = require('node:fs').readFileSync(require.resolve('../src/player-funded-session.ts'), 'utf8');
const ast = ts.createSourceFile('session.ts', source, ts.ScriptTarget.Latest, true);
const routeFunction = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'isMarketListingBundle');
const routeModule = {exports: {}};
require('node:vm').runInNewContext(ts.transpileModule(routeFunction.getText(ast) + '\nmodule.exports=isMarketListingBundle;',
  {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText,
  {module: routeModule, Buffer, MARKET_PROGRAM_ID: market, GAME_STATE_PROGRAM_ID: game});
async function fixture(rent, origin, mutate = () => {}) {
  return storeTransactionFixture(rent, inner => {
    const owner = inner.at(-1).keys[0].pubkey, planet = Keypair.generate().publicKey;
    const data = Buffer.alloc(16);
    Buffer.from([168,189,82,35,166,138,116,61]).copy(data);
    data.writeBigUInt64LE(1000000n, 8);
    inner[inner.length - 1] = new TransactionInstruction({programId: market, data,
      keys: [owner, pda('market_config'), pda('seller_counter', owner), Keypair.generate().publicKey,
        pda('planet_listing_index', planet), pda('planet_market_obligation', planet), planet,
        Keypair.generate().publicKey, pda('planet_ownership', planet, game), SystemProgram.programId]
        .map((pubkey, i) => ({pubkey, isSigner: i === 0, isWritable: ![5,8,9].includes(i)}))});
    mutate(inner);
  }, origin);
}
test('planet listing real SDK packets fit with rent on public and Preview origins', async () => {
  for (const origin of ['https://chained-universe.vercel.app', 'https://frontend-5qbez2oeb-srmessisols-projects.vercel.app']) {
    for (const rent of [false, true]) {
      const f = await fixture(rent, origin);
      assert.equal(routeModule.exports(f.inner), true);
      assert(f.compressed.serialize().length <= 1232);
      const policy = _test.assertTransactionPolicy(f.compressed, {publicKey: f.payer}, [f.table]);
      assert.equal(policy.approvedRentBundle, rent);
    }
  }
});
test('client does not compress unrelated or repeated planet commands', async () => {
  const f = await fixture(false);
  assert.equal(routeModule.exports([]), false);
  assert.equal(routeModule.exports([...f.inner, ...f.inner]), false);
  f.inner[0].data[0] ^= 1;
  assert.equal(routeModule.exports(f.inner), false);
});
test('planet listing rejects substituted fixed accounts, price, setup and extra commands', async () => {
  for (const mutate of [
    ...[1,2,4,5,8,9].map(i => inner => {inner.at(-1).keys[i].pubkey = Keypair.generate().publicKey;}),
    inner => {inner.at(-1).data[0] ^= 1;},
    inner => {inner.at(-1).data.writeBigUInt64LE(999999n, 8);},
    inner => {inner[0].keys[1].pubkey = Keypair.generate().publicKey;},
    inner => {inner.push(inner.at(-1));},
  ]) {
    const f = await fixture(true, undefined, mutate);
    assert.throws(() => _test.assertTransactionPolicy(f.compressed, {publicKey: f.payer}, [f.table]));
  }
});
test('planet listing requires a preceding passkey and a single execute', async () => {
  const f = await fixture(false);
  for (const instructions of [f.wrapped.slice(1), [...f.wrapped].reverse(), [...f.wrapped, f.wrapped.at(-1)]]) {
    const tx = new VersionedTransaction(new TransactionMessage({payerKey: f.payer,
      recentBlockhash: PublicKey.default.toBase58(), instructions}).compileToV0Message([f.table]));
    assert.throws(() => _test.assertTransactionPolicy(tx, {publicKey: f.payer}, [f.table]));
  }
});
