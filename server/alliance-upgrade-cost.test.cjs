const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const app = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
const ast = ts.createSourceFile('app.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['allianceBuildingCost', 'applyBpsDiscount', 'allianceBoosts', 'discountedAllianceBuildingCost'];
const code = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(ast)).join('\n');
const target = {exports: {}};
vm.runInNewContext(ts.transpileModule(code, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports:target.exports});
const cost = target.exports.discountedAllianceBuildingCost;

test('research upgrade quote matches level-one Trade and Defense on-chain discounts', () => {
  const actual = cost(1, 2, {tradeNetwork:1,defenseCoordination:1});
  assert.deepEqual({...actual}, {metal:7920n,crystal:19800n,deuterium:7880n,antimatter:148500000n});
});
test('unboosted quotes preserve base prices and discounts round down in resource units', () => {
  const base = cost(1, 2, null);
  assert.deepEqual({...base}, {metal:8000n,crystal:20000n,deuterium:8000n,antimatter:150000000n});
  vm.runInNewContext(ts.transpileModule(code + '\nexports.discount = applyBpsDiscount;', {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports:target.exports});
  assert.equal(target.exports.discount(101n,100),100n);
});
test('both game views use the same treasury-aware upgrade quote', () => {
  const world = fs.readFileSync(path.join(__dirname, '../src/PlanetWorld.tsx'), 'utf8');
  assert.ok(world.includes('discountedAllianceBuildingCost(building.id, currentLevel + 1, allianceTreasury)'));
  assert.ok(app.includes('discountedAllianceBuildingCost(building.id, current + 1, allianceTreasury)'));
});
