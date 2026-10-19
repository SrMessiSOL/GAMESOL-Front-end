const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const { PublicKey } = require('@solana/web3.js');
const read = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };

function hookHarness() {
  let wallet = { smartWallet: 'account-a', vaultPda: PublicKey.default.toBase58() };
  let index = 0;
  const values = [], effects = [], reads = [];
  const activation = deferred();
  const listeners = new Map(), timers = new Set();
  const document = { visibilityState: 'visible', addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  const window = { addEventListener: document.addEventListener, removeEventListener: document.removeEventListener,
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); } };
  let executionError;
  const react = {
    useState(initial) { const i = index++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], value => { values[i] = value; }]; },
    useRef(initial) { const i = index++; return values[i] ||= { current: initial }; },
    useMemo(factory) { return factory(); }, useCallback(fn) { return fn; },
    useEffect(fn, deps) {
      const i = index++;
      const old = values[i];
      // Test callbacks are stable in React; compare the wallet identity here.
      const signature = deps.map(value => typeof value === 'function' ? 'callback' : value);
      if (!old || signature.some((value, j) => value !== old.deps[j])) {
        old?.cleanup?.(); effects.push(() => { values[i] = { deps: signature, cleanup: fn() }; });
      }
    },
  };
  const module = { exports: {} };
  const requireMock = id => {
    if (id === 'react') return react;
    if (id === '@lazorkit/wallet') return { useWallet: () => ({ wallet }) };
    if (id === '@solana/web3.js') return { PublicKey };
    if (id === './game-state') return {};
    if (id === './ufo-onchain') return {};
    if (id === './player-funded-session') return {
      hasPlayerFundedSession: () => true,
      ensurePlayerFeeSession: () => ({ publicKey: 'fee' }),
      refreshPlayerFundedSession: () => { const pending = deferred(); reads.push(pending); return pending.promise; },
      activatePlayerFundedSession: () => activation.promise,
      executeWithPlayerSession: async () => { if (executionError) throw executionError; return 'signature'; },
    };
    throw Error(id);
  };
  vm.runInNewContext(compile(read('usePasskeyGameplayVault.ts')), { module, exports: module.exports, require: requireMock, window, document });
  return { reads, activation, listeners, timers, document, failExecution(error) { executionError = error; }, setWallet(value) { wallet = value; }, render() { index = 0; const result = module.exports.usePasskeyGameplayVault(); effects.splice(0).forEach(fn => fn()); return result; } };
}
const state = active => ({ publicKey: 'fee', balanceLamports: 0n, active, expiresAtSlot: 100n, sponsored: true, sponsorPayer: PublicKey.default.toBase58() });

test('page refresh restores a verified saved session without new activation', async () => {
  const h = hookHarness();
  assert.equal(h.render().hasSession, false, 'stored flag alone cannot authorize a restored session');
  h.reads[0].resolve(state(true)); await new Promise(setImmediate);
  const restored = h.render();
  assert.equal(restored.hasSession, true);
  assert.ok(restored.executor);
});

test('expired or revoked session remains off after restoration', async () => {
  const h = hookHarness(); h.render();
  h.reads[0].resolve(state(false)); await new Promise(setImmediate);
  assert.equal(h.render().hasSession, false);
});

test('idle expiry recheck clears the active flag without a page refresh', async () => {
  const h = hookHarness(); h.render();
  h.reads[0].resolve(state(true)); await new Promise(setImmediate);
  assert.equal(h.render().hasSession, true);
  const pending = [...h.timers][0]();
  h.reads[1].resolve(state(false)); await pending;
  assert.equal(h.render().hasSession, false);
});

test('returning to the visible tab rechecks expiry and skips hidden polling', async () => {
  const h = hookHarness(); h.render();
  h.reads[0].resolve(state(true)); await new Promise(setImmediate);
  h.document.visibilityState = 'hidden';
  await [...h.timers][0](); assert.equal(h.reads.length, 1);
  h.document.visibilityState = 'visible';
  const pending = h.listeners.get('visibilitychange')();
  h.reads[1].resolve(state(false)); await pending;
  assert.equal(h.render().hasSession, false);
});

