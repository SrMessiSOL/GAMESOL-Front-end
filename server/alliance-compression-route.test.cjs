const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PublicKey } = require('@solana/web3.js');
const { allianceTransactionFixture } = require('./alliance-transaction-fixture.cjs');
const { storeTransactionFixture } = require('./store-transaction-fixture.cjs');
const source = fs.readFileSync(require.resolve('../src/player-funded-session.ts'), 'utf8');
const ast = ts.createSourceFile('session.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isAllianceCreationBundle');
const code = ts.transpileModule(fn.getText(ast) + '\nmodule.exports = isAllianceCreationBundle;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleScope = { exports: {} };
vm.runInNewContext(code, { module: moduleScope, Buffer, GAME_STATE_PROGRAM_ID: new PublicKey(require('../src/ufo-lookup-table.json').addresses[0]) });
const accepts = moduleScope.exports;

test('client alliance table selection excludes store actions and additional commands', async () => {
  for (const rent of [false, true]) {
    const f = await allianceTransactionFixture(rent);
    assert.equal(accepts(f.inner), true);
    assert.equal(accepts([...f.inner, ...f.inner]), false);
    f.inner.at(-1).data[0] ^= 1;
    assert.equal(accepts(f.inner), false);
  }
  assert.equal(accepts((await storeTransactionFixture(false)).inner), false);
  assert.equal(accepts([]), false);
  assert.match(source, /compressStore === 'alliance' \? \[await fetchAllianceLookupTable\(rpc, payer\)\]/);
});
