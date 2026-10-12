const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/passkey-connect-recovery.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function setup() {
  let tick; let cleared = 0; let closed = 0; let popup = { closed: false }; let reject;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, Error,
    setInterval: (fn) => { tick = fn; return 1; }, clearInterval: () => { cleared++; },
  });
  const manager = { getPopupWindow: () => popup, closeDialog: () => { closed++; }, emit: (_, error) => reject(error) };
  return { run: module.exports.connectWithPopupRecovery, manager, tick: () => tick(),
    close: () => { popup.closed = true; }, remove: () => { popup = null; },
    pending: () => new Promise((_, fail) => { reject = fail; }), stats: () => ({ cleared, closed }) };
}

test('successful connection preserves the result and clears its monitor', async () => {
  const f = setup(); const result = { credentialId: 'test-only' };
  assert.equal(await f.run(f.manager, () => Promise.resolve(result)), result);
  assert.deepEqual(f.stats(), { cleared: 1, closed: 0 });
});

for (const mode of ['close', 'remove']) test(`popup ${mode} rejects through the SDK and releases the monitor`, async () => {
  const f = setup(); const pending = f.run(f.manager, f.pending);
  f.tick(); f[mode](); f.tick();
  await assert.rejects(pending, /Sign-in was cancelled/);
  assert.equal(f.stats().cleared, 1);
});

test('blocked popup provides an actionable error and cleans up', async () => {
  const f = setup();
  await assert.rejects(f.run(f.manager, () => Promise.reject(new Error('Popup was blocked by browser'))), /Allow popups for GAMESOL/);
  assert.deepEqual(f.stats(), { cleared: 1, closed: 1 });
});

test('timeout provides a retry path without changing any stored credentials', async () => {
  const f = setup();
  await assert.rejects(f.run(f.manager, () => Promise.reject(new Error('Connection timed out after 60 seconds'))), /open GAMESOL directly in Chrome or Edge/);
  assert.deepEqual(f.stats(), { cleared: 1, closed: 1 });
});