test('failed command refreshes the stale ON status and preserves its error', async () => {
  const h = hookHarness(); h.render();
  h.reads[0].resolve(state(true)); await new Promise(setImmediate);
  const error = new Error('Quick Play session expired'); h.failExecution(error);
  await assert.rejects(h.render().executor.execute([], 'session'), error);
  h.reads[1].resolve(state(false)); await new Promise(setImmediate);
  assert.equal(h.render().hasSession, false);
});

test('background expiry checks do not invalidate passkey activation', async () => {
  const h = hookHarness(); const view = h.render();
  const activation = view.createGameplaySession();
  await [...h.timers][0](); assert.equal(h.reads.length, 1);
  h.activation.resolve(state(true)); await activation;
  h.reads[0].resolve(state(false)); await new Promise(setImmediate);
  assert.equal(h.render().hasSession, true);
});

test('sign-out removes background listeners and expiry timer', () => {
  const h = hookHarness(); h.render();
  assert.equal(h.timers.size, 1);
  h.setWallet(null); h.render();
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test('current RPC failure clears uncertified status and a later check recovers', async () => {
  const h = hookHarness(); h.render();
  h.reads[0].resolve(state(true)); await new Promise(setImmediate);
  const failed = [...h.timers][0]();
  h.reads[1].reject(new Error('RPC unavailable')); await failed;
  assert.equal(h.render().hasSession, false);
  const recovered = [...h.timers][0]();
  h.reads[2].resolve(state(true)); await recovered;
  assert.equal(h.render().hasSession, true);
});

test('stale RPC failure cannot disable a newer activated permission', async () => {
  const h = hookHarness(); const view = h.render();
  const activation = view.createGameplaySession();
  h.activation.resolve(state(true)); await activation;
  h.reads[0].reject(new Error('old RPC failure')); await new Promise(setImmediate);
  assert.equal(h.render().hasSession, true);
});

test('older restoration cannot overwrite a newly activated session', async () => {
  const h = hookHarness(); const first = h.render();
  const pending = first.createGameplaySession();
  h.activation.resolve(state(true)); await pending;
  h.reads[0].resolve(state(false)); await new Promise(setImmediate);
  assert.equal(h.render().hasSession, true);
});

test('previous account response cannot restore Quick Play on another account', async () => {
  const h = hookHarness(); h.render();
  h.setWallet({ smartWallet: 'account-b', vaultPda: PublicKey.default.toBase58() }); h.render();
  h.reads[0].resolve(state(true)); await new Promise(setImmediate);
  assert.equal(h.render().hasSession, false);
  h.reads[1].resolve(state(false)); await new Promise(setImmediate);
  assert.equal(h.render().hasSession, false);
});

test('late legacy preference cannot disable a bound smart-wallet executor', () => {
  const source = ts.createSourceFile('game-state.ts', read('game-state.ts'), ts.ScriptTarget.Latest, true);
  const client = source.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'GameClient');
  const method = client.members.find(node => node.name?.getText(source) === 'setPreferVaultSigning');
  const module = { exports: {} };
  vm.runInNewContext(compile(`module.exports = class { ${method.getText(source)} };`), { module, Boolean });
  const instance = new module.exports();
  instance.gameplayVaultExecutor = {};
  instance.setPreferVaultSigning(false);
  assert.equal(instance.preferVaultSigning, true);
  instance.gameplayVaultExecutor = null;
  instance.setPreferVaultSigning(false);
  assert.equal(instance.preferVaultSigning, false);
});

test('cancelled legacy restoration cannot overwrite current commander status', async () => {
  const source = ts.createSourceFile('UniverseGame.tsx', read('UniverseGame.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'unlockVault') callback = node.initializer.getText(source); ts.forEachChild(node, visit); };
  visit(source);
  const pending = deferred(), statuses = [];
  const module = { exports: {} };
  vm.runInNewContext(compile(`module.exports = ${callback};`), { module, publicKey: {},
    client: { restoreExistingVault: () => pending.promise, setPreferVaultSigning: () => { throw Error('stale preference write'); } },
    setVaultPasswordError() {}, setBusy() {}, setVaultStatus: value => statuses.push(value), setStatus: value => statuses.push(value),
  });
  let current = true;
  const result = module.exports(() => current);
  current = false; pending.resolve(true); await result;
  assert.equal(statuses.length, 0);
});
