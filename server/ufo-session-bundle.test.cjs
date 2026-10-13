const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { Keypair, SystemProgram, Ed25519Program } = require('@solana/web3.js');
const { ufoTransactionFixture } = require('./ufo-transaction-fixture.cjs');
const game = require('./ufo-attestations.cjs').PROGRAM;
const source = fs.readFileSync(path.join(__dirname, '../src/ufo-onchain.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const exported = { exports: {} };
new Function('require', 'module', 'exports', output)(name => name === './game-state' ? { GAME_STATE_PROGRAM_ID: game } : require(name), exported, exported.exports);
const { isUfoSessionBundle } = exported.exports;
const bundle = f => [f.instructions[0], ...f.inner];

test('Quick Play classifies canonical start, advance and claim proofs as routine game commands', async () => {
  for (const action of ['start', 'advance', 'claim']) {
    const f = await ufoTransactionFixture(action);
    assert.equal(await isUfoSessionBundle(bundle(f), f.commander), true);
  }
  const hook = fs.readFileSync(path.join(__dirname, '../src/usePasskeyGameplayVault.ts'), 'utf8');
  assert.match(hook, /await isUfoSessionBundle\(instructions, vaultPublicKey\)/);
  assert.match(hook, /routineProgramsOnly \|\| verifiedUfoBundle/);
  assert.match(hook, /hasPlayerFundedSession\(wallet.smartWallet\)/);
});

test('arbitrary precompiles, another commander and unrelated instructions never acquire session eligibility', async () => {
  for (const change of [
    (b, f) => { b[0].data[16] ^= 1; },
    (b, f) => { b[0].data[112] ^= 1; },
    (b, f) => { b[0].data[4] = 0; },
    (b, f) => { b[b.length - 1].data[8] ^= 1; },
    (b, f) => { b[b.length - 1].data[0] ^= 1; },
    (b, f) => { b[1].keys[1].pubkey = Keypair.generate().publicKey; },
    (b, f) => { b[1].programId = SystemProgram.programId; },
    (b, f) => { b.push(SystemProgram.transfer({ fromPubkey: f.commander, toPubkey: Keypair.generate().publicKey, lamports: 1 })); },
    (b, f) => { b.reverse(); },
    (b, f) => { b.unshift(b[0]); },
    (b, f) => { b[0] = Ed25519Program.createInstructionWithPublicKey({ publicKey: Keypair.generate().publicKey.toBytes(), signature: Buffer.alloc(64), message: Buffer.alloc(0) }); },
  ]) {
    const f = await ufoTransactionFixture();
    const b = bundle(f); change(b, f);
    assert.equal(await isUfoSessionBundle(b, f.commander), false);
  }
  const f = await ufoTransactionFixture();
  assert.equal(await isUfoSessionBundle(bundle(f), Keypair.generate().publicKey), false);
});
