const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/player-funded-session.ts'), 'utf8');
const ast = ts.createSourceFile('session.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'executeWithPlayerSession');
const code = ts.transpileModule(fn.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

test('expired on-chain Quick Play stops before wrapping or submitting a command', async () => {
  let checked = '';
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports,
    refreshPlayerFundedSession: async wallet => { checked = wallet; return { active: false }; },
    Error,
  });
  await assert.rejects(module.exports.executeWithPlayerSession({ smartWallet: 'commander' }, [], 'session'), /session expired.*No command was submitted/);
  assert.equal(checked, 'commander');
});

test('session status lookup failure stops instead of trusting cached authorization', async () => {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports,
    refreshPlayerFundedSession: async () => { throw new Error('RPC unavailable'); }, Error,
  });
  await assert.rejects(module.exports.executeWithPlayerSession({ smartWallet: 'commander' }, [], 'session'), /RPC unavailable/);
});
