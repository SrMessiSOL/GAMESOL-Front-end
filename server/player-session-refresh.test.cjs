const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const file = fs.readFileSync(path.join(__dirname, '../src/player-funded-session.ts'), 'utf8');
const ast = ts.createSourceFile('session.ts', file, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'refreshPlayerFundedSession');
const compiled = ts.transpileModule(fn.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function fixture() {
  let stored = { walletPda: 'wallet', publicKey: 'key', sessionPda: 'old', active: false, expiresAt: '50' };
  let resolveOld; let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const writes = [];
  const module = { exports: {} };
  const rpc = { getSlot: async () => 100, getAccountInfo: async (key) => {
    if (key.value === 'old') { entered(); return new Promise(resolve => { resolveOld = resolve; }); }
    return { data: 1000n };
  } };
  vm.runInNewContext(compiled, { module, exports: module.exports, BigInt, JSON, Error,
    PublicKey: class { constructor(value) { this.value = value; } },
    ensurePlayerFeeSession: () => ({ ...stored }), connection: () => rpc,
    getSponsorPayer: async () => ({ toBase58: () => 'sponsor' }),
    readStoredSession: () => ({ ...stored }), sessionExpiry: data => data,
    sessionPolicyMatchesCurrentUniverse: () => true,
    writeStoredSession: value => { stored = { ...value }; writes.push(value); },
  });
  return { run: module.exports.refreshPlayerFundedSession, started, writes,
    replace: value => { stored = { ...value }; }, release: () => resolveOld({ data: 50n }), read: () => stored };
}

test('a stale status read cannot overwrite a newly activated session', async () => {
  const f = fixture(); const pending = f.run('wallet'); await f.started;
  f.replace({ walletPda: 'wallet', publicKey: 'new-key', sessionPda: 'new', active: true, expiresAt: '1000' });
  f.release(); const result = await pending;
  assert.equal(result.active, true); assert.equal(result.publicKey, 'new-key');
  assert.equal(f.read().sessionPda, 'new'); assert.equal(f.writes.length, 0);
});

test('a stale status read cannot restore a revoked session', async () => {
  const f = fixture(); const pending = f.run('wallet'); await f.started;
  f.replace({ walletPda: 'wallet', publicKey: 'key', active: false }); f.release();
  const result = await pending; assert.equal(result.active, false);
  assert.equal(f.read().sessionPda, undefined); assert.equal(f.writes.length, 0);
});

test('account changes reject instead of overwriting another account session', async () => {
  const f = fixture(); const pending = f.run('wallet'); await f.started;
  f.replace({ walletPda: 'another-wallet', publicKey: 'another-key', active: true }); f.release();
  await assert.rejects(pending, /account changed/); assert.equal(f.writes.length, 0);
});
