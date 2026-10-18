const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const moduleRef = {exports: {}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/passkey-approval-age.ts'), 'utf8'),
  {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText,
  {exports: moduleRef.exports, Error});
const {assertFreshPasskeyApproval} = moduleRef.exports;
test('fresh proof ages allow bounded submission headroom without extending Lazor authority', () => {
  for (const age of [0n, 4n, 129n, 130n]) assert.doesNotThrow(() => assertFreshPasskeyApproval(1000n, 1000n + age));
  for (const current of [999n, 1131n, 1150n, 999999n]) {
    assert.throws(() => assertFreshPasskeyApproval(1000n, current), error => error.purchaseNotSubmitted === true && /No payment was sent/.test(error.message));
  }
});
test('planet purchase builds its display before starting the signed proof clock and checks age before sending', () => {
  const source = fs.readFileSync(require.resolve('../src/player-funded-session.ts'), 'utf8');
  assert.match(source, /const display = await buildDisplayTransaction[^;]+;\s*approvalSlot = await freshPasskeySlot/);
  assert.match(source, /assertFreshPasskeyApproval\(approvalSlot,[^;]+;\s*await sendSponsored\(rpc, authorization/);
});
