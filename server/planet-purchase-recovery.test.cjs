const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const moduleRef = {exports: {}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/planet-purchase-recovery.ts'), 'utf8'),
  {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {exports: moduleRef.exports, Date, Error});
const {runPlanetPurchase} = moduleRef.exports;
function fixture(pending = null) {
  const calls = [], state = {pending, exists: true, status: 'confirmed'};
  const callbacks = {
    load: () => state.pending,
    save: record => {state.pending = record && {...record};},
    prepare: async () => {calls.push('prepare'); return {version: 1, wallet: 'A', intent: 'purchase', payload: 'exact-payload', createdAt: 100};},
    authorize: async (record, submitted) => {calls.push('authorize'); submitted('approval');},
    execute: async (record, submitted) => {calls.push('execute'); assert.equal(record.payload, 'exact-payload'); submitted('execution'); return 'execution';},
    exists: async () => state.exists,
    status: async () => state.status,
    reclaim: async () => {calls.push('reclaim');},
  };
  return {state, calls, callbacks};
}
test('a planet purchase approves once, then executes and clears recovery state', async () => {
  const f = fixture(); assert.equal(await runPlanetPurchase('A', 'purchase', f.callbacks, 100), 'execution');
  assert.deepEqual(f.calls, ['prepare','authorize','execute']); assert.equal(f.state.pending, null);
});
test('execution failure resumes the same on-chain approval without another passkey', async () => {
  const f = fixture(); f.callbacks.execute = async () => {throw new Error('network failure');};
  await assert.rejects(runPlanetPurchase('A', 'purchase', f.callbacks, 100), /network failure/);
  assert.equal(f.state.pending.approvalSignature, 'approval');
  const retry = fixture(f.state.pending); assert.equal(await runPlanetPurchase('A', 'purchase', retry.callbacks, 110), 'execution');
  assert.deepEqual(retry.calls, ['execute']);
});
test('confirmed delayed execution restores success without executing twice', async () => {
  const f = fixture({version: 1, wallet: 'A', intent: 'purchase', executionSignature: 'already-paid', payload: 'exact-payload', createdAt: 100});
  assert.equal(await runPlanetPurchase('A', 'purchase', f.callbacks, 110), 'already-paid');
  assert.deepEqual(f.calls, []); assert.equal(f.state.pending, null);
});
test('pending execution or missing authorization cannot trigger another purchase', async () => {
  const record = {version: 1, wallet: 'A', intent: 'purchase', payload: 'exact-payload', createdAt: 100};
  const f = fixture({...record, executionSignature: 'pending'}); f.state.status = 'pending';
  await assert.rejects(runPlanetPurchase('A', 'purchase', f.callbacks, 110), /No second purchase/); assert.deepEqual(f.calls, []);
  const missing = fixture(record); missing.state.exists = false;
  await assert.rejects(runPlanetPurchase('A', 'purchase', missing.callbacks, 110), /No new approval/); assert.deepEqual(missing.calls, []);
});
test('failed submitted execution may retry only its existing approval', async () => {
  const f = fixture({version: 1, wallet: 'A', intent: 'purchase', payload: 'exact-payload', executionSignature: 'failed', createdAt: 100});
  f.state.status = 'failed'; await runPlanetPurchase('A', 'purchase', f.callbacks, 110); assert.deepEqual(f.calls, ['execute']);
});
test('account and listing substitution stop before approval or execution', async () => {
  const record = {version: 1, wallet: 'A', intent: 'purchase', payload: 'exact-payload', createdAt: 100};
  for (const [wallet, intent] of [['B','purchase'], ['A','different-listing']]) {
    const f = fixture(record); await assert.rejects(runPlanetPurchase(wallet, intent, f.callbacks, 110), /needs review/); assert.deepEqual(f.calls, []);
  }
});
test('expired approvals reclaim rent without automatically starting a fresh purchase', async () => {
  const f = fixture({version: 1, wallet: 'A', intent: 'purchase', payload: 'exact-payload', createdAt: 100});
  await assert.rejects(runPlanetPurchase('A', 'purchase', f.callbacks, 180101), /rent was returned/);
  assert.deepEqual(f.calls, ['reclaim']); assert.equal(f.state.pending, null);
});
test('definitive pre-submission rejection clears only its unused approval intent', async () => {
  const f = fixture();
  f.callbacks.authorize = async () => {throw Object.assign(new Error('policy rejected'), {purchaseNotSubmitted: true});};
  await assert.rejects(runPlanetPurchase('A', 'purchase', f.callbacks, 100), /policy rejected/);
  assert.equal(f.state.pending, null); assert.deepEqual(f.calls, ['prepare']);
});
test('uncertain authorization errors retain the intent instead of asking for another approval', async () => {
  const f = fixture(); f.callbacks.authorize = async () => {throw new Error('connection lost');};
  await assert.rejects(runPlanetPurchase('A', 'purchase', f.callbacks, 100), /connection lost/);
  assert.equal(f.state.pending.intent, 'purchase');
  f.state.exists = false;
  await assert.rejects(runPlanetPurchase('A', 'purchase', f.callbacks, 110), /confirmation check/);
  assert.deepEqual(f.calls, ['prepare']);
});
