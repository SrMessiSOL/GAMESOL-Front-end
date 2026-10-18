const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const moduleRef = {exports: {}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/payment-recovery-qa.ts'), 'utf8'),
  {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText,
  {exports: moduleRef.exports, URLSearchParams});
const {paymentTestPhase} = moduleRef.exports;
const host = 'frontend-test123-srmessisols-projects.vercel.app';
const genesis = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
test('payment interruption requires explicit build flag, Preview host, devnet genesis and exact phase', () => {
  for (const phase of ['approval', 'execution']) assert.equal(paymentTestPhase('1', host, `?paymentTestPause=${phase}`, genesis), phase);
  assert.equal(paymentTestPhase('1', 'gamesol-devnet-qa.vercel.app', '?paymentTestPause=execution', genesis), 'execution');
  assert.equal(paymentTestPhase(undefined, 'gamesol-devnet-qa.vercel.app', '?paymentTestPause=execution', genesis), null);
  for (const enabled of [undefined, '0', 'true']) assert.equal(paymentTestPhase(enabled, host, '?paymentTestPause=approval', genesis), null);
  for (const hostname of ['chained-universe.vercel.app', 'localhost', host + '.evil.com']) assert.equal(paymentTestPhase('1', hostname, '?paymentTestPause=approval', genesis), null);
  assert.equal(paymentTestPhase('1', host, '?paymentTestPause=approval', 'mainnet'), null);
  assert.equal(paymentTestPhase('1', host, '?paymentTestPause=anything', genesis), null);
});
test('payment interruption preserves submission callbacks before throwing', () => {
  const source = fs.readFileSync(require.resolve('../src/player-funded-session.ts'), 'utf8');
  assert.match(source, /submitted\(signature\);\s*if \(testPause === 'execution'\)/);
  assert.match(source, /await sendSponsored\(rpc, authorization,[\s\S]*?if \(testPause === 'approval'\)/);
});
