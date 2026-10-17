const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { PublicKey, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction, AddressLookupTableAccount } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');
const { storeTransactionFixture } = require('../server/store-transaction-fixture.cjs');
const { _test } = require('./lazor-paymaster.js');
const manifest = require('../src/alliance-lookup-table.json');
const game = new PublicKey(manifest.addresses[0]);
const pda = (seed, key) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...(key ? [key.toBuffer()] : [])], game)[0];

async function fixture(mutate = () => {}, origin = 'https://chained-universe.vercel.app', period = 1) {
  const f = await storeTransactionFixture(false, inner => {
    const owner = inner[0].keys[0].pubkey, alliance = pda('alliance', owner), mint = new PublicKey(manifest.antimatterMint);
    const data = Buffer.alloc(42);
    crypto.createHash('sha256').update('global:deposit_alliance_resources').digest().copy(data, 0, 0, 8);
    data[8] = period; data[9] = 3; data.writeBigUInt64LE(period === 1 ? 100_000_000n : 1_000_000_000n, 34);
    inner[0] = new TransactionInstruction({ programId: game,
      keys: [owner, alliance, pda('alliance_membership', owner), pda('alliance_treasury', alliance), Keypair.generate().publicKey,
        pda('game_config'), pda('store_config'), mint, getAssociatedTokenAddressSync(mint, owner, true),
        new PublicKey(manifest.treasuryAntimatter), TOKEN_PROGRAM_ID].map((pubkey, i) => ({ pubkey, isSigner: i === 0, isWritable: [0,1,2,3,4,8,9].includes(i) })), data });
    mutate(inner);
  }, origin);
  const table = new AddressLookupTableAccount({ key: new PublicKey(manifest.table), state: { ...f.table.state, addresses: manifest.addresses.map(x => new PublicKey(x)) } });
  const compressed = new VersionedTransaction(new TransactionMessage({ payerKey: f.payer, recentBlockhash: PublicKey.default.toBase58(), instructions: f.wrapped }).compileToV0Message([table]));
  return { ...f, table, compressed };
}

test('daily and weekly AM deposits fit public and long preview packets with existing frozen table', async () => {
  for (const period of [1, 2]) for (const origin of ['https://chained-universe.vercel.app', 'https://frontend-5qbez2oeb-srmessisols-projects.vercel.app']) {
    const f = await fixture(undefined, origin, period);
    let raw;
    try { raw = f.transaction.serialize().length; } catch (error) {
      assert.match(error.message, /encoding overruns/);
      raw = 'exceeds serializer capacity';
    }
    assert.ok(typeof raw === 'string' || raw > 1232);
    assert.ok(f.compressed.serialize().length <= 1232);
    console.log(JSON.stringify({ origin, raw, compressed: f.compressed.serialize().length }));
    const policy = _test.assertTransactionPolicy(f.compressed, { publicKey: f.payer }, [f.table]);
    assert.equal(policy.maximumDebit, 250000);
    assert.equal(policy.approvedRentBundle, false);
  }
});

test('weekly compression rejects daily amounts, monthly periods, wrong recipients and extra commands', async () => {
  for (const mutate of [
    inner => { inner[0].data.writeBigUInt64LE(100_000_000n, 34); },
    inner => { inner[0].data[8] = 3; },
    inner => { inner[0].keys[9].pubkey = Keypair.generate().publicKey; },
    inner => { inner.push(inner[0]); },
  ]) {
    const f = await fixture(mutate, undefined, 2);
    assert.throws(() => _test.assertTransactionPolicy(f.compressed, { publicKey: f.payer }, [f.table]));
  }
});

test('deposit rejects changed fixed accounts, amount, period, resource payload, and extra actions', async () => {
  const mutations = [
    ...[2,3,5,6,7,8,9,10].map(i => inner => { inner[0].keys[i].pubkey = Keypair.generate().publicKey; }),
    inner => { inner[0].data[0] ^= 1; },
    inner => { inner[0].data[8] = 3; },
    inner => { inner[0].data[9] = 0; },
    inner => { inner[0].data[10] = 1; },
    inner => { inner[0].data.writeBigUInt64LE(101_000_000n, 34); },
    inner => { inner[0].data = Buffer.concat([inner[0].data, Buffer.from([0])]); },
    inner => { inner.push(inner[0]); },
  ];
  for (const mutate of mutations) {
    const f = await fixture(mutate);
    assert.throws(() => _test.assertTransactionPolicy(f.compressed, { publicKey: f.payer }, [f.table]));
  }
});

test('deposit requires exactly one preceding passkey, one execute, and frozen exact table', async () => {
  const f = await fixture();
  for (const instructions of [f.wrapped.slice(1), [...f.wrapped].reverse(), [...f.wrapped, f.wrapped.at(-1)]]) {
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: f.payer, recentBlockhash: PublicKey.default.toBase58(), instructions }).compileToV0Message([f.table]));
    assert.throws(() => _test.assertTransactionPolicy(tx, { publicKey: f.payer }, [f.table]));
  }
  for (const state of [{ ...f.table.state, authority: Keypair.generate().publicKey }, { ...f.table.state, addresses: [...f.table.state.addresses].reverse() }]) {
    assert.throws(() => _test.assertTransactionPolicy(f.compressed, { publicKey: f.payer }, [new AddressLookupTableAccount({ key: f.table.key, state })]));
  }
});

test('frontend selects only canonical daily 100-AM and weekly 1000-AM deposits for alliance compression', async () => {
  const source = ts.createSourceFile('session.ts', fs.readFileSync(require.resolve('../src/player-funded-session.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'isAllianceDepositBundle');
  const js = ts.transpileModule(declaration.getText(source) + '\nmodule.exports = isAllianceDepositBundle;', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, Buffer, GAME_STATE_PROGRAM_ID: game });
  for (const period of [1, 2]) {
    const f = await fixture(undefined, undefined, period);
    assert.equal(module.exports(f.inner), true);
    f.inner[0].data[34] ^= 1;
    assert.equal(module.exports(f.inner), false);
  }
});
