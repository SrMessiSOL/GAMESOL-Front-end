const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = ts.createSourceFile('UniverseGame.tsx', fs.readFileSync(require.resolve('../src/UniverseGame.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
    && node.arguments[0]?.getText(source).includes('reconcileSubmittedPlanetPurchase')) effect = node.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source); assert(effect, 'actual recovery effect missing');
const recoveryModule = {exports: {}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/planet-purchase-recovery.ts'), 'utf8'),
  {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {exports: recoveryModule.exports, Error});
async function fixture({linkedVault = 'game-vault', commander = 'game-vault', cancel = false} = {}) {
  const key = 'gamesol:planet-purchase:devnet:lazor-smart-wallet';
  const storage = new Map([[key, JSON.stringify({version: 1, wallet: 'lazor-smart-wallet', executionSignature: 'paid', intent: 'purchase', payload: 'exact', createdAt: 100})]]);
  const reads = [], operations = []; let refreshed = 0, queries = 0, release;
  const context = {IS_DEVNET: true, publicKey: {toBase58: () => commander},
    passkey: {wallet: {smartWallet: 'lazor-smart-wallet', vaultPda: linkedVault}},
    localStorage: {getItem: name => {reads.push(name); return storage.get(name) ?? null;}, removeItem: name => storage.delete(name)},
    connection: {getGenesisHash: async () => 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
      getSignatureStatuses: async signatures => {queries++; assert.deepEqual(Array.from(signatures), ['paid']);
        if (cancel) await new Promise(resolve => {release = resolve;});
        return {value: [{err: null, confirmationStatus: 'finalized'}]};}},
    reconcileSubmittedPlanetPurchase: recoveryModule.exports.reconcileSubmittedPlanetPurchase,
    setStatus: () => {}, setOperation: value => operations.push(value), refresh: async () => {refreshed++;},
    setBalanceRefreshVersion: () => {},
    setTimeout: () => {throw new Error('confirmed receipt must not keep polling');}, clearTimeout: () => {}, Date, Error,
    module: {exports: {}}};
  vm.runInNewContext(ts.transpileModule(`module.exports = ${effect};`, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, context);
  const cleanup = context.module.exports();
  await new Promise(setImmediate);
  if (cancel) {cleanup(); release(); await new Promise(setImmediate);}
  return {storage, key, reads, operations, refreshed, queries};
}
test('actual game watcher reconciles the smart-wallet key, not the distinct commander vault', async () => {
  const f = await fixture();
  assert(f.reads.length > 0); assert(f.reads.every(key => key === f.key));
  assert.equal(f.storage.size, 0); assert.equal(f.queries, 1); assert.equal(f.refreshed, 1);
  assert.equal(f.operations.length, 1); assert.equal(f.operations[0].phase, 'success');
});
test('actual game watcher refuses a mismatched linked commander', async () => {
  const f = await fixture({linkedVault: 'another-vault'});
  assert.equal(f.reads.length, 0); assert.equal(f.queries, 0); assert.equal(f.operations.length, 0); assert.equal(f.storage.size, 1);
});
test('account-change cleanup cannot clear the old pending record or show its success on the new account', async () => {
  const f = await fixture({cancel: true});
  assert.equal(f.storage.size, 1); assert.equal(f.operations.length, 0); assert.equal(f.refreshed, 0);
});
