const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const icons = require('lucide-react');

const filename = path.join(__dirname, '../src/UniverseGame.tsx');
const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'OperationModal');
assert.ok(component);
const moduleCode = ts.transpileModule(component.getText(source) + '\nmodule.exports = OperationModal;', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
const sandbox = { module: { exports: {} }, require, useRef: React.useRef, useEffect: React.useEffect, ...icons };
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(moduleCode, sandbox, { filename });
const render = operation => renderToStaticMarkup(React.createElement(sandbox.module.exports, { operation, onClose() {} }));
const errorFunction = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'playerError');
const errorSandbox = {module: {exports: {}}, Error, String};
vm.runInNewContext(ts.transpileModule(errorFunction.getText(source) + '\nmodule.exports = playerError;', {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText, errorSandbox);
const playerError = errorSandbox.module.exports;
const fixtures = {
  pending: { phase: 'pending', label: 'Purchase pending', detail: 'Purchase submitted. Waiting for confirmation.' },
  success: { phase: 'success', label: 'Research Lab completed', detail: 'Research Lab is now level 1.', nextAction: 'Open Research to choose your next technology.' },
  processing: { phase: 'processing', label: 'Upgrade Research Lab', detail: 'Waiting for devnet confirmation.' },
  error: { phase: 'error', label: 'Mission needs attention', detail: 'Choose another destination.', recovery: 'Your fleet has not departed. Review the destination and try again.', technicalDetail: '<script>not executable</script>\nInvalidDestination' },
};

test('successful game feedback is a nonblocking status with a separate next step', () => {
  const html = render(fixtures.success);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /aria-modal="true"/);
  assert.match(html, /class="ug-operation-next"><b>NEXT MOVE<\/b><span>/);
});

test('pending and failed commands retain their real accessibility and recovery structure', () => {
  assert.match(render(fixtures.processing), /aria-busy="true"/);
  const html = render(fixtures.error);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /class="ug-operation-recovery"/);
  assert.match(html, /&lt;script&gt;not executable&lt;\/script&gt;/);
});

test('submitted purchases never claim a network failure means no payment or encourage buying again', () => {
  for (const raw of [
    'Your planet purchase was submitted and needs a confirmation check. Do not buy again. RPC unavailable',
    'Devnet recovery test paused after payment submission. Reconcile the saved signature before retrying.',
    'Your purchase is awaiting confirmation. No second purchase was submitted.',
  ]) {
    const result = playerError(new Error(raw), 'Failed');
    assert.match(result.detail, /submitted/i);
    assert.equal(result.phase, 'pending');
    assert.match(result.recovery, /Do not buy again/);
    assert.doesNotMatch(result.detail, /not applied|Nothing was changed|could not be completed/);
  }
});

test('submitted payment status is neutral and nonblocking, never an error dialog', () => {
  const html = render({phase: 'pending', label: 'Purchase pending', detail: 'Purchase submitted. Waiting for confirmation.'});
  assert.match(html, /role="status"/);
  assert.match(html, /PURCHASE STATUS/);
  assert.doesNotMatch(html, /COMMAND NEEDS ATTENTION|Technical details|WHAT TO DO|CLOSE AND REVIEW|aria-modal="true"/);
});

test('intentional pre-payment pause and completed rent recovery have explicit outcomes', () => {
  assert.match(playerError(new Error('Devnet recovery test paused after confirmed approval. No purchase payment was submitted.'), 'Failed').detail, /No payment was sent/);
  assert.match(playerError(new Error('The previous purchase approval expired. Its temporary rent was returned; you can try again.'), 'Failed').detail, /rent was returned/);
});

test('expired signing proofs are neutral and explicitly state that no payment was sent', () => {
  for (const raw of ['Purchase approval expired before submission. No payment was sent.', 'Transaction simulation failed ({"Custom":3007})']) {
    const result = playerError(new Error(raw), 'Failed');
    assert.equal(result.phase, 'pending'); assert.match(result.detail, /No payment was sent/);
  }
});

if (process.argv.includes('--fixtures')) {
  const directory = path.join(__dirname, '../.vercel/ui-check');
  fs.mkdirSync(directory, { recursive: true });
  const css = ['universe-game.css', 'operation-feedback.css'].map(name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8')).join('\n');
  for (const [name, operation] of Object.entries(fixtures)) {
    fs.writeFileSync(path.join(directory, `operation-${name}.html`), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GAMESOL component check</title><style>body{margin:0;background:#071018}' + css + '</style></head><body>' + render(operation) + '</body></html>');
  }
}
