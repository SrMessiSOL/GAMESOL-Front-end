const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cache = new Map();

function load(name) {
  const filename = path.resolve(__dirname, '../src', name);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const dependency = (request) => {
    if (request.endsWith('.css')) return {};
    if (request.endsWith('.svg')) return request;
    if (!request.startsWith('.')) return require(request);
    const absolute = path.resolve(path.dirname(filename), request);
    const target = ['.tsx', '.ts'].map((suffix) => absolute + suffix).find((file) => fs.existsSync(file));
    return load(path.relative(path.resolve(__dirname, '../src'), target));
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: dependency }, { filename });
  return module.exports;
}

const { isWholeQuantity, formatUsdc, storePurchaseEligibility, MAX_ORDER_QUANTITY } = load('command-validation.ts');
const { STORE_PACKS } = load('store-catalog.ts');
const { CommandActionButton, CommandQuantity } = load('design-system/command-controls.tsx');
const { StorePackCard } = load('StoreControls.tsx');

test('orders accept only whole quantities within the serialized u32 bounds', () => {
  for (const value of ['1', '5', 10, MAX_ORDER_QUANTITY]) assert.equal(isWholeQuantity(value), true);
  for (const value of ['', '1.5', '1e3', 1.5, 0, -1, Infinity, NaN, MAX_ORDER_QUANTITY + 1]) assert.equal(isWholeQuantity(value), false);
  assert.equal(isWholeQuantity(0, 0, 10), true);
  assert.equal(isWholeQuantity(11, 0, 10), false);
});

test('USDC display preserves exact micro-units and balances above Number.MAX_SAFE_INTEGER', () => {
  assert.equal(formatUsdc(1_000_000n), '1');
  assert.equal(formatUsdc(7_500_000n), '7.5');
  assert.equal(formatUsdc(1n), '0.000001');
  assert.equal(formatUsdc(9_007_199_254_740_993n), '9,007,199,254.740993');
});

test('purchases stay blocked while pending, unavailable, bought, or unaffordable', () => {
  const ready = { enabled: true, purchased: false, balance: 1_000_000n, price: 1_000_000n };
  assert.equal(storePurchaseEligibility(ready).allowed, true);
  assert.equal(storePurchaseEligibility({ ...ready, balance: 999_999n }).label, 'Insufficient USDC');
  assert.equal(storePurchaseEligibility({ ...ready, enabled: false }).allowed, false);
  assert.equal(storePurchaseEligibility({ ...ready, purchased: true }).label, 'Purchased');
  assert.equal(storePurchaseEligibility({ ...ready, pending: true }).allowed, false);
});

test('pending action buttons disable submission and expose progress without changing their icon slot', () => {
  const ready = renderToStaticMarkup(React.createElement(CommandActionButton, null, 'Build 5'));
  const pending = renderToStaticMarkup(React.createElement(CommandActionButton, { pending: true, pendingLabel: 'Commissioning...' }, 'Build 5'));
  assert.match(ready, /aria-busy="false"/);
  assert.doesNotMatch(ready, /disabled=""/);
  assert.match(pending, /disabled=""/);
  assert.match(pending, /aria-busy="true"/);
  assert.match(pending, /Commissioning/);
  assert.match(ready, /command-action-icon/);
  assert.match(pending, /command-action-icon/);
});

test('quantity controls have labelled icon buttons, presets, and input bounds', () => {
  const html = renderToStaticMarkup(React.createElement(CommandQuantity, { label: 'Fleet production quantity', value: 1, onChange() {}, onValidityChange() {} }));
  assert.match(html, /aria-label="Decrease fleet production quantity"/);
  assert.match(html, /aria-label="Increase fleet production quantity"/);
  assert.match(html, /max="4294967295"/);
  assert.match(html, /step="1"/);
  assert.match(html, /aria-pressed="true"/);
});

test('store cards use original USDC artwork, do not show zero rewards, and never buy on the first click', () => {
  const pack = STORE_PACKS.find((pack) => pack.group === 'Daily' && pack.id === 16);
  const html = renderToStaticMarkup(React.createElement(StorePackCard, {
    pack, balance: 3_000_000n, worldName: 'Test-only destination', purchased: false, resetLabel: 'in 1h', onReview() {},
  }));
  assert.match(html, /usdc\.svg/);
  assert.match(html, /Review purchase/);
  assert.doesNotMatch(html, />0<|>Buy now</);
  assert.match(html, /6h/);
  const blocked = renderToStaticMarkup(React.createElement(StorePackCard, {
    pack, balance: 0n, worldName: 'Test-only destination', purchased: false, resetLabel: 'in 1h', onReview() {},
  }));
  assert.match(blocked, /Insufficient USDC/);
  assert.match(blocked, /disabled=""/);
});

test('every catalog pack retains the transaction client price after catalog extraction', () => {
  const text = fs.readFileSync(path.join(__dirname, '../src/game-state.ts'), 'utf8');
  const tree = ts.createSourceFile('game-state.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'storePackPriceUsdc');
  assert.ok(node);
  const compiled = ts.transpileModule(node.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = {}; vm.runInNewContext(compiled, context);
  for (const pack of STORE_PACKS) assert.equal(pack.priceUsdc, context.storePackPriceUsdc(pack.period, pack.id), pack.title);
});

test('world integration preserves global transaction results and rejects stale store reads', () => {
  const world = fs.readFileSync(path.join(__dirname, '../src/PlanetWorld.tsx'), 'utf8');
  assert.match(world, /request !== storeReadRevision\.current/);
  assert.match(world, /setStoreError\('The store could not be loaded/);
  assert.match(world, /commandLock\.current = true/);
  assert.match(world, /disabled=\{busy \|\| pendingCommand !== null \|\| missionChecking\}/);
  assert.match(world, /missionError \|\| \(canLaunchMission/);
  assert.match(world, /<StorePurchaseReview/);
  assert.doesNotMatch(world, /setCommandError\(['"]Purchase confirmed/);
});
