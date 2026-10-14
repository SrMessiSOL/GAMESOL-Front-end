const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PublicKey } = require('@solana/web3.js');
const source = fs.readFileSync(require.resolve('../src/UniverseGame.tsx'), 'utf8');
const ast = ts.createSourceFile('game.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'runForEntity') declaration = node;
  ts.forEachChild(node, visit);
}
visit(ast);
const code = ts.transpileModule('const ' + declaration.getText(ast) + '; module.exports = runForEntity;', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function fixture(failBalance = false) {
  const events = [];
  let operation;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, PublicKey, client: {},
    setBusy: busy => events.push(['busy', busy]), setStatus: status => events.push(['status', status]),
    setOperation: value => { operation = value; }, refresh: async () => events.push(['planet']),
    refreshWalletTokenBalances: async () => { events.push(['tokens']); if (failBalance) throw new Error('RPC unavailable'); },
    commandSuccessGuidance: () => ({ detail: 'Confirmed', nextStep: 'Continue' }),
    playerError: error => ({ detail: error.message }),
  });
  return { run: module.exports, events, operation: () => operation };
}

test('confirmed store purchases refresh token balances after the actual action', async () => {
  const f = fixture();
  await f.run('Purchase Daily Logistics Crate', PublicKey.default.toBase58(), async () => f.events.push(['action']));
  assert.ok(f.events.findIndex(event => event[0] === 'tokens') > f.events.findIndex(event => event[0] === 'action'));
  assert.equal(f.operation().phase, 'success');
});

test('a token read failure cannot turn a confirmed purchase into an error or repeat it', async () => {
  const f = fixture(true);
  let actions = 0;
  await f.run('Purchase Daily Deuterium Cache', PublicKey.default.toBase58(), async () => { actions += 1; });
  assert.equal(actions, 1);
  assert.equal(f.operation().phase, 'success');
  assert.match(f.operation().detail, /token balances could not refresh/);
});

test('failed purchases and ordinary construction do not introduce token balance reads', async () => {
  for (const fail of [false, true]) {
    const f = fixture();
    await f.run(fail ? 'Purchase Daily Logistics Crate' : 'Start construction', PublicKey.default.toBase58(), async () => { if (fail) throw new Error('Rejected'); });
    assert.equal(f.events.filter(event => event[0] === 'tokens').length, 0);
    assert.equal(f.operation().phase, fail ? 'error' : 'success');
  }
});
