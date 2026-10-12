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
const { PlanetHeader } = load('PlanetHeader.tsx');
const { ufoProfile, frameAccent, validFrameStyle } = load('ufo-traits.ts');
const { UfoLoadout } = load('UfoLoadout.tsx');

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

test('construction, research and queues retain readiness gates and share the command lock', () => {
  const world = fs.readFileSync(path.join(__dirname, '../src/PlanetWorld.tsx'), 'utf8');
  assert.match(world, /trackCommand\(`building:\$\{building.key\}`/);
  assert.match(world, /trackCommand\('building:shipyard'/);
  assert.match(world, /pendingCommand !== null \|\| queueBusy \|\| shipyardUpgradeBlocked \|\| !shipyardAffordable \|\| !shipyardRequirementsMet/);
  assert.match(world, /trackCommand\(`research:\$\{tech.key\}`/);
  assert.match(world, /pendingCommand !== null \|\| !buildingCommandReady/);
  assert.match(world, /pendingCommand !== null \|\| researchBusy \|\| researchLabUpgrading \|\| !ready/);
  assert.match(world, /pendingCommand !== null \|\| ready/);
  assert.match(world, /pendingCommand !== null \|\| !ready/);
  assert.match(world, /role="progressbar" aria-label=\{`\$\{activeQueue.label\} progress`\}/);
  assert.match(world, /trackCommand\(`queue:finish:\$\{activeQueue.label\}`/);
  assert.match(world, /trackCommand\(`queue:accelerate:\$\{activeQueue.label\}`/);
});

test('live facility layout is independent of preview mode and shows each cost once', () => {
  const world = fs.readFileSync(path.join(__dirname, '../src/PlanetWorld.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../src/command-workspace.css'), 'utf8');
  const start = world.indexOf('{modal === "building" && <section className="pw-building-command">');
  assert.ok(start >= 0);
  const building = world.slice(start, world.indexOf('{modal === "research"', start));
  assert.equal((building.match(/costs\(metalCost, crystalCost, deuteriumCost\)/g) || []).length, 1);
  assert.doesNotMatch(building, /<span>OUTCOME<\/span>/);
  assert.match(css, /\.planet-world \.pw-building-command \.pw-upgrade-brief\{display:grid/);
  assert.match(css, /\.planet-world \.pw-building-command \.pw-facility-status\{display:flex/);
  assert.match(css, /@media\(max-width:480px\)/);
});

test('planet header retains exact bigint values, compact values and labelled system navigation', () => {
  const html = renderToStaticMarkup(React.createElement(PlanetHeader, {
    world: { name: 'Homeworld', galaxy: 9, system: 427, position: 13 },
    resources: { metal: 9007199254740993123n, crystal: 847n, deuterium: 483n, energyProduction: 79n, energyConsumption: 100n },
    energyPercent: 79, energyTone: 'warning', onExit: () => {},
  }));
  assert.ok(html.includes((9007199254740993123n).toLocaleString()));
  assert.match(html, /Return to active planet system/);
  assert.match(html, /pw-resource-exact/); assert.match(html, /pw-resource-compact/);
  assert.match(html, /79 percent available/);
});

test('UFO loadouts use real trait spellings and do not grant rarity-based power', () => {
  const traits = [{ name: 'Body', value: 'Silver UFO' }, { name: 'Eyes', value: 'Small Eyes' }, { name: 'Accesory', value: 'Frown' }, { name: 'Hair', value: 'Tiara' }, { name: 'Background', value: 'VioletBG' }, { name: 'Rarity Rank', value: '1873' }];
  const profile = ufoProfile(traits);
  assert.equal(profile.role, 'Engineer'); assert.equal(profile.route, 'First contact');
  assert.equal(profile.accessory, 'Frown'); assert.equal(profile.hair, 'Tiara');
  assert.equal(profile.booster.status, 'planned'); assert.equal(profile.loot[0].trait, 'Silver UFO');
  const rare = ufoProfile(traits.map(trait => trait.name === 'Rarity Rank' ? { ...trait, value: '1' } : trait));
  assert.equal(rare.role, profile.role); assert.deepEqual(rare.booster, profile.booster);
  assert.deepEqual(traits[2], { name: 'Accesory', value: 'Frown' });
});

test('unknown traits retain a neutral baseline, and frame preferences cannot inject CSS', () => {
  const unknown = ufoProfile([{ name: 'Body', value: 'Unknown future trait' }, { name: 'Eyes', value: 'Toxido Mask' }]);
  assert.equal(unknown.role, 'Commander'); assert.equal(unknown.booster, null); assert.equal(unknown.loot.length, 0);
  assert.equal(unknown.route, 'Standard expedition');
  assert.equal(validFrameStyle('url(evil)'), 'body');
  assert.equal(frameAccent([{ name: 'Background', value: 'url(evil)' }], 'background'), '#84adb3');
  assert.equal(ufoProfile([{ name: 'Eyes', value: '3D  Glasses' }]).route, 'Anomaly analysis');
});

test('real owned-body examples have distinct proposed roles without stacking or claims', () => {
  for (const [body, role] of [['Red UFO', 'Escort'], ['Gold UFO', 'Quartermaster'], ['Blue UFO', 'Navigator']]) {
    const profile = ufoProfile([{ name: 'Body', value: body }]);
    assert.equal(profile.role, role); assert.equal(profile.booster.status, 'planned');
    assert.doesNotMatch(JSON.stringify(profile), /multiplier|tokenAllocation|claimable/);
  }
});

test('commander cosmetics render with tabs and distinguish saved from equipped frames', () => {
  const asset = { id: 'test-only', name: 'Crypto UFO #7541', traits: [{ name: 'Body', value: 'Silver UFO' }] };
  const html = renderToStaticMarkup(React.createElement(UfoLoadout, { asset }));
  assert.match(html, /role="tablist"/); assert.match(html, /role="tabpanel"/);
  assert.match(html, /Body frame/); assert.match(html, /Background frame/); assert.match(html, /Saved frame/);
  assert.match(renderToStaticMarkup(React.createElement(UfoLoadout, { asset, equipped: true })), /Equipped frame/);
  const source = fs.readFileSync(path.join(__dirname, '../src/UfoLoadout.tsx'), 'utf8');
  assert.match(source, /Not active/); assert.match(source, /Not earned/);
  assert.doesNotMatch(source, /sendTransaction|signMessage|claimReward|Math\.random/);
});
