const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PublicKey } = require('@solana/web3.js');
const { storeTransactionFixture } = require('./store-transaction-fixture.cjs');
const source = fs.readFileSync(require.resolve('../src/player-funded-session.ts'), 'utf8');
const ast = ts.createSourceFile('session.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isStorePurchaseBundle');
const code = ts.transpileModule(fn.getText(ast) + '\nmodule.exports = isStorePurchaseBundle;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleScope = { exports: {} };
vm.runInNewContext(code, { module: moduleScope, Buffer, GAME_STATE_PROGRAM_ID: new PublicKey(require('../src/ufo-lookup-table.json').addresses[0]) });
const accepts = moduleScope.exports;

test('client compression selects only the existing passkey store bundle', async () => {
  for (const rent of [false, true]) {
    const f = await storeTransactionFixture(rent);
    assert.equal(accepts(f.inner), true);
    assert.equal(accepts([...f.inner, ...f.inner]), false);
    f.inner.at(-1).data[0] ^= 1;
    assert.equal(accepts(f.inner), false);
  }
  assert.equal(accepts([]), false);
  assert.match(source, /sendSponsored\(rpc, \[\.\.\.precompiles, \.\.\.wrapped\], \[\], displayBlockhash, isStorePurchaseBundle\(instructions\)\)/);
  assert.match(source, /sendSponsored\(rpc, \[\.\.\.precompiles, \.\.\.wrapped\], \[sessionKeypair\], latest\)/);
});
