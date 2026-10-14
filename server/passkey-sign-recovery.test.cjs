const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/passkey-connect-recovery.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function fixture() {
  let interval, timeout, now = 0, popup = { closed: false }, closed = 0, cleared = 0;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, Error, Date: { now: () => now },
    setInterval: fn => { interval = fn; return 1; }, clearInterval: () => { cleared++; },
    setTimeout: fn => { timeout = fn; return 2; }, clearTimeout: () => { cleared++; },
  });
  return { ...module.exports, manager: { getPopupWindow: () => popup, closeDialog: () => { closed++; }, emit: () => false },
    tick: () => interval(), expire: () => { now = 60_001; interval(); }, preparationTimeout: () => timeout(),
    close: () => { popup.closed = true; }, remove: () => { popup = null; }, stats: () => ({ closed, cleared }) };
}

for (const action of ['close', 'remove', 'expire']) test(`signing ${action} rejects even when SDK never settles, and ignores a late signature`, async () => {
  const f = fixture(); let complete; let submitted = 0;
  const pending = f.signWithPopupRecovery(f.manager, () => new Promise(resolve => { complete = resolve; }))
    .then(() => { submitted++; });
  if (action === 'expire') f.expire(); else { f[action](); f.tick(); }
  await assert.rejects(pending, /cancelled|timed out/);
  complete({ signature: 'late-test-only' });
  await Promise.resolve();
  assert.equal(submitted, 0);
  assert.equal(f.stats().cleared, 1);
});

test('blocked popup releases signing and provides a retry instruction', async () => {
  const f = fixture();
  await assert.rejects(f.signWithPopupRecovery(f.manager, () => Promise.reject(Error('Popup was blocked by browser'))), /Allow popups for GAMESOL/);
  assert.deepEqual(f.stats(), { closed: 1, cleared: 1 });
});

test('successful signature is preserved and its monitor is cleared', async () => {
  const f = fixture(); const result = { signature: 'test-only' };
  assert.equal(await f.signWithPopupRecovery(f.manager, () => Promise.resolve(result)), result);
  assert.deepEqual(f.stats(), { closed: 0, cleared: 1 });
});

test('synchronous popup failure also releases the monitor', async () => {
  const f = fixture();
  await assert.rejects(f.signWithPopupRecovery(f.manager, () => { throw Error('Popup was blocked'); }), /Allow popups/);
  assert.equal(f.stats().cleared, 1);
});

test('read-only preparation timeout prevents late preparation from continuing to signing', async () => {
  const f = fixture(); let resolve; let signatures = 0;
  const pending = f.withPreparationTimeout(new Promise(done => { resolve = done; })).then(() => { signatures++; });
  f.preparationTimeout();
  await assert.rejects(pending, /No command was submitted/);
  resolve('late RPC response');
  await Promise.resolve();
  assert.equal(signatures, 0);
  assert.equal(f.stats().cleared, 1);
});

test('preparation success returns unchanged and clears its deadline', async () => {
  const f = fixture();
  assert.equal(await f.withPreparationTimeout(Promise.resolve(42)), 42);
  assert.equal(f.stats().cleared, 1);
});

test('post-submission status timeout never claims that nothing was submitted', async () => {
  const f = fixture();
  const pending = f.withPreparationTimeout(new Promise(() => {}), 'Approval was submitted. Check Sponsor before retrying.');
  f.preparationTimeout();
  await assert.rejects(pending, /was submitted. Check Sponsor/);
});

function gameEnable(context) {
  const ast = ts.createSourceFile('UniverseGame.tsx', fs.readFileSync(path.join(__dirname, '../src/UniverseGame.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'enableGameplaySession') expression = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const code = ts.transpileModule(`module.exports = ${expression}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { ...context, module });
  return module.exports;
}

test('actual game enable action releases its button on cancellation or blocked approval', async () => {
  let busy, status;
  const enable = gameEnable({ setPasskeyActionBusy: value => { busy = value; }, setStatus: value => { status = value; },
    passkey: { createGameplaySession: async () => { throw Error('Approval cancelled'); } },
    friendlyAccountError: error => error.message, refreshVaultBalance: async () => { throw Error('Must not refresh'); } });
  await enable();
  assert.equal(busy, false);
  assert.equal(status, 'Approval cancelled');
});

test('actual game button cannot remain disabled because a balance refresh never resolves', async () => {
  let busy, status;
  const enable = gameEnable({ setPasskeyActionBusy: value => { busy = value; }, setStatus: value => { status = value; },
    passkey: { createGameplaySession: async () => {} },
    friendlyAccountError: error => error.message, refreshVaultBalance: () => new Promise(() => {}) });
  await enable();
  assert.equal(busy, false);
  assert.match(status, /Quick Play is on/);
});
