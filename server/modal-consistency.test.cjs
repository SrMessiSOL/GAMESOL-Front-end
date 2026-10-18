const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const compile = text => ts.transpileModule(text, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
const focus = {};
vm.runInNewContext(compile(fs.readFileSync(require.resolve('../src/command-focus.ts'), 'utf8')), {exports: focus});
function control(label, {connected = true, visible = true, disabled = false} = {}) {
  return {isConnected: connected, hasAttribute: name => name === 'disabled' && disabled,
    getAttribute: () => label, getClientRects: () => visible ? [{}] : [], focused: false,
    focus() {this.focused = true;}};
}
test('focus returns to original command opener when available', () => {
  const opener = control('Research'), fallback = control('More planet operations');
  focus.restorePlanetCommandFocus(opener, {querySelectorAll: () => [fallback]}, 'research');
  assert(opener.focused); assert(!fallback.focused);
});
test('remounted command button receives focus instead of the disconnected opener', () => {
  const opener = control('Research', {connected: false}), replacement = control('Research');
  focus.restorePlanetCommandFocus(opener, {querySelectorAll: () => [replacement]}, 'research');
  assert(replacement.focused);
});
test('hidden mobile commands and removed More-menu items return focus to More', () => {
  const opener = control('Store', {connected: false}), hidden = control('Store', {visible: false}), more = control('More planet operations');
  focus.restorePlanetCommandFocus(opener, {querySelectorAll: () => [hidden, more]}, 'store');
  assert(more.focused); assert(!hidden.focused);
});
test('facility details fall back to Buildings and removed scene never steals focus', () => {
  const buildings = control('Buildings, recommended next objective');
  focus.restorePlanetCommandFocus(null, {querySelectorAll: () => [buildings]}, 'building');
  assert(buildings.focused);
  focus.restorePlanetCommandFocus(control('old', {connected:false}), null, 'research');
});

const file = fs.readFileSync(require.resolve('../src/UniverseGame.tsx'), 'utf8');
const ast = ts.createSourceFile('UniverseGame.tsx', file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert(result); return result;
}
function balances() {
  const values = [], mintValues = [], pending = [];
  const context = {module: {exports: {}}, publicKey: {toBase58: () => 'A'},
    balanceWalletRef: {current:'A'}, tokenBalanceRequestRef: {current:0}, solBalanceRequestRef:{current:0},
    client: {getGameConfig: async () => ({antimatterMint:'AM'}), getStoreConfig: async () => ({usdcMint:'USDC'}), getVaultBalanceLamports: async () => {throw Error('offline');}},
    TOKEN_PROGRAM_ID: 'token', connection: {getParsedTokenAccountsByOwner: () => new Promise(resolve => pending.push(resolve))},
    setAntimatterBalance: value => values.push(['AM',value]), setUsdcBalance: value => values.push(['USDC',value]),
    setAntimatterMint: value => mintValues.push(value), setUsdcMint: value => mintValues.push(value), setVaultBalance: value => values.push(['SOL',value]), Map, BigInt};
  vm.runInNewContext(compile(`module.exports = ${callback('refreshWalletTokenBalances')};`), context);
  return {context, values, mintValues, pending, refresh: context.module.exports};
}
const response = amount => ({value:[{account:{data:{parsed:{info:{mint:'AM',tokenAmount:{amount}}}}}}]});
test('token refresh applies the latest response only', async () => {
  const f = balances(); const first = f.refresh(); await new Promise(setImmediate);
  const second = f.refresh(); await new Promise(setImmediate);
  f.pending[1](response('20')); await second; f.pending[0](response('10')); await first;
  assert.deepEqual(f.values, [['AM',20n],['USDC',0n]]);
});
test('old account token response cannot overwrite the newly selected account', async () => {
  const f = balances(); const request = f.refresh(); await new Promise(setImmediate);
  f.context.balanceWalletRef.current = 'B'; f.pending[0](response('10')); await request;
  assert.equal(f.values.length,0); assert.equal(f.mintValues.length,0);
});
test('failed SOL refresh preserves the last confirmed balance', async () => {
  const f = balances(); vm.runInNewContext(compile(`module.exports = ${callback('refreshVaultBalance')};`), f.context);
  await f.context.module.exports(); assert.equal(f.values.length,0);
});
test('actual funds cleanup restores the wallet trigger when Manage Funds was unmounted', () => {
  const funds = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'FundsModal');
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes('fallbackFocusTo')) effect = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(funds); assert(effect);
  const fallback = control('wallet'), tasks = [];
  const context = {module:{exports:{}}, document:{body:{style:{overflow:''}}},
    window:{requestAnimationFrame:()=>1,cancelAnimationFrame(){},addEventListener(){},removeEventListener(){}},
    closeRef:{current:null},modalRef:{current:null},busyRef:{current:false},onClose(){},
    returnFocusTo:control('removed', {connected:false}),fallbackFocusTo:()=>fallback,
    queueMicrotask:task=>tasks.push(task)};
  vm.runInNewContext(compile(`module.exports = ${effect};`),context);
  const cleanup = context.module.exports(); cleanup(); tasks.forEach(task=>task());
  assert(fallback.focused); assert.equal(context.document.body.style.overflow,'');
});
test('opening account/funds and successful market/recovery paths request balance refresh', () => {
  assert.match(file, /\[walletMenuOpen, fundsOpen, balanceRefreshVersion, refreshVaultBalance, refreshWalletTokenBalances\]/);
  assert.match(file, /if \(status === 'confirmed'\)[\s\S]*?setBalanceRefreshVersion/);
  assert.match(file.slice(file.indexOf('marketControls={{')), /Marketplace transaction confirmed\.[\s\S]*?setBalanceRefreshVersion/);
});
test('cargo labels, limits and mission preflight use the same projected resource object as the header', () => {
  const source = fs.readFileSync(require.resolve('../src/PlanetWorld.tsx'), 'utf8');
  assert.match(source, /const resource = projectResources\(state.resources, nowTs\)/);
  assert.match(source, /resources=\{resource\}/);
  assert.match(source, /max=\{resource\[field\]\.toString\(\)\}/);
  assert.match(source, /\{resource\[field\]\.toLocaleString\(\)\} available/);
  assert.match(source, /missionResourcesValid =[^;]*resource.metal[^;]*resource.crystal[^;]*resource.deuterium/);
  assert.match(source, /queueMicrotask\(\(\) => \{\s*restorePlanetCommandFocus/);
});
test('actual cargo markup renders projected limits exactly, including large bigint balances', () => {
  const source = fs.readFileSync(require.resolve('../src/PlanetWorld.tsx'), 'utf8');
  const tree = ts.createSourceFile('PlanetWorld.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let grid;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(attribute =>
      ts.isJsxAttribute(attribute) && attribute.name.text === 'className' && attribute.initializer?.text === 'pw-launch-grid pw-cargo-grid')) grid = node.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree); assert(grid);
  const context = {module:{exports:{}}, require};
  context.exports = context.module.exports;
  vm.runInNewContext(ts.transpileModule(`module.exports = ({resource, missionCargo, setMissionCargo}) => (${grid});`,
    {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, jsx:ts.JsxEmit.ReactJSX}}).outputText, context);
  const React = require('react');
  const resource = {metal:9007199254740993n,crystal:42n,deuterium:99n};
  const html = require('react-dom/server').renderToStaticMarkup(React.createElement(context.module.exports,
    {resource, missionCargo:{metal:'',crystal:'',deuterium:''},setMissionCargo(){}}));
  assert.match(html, /max="9007199254740993"/);
  assert(html.includes(`${resource.metal.toLocaleString()} available`));
  assert.match(html, /max="42"/); assert.match(html, /max="99"/);
});
