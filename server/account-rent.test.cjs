const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { Keypair, SystemProgram, TransactionInstruction } = require('@solana/web3.js');
const game = require('./ufo-attestations.cjs').PROGRAM;
const source = fs.readFileSync(path.join(__dirname, '../src/account-rent.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);
const { accountRentTotal } = mod.exports;

test('rent uses live network quotes and deduplicates sizes without undercounting repeated accounts', async () => {
  const calls = [];
  const connection = { getMinimumBalanceForRentExemption: async (size, commitment) => { calls.push([size, commitment]); return (size + 128) * 5080; } };
  assert.equal(await accountRentTotal(connection, [1027, 16, 16]), 7330440);
  assert.deepEqual(calls, [[1027, 'confirmed'], [16, 'confirmed']]);
  assert.equal(await accountRentTotal(connection, []), 0);
  assert.equal(calls.length, 2);
});

test('rent is requoted when the network changes instead of persisting a fixed rate', async () => {
  let rate = 6960;
  const connection = { getMinimumBalanceForRentExemption: async size => (size + 128) * rate };
  assert.equal(await accountRentTotal(connection, [16]), 1002240);
  rate = 5080;
  assert.equal(await accountRentTotal(connection, [16]), 731520);
});

test('missing or invalid rent quotes fail closed', async () => {
  for (const value of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(accountRentTotal({ getMinimumBalanceForRentExemption: async () => value }, [16]), /quote/);
  }
  await assert.rejects(accountRentTotal({ getMinimumBalanceForRentExemption: async () => { throw Error('RPC unavailable'); } }, [16]), /RPC/);
  await assert.rejects(accountRentTotal({}, [-1]), /size/);
  await assert.rejects(accountRentTotal({ getMinimumBalanceForRentExemption: async () => Number.MAX_SAFE_INTEGER }, [16, 16]), /total/);
});

test('game rent setup funds only missing accounts and skips fully initialized accounts', async () => {
  const file = fs.readFileSync(path.join(__dirname, '../src/game-state.ts'), 'utf8');
  const ast = ts.createSourceFile('game.ts', file, ts.ScriptTarget.Latest, true);
  const klass = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'GameClient');
  const method = klass.members.find(node => node.name?.getText(ast) === 'buildSponsoredRentInstruction');
  const text = `class RentClient { constructor(connection, executor) { this.connection = connection; this.gameplayVaultExecutor = executor; } ${method.getText(ast)} } exports.RentClient = RentClient;`;
  const result = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const target = { exports: {} };
  new Function('exports', 'accountRentTotal', 'GAME_STATE_PROGRAM_ID', 'SystemProgram', 'TransactionInstruction', 'Buffer', 'IX', 'encodeInstruction', result)(target.exports, accountRentTotal, game, SystemProgram, TransactionInstruction, Buffer, { sponsorAccountRent: Buffer.alloc(8) }, (disc, amount) => Buffer.concat([disc, amount]));
  let infos = [null, {}, null];
  const quotes = [];
  const connection = { getMultipleAccountsInfo: async () => infos, getMinimumBalanceForRentExemption: async space => { quotes.push(space); return (space + 128) * 5080; } };
  const payer = Keypair.generate().publicKey;
  const receiver = Keypair.generate().publicKey;
  const client = new target.exports.RentClient(connection, { payerPublicKey: payer });
  const accounts = [1027, 16, 16].map(space => ({ pubkey: Keypair.generate().publicKey, space }));
  const rent = await client.buildSponsoredRentInstruction(receiver, accounts);
  assert.equal(rent.data.readBigUInt64LE(8), 6598920n);
  assert.deepEqual(quotes, [1027, 16]);
  assert.ok(rent.keys[0].pubkey.equals(payer));
  assert.ok(rent.keys[1].pubkey.equals(receiver));
  infos = [{}, {}, {}];
  assert.equal(await client.buildSponsoredRentInstruction(receiver, accounts), null);
  assert.equal(quotes.length, 2);
});
