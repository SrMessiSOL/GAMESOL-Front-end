const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const {planetBuyerFixture} = require('./planet-buyer-fixture.cjs');
const target = {exports: {}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/lazor-deferred-payload.ts'), 'utf8'),
  {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText,
  {exports: target.exports, require, Uint8Array, JSON, Number, Error});
const {serializeDeferredPayload, deserializeDeferredPayload} = target.exports;
test('pending purchase retains the exact SDK payload across a browser storage round trip', async () => {
  const f = await planetBuyerFixture(true, undefined, undefined, true);
  const raw = serializeDeferredPayload(f.deferredPayload);
  assert.equal(serializeDeferredPayload(deserializeDeferredPayload(raw, f.deferredPayload.walletPda.toBase58())), raw);
});
test('cached payload rejects account substitution, malformed bytes and permissions', async () => {
  const f = await planetBuyerFixture(false, undefined, undefined, true);
  const raw = serializeDeferredPayload(f.deferredPayload), wallet = f.deferredPayload.walletPda.toBase58();
  assert.throws(() => deserializeDeferredPayload(raw, f.payer.toBase58()));
  for (const mutate of [
    value => {value.compactInstructions[0].data[0] = 256;},
    value => {value.compactInstructions[0].accountIndexes[0] = -1;},
    value => {value.remainingAccounts[0].isSigner = 'true';},
    value => {value.deferredExecPda = 'not-a-key';},
    value => {value.compactInstructions = [];},
  ]) {
    const value = JSON.parse(raw); mutate(value);
    assert.throws(() => deserializeDeferredPayload(JSON.stringify(value), wallet));
  }
});
