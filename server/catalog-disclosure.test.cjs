const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/PlanetWorld.tsx'), 'utf8');
const ast = ts.createSourceFile('world.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function selection(name, args) {
  let initializer;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer; ts.forEachChild(node, visit); };
  visit(ast);
  assert.ok(initializer);
  const compiled = ts.transpileModule(`exports.select = (${args}) => (${initializer.getText(ast)});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const result = {};
  vm.runInNewContext(compiled, { exports: result, Number });
  return result.select;
}
const ships = selection('shipOptions', 'allShipOptions, state, showLockedShips');
const defenses = selection('defenseOptions', 'allDefenseOptions, showLockedDefenses');
test('ship catalog keeps the first fighter, unlocked hulls and owned locked hulls', () => {
  const items = ['lightFighter', 'smallCargo', 'cruiser', 'deathstar'].map(key => ({ ship: { key }, prerequisitesReady: key === 'smallCargo' }));
  assert.deepEqual(Array.from(ships(items, { fleet: { cruiser: 1 } }, false), x => x.ship.key), ['lightFighter', 'smallCargo', 'cruiser']);
  assert.equal(ships(items, { fleet: {} }, true).length, 4);
});
test('defense catalog keeps first defense, unlocked installations and existing defenses', () => {
  const items = ['rocketLauncher', 'lightLaser', 'smallShieldDome', 'gaussCannon'].map(key => ({ item: { key }, prerequisitesReady: key === 'lightLaser', online: key === 'smallShieldDome' ? 1 : 0 }));
  assert.deepEqual(Array.from(defenses(items, false), x => x.item.key), ['rocketLauncher', 'lightLaser', 'smallShieldDome']);
  assert.equal(defenses(items, true).length, 4);
});
test('readiness, inventory and shield totals use unfiltered catalogs', () => {
  assert.match(source, /const shipReadyCount = allShipOptions\.filter/);
  assert.match(source, /const defenseUnitCount = allDefenseOptions\.reduce/);
  assert.match(source, /const activeShieldCount = allDefenseOptions\.filter/);
});
