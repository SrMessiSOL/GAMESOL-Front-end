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
const quoteModule = {exports: {}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/alliance-upgrade.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {
  exports: quoteModule.exports,
  require: name => { assert.equal(name, './alliance-contribution'); return {ALLIANCE_BUILDING_MAX_LEVEL:25}; },
});

test('signed SDK quote matches displayed costs for every upgrade level and discount boundaries', () => {
  for (let id=0; id<4; id++) for(let level=0;level<25;level++) for(const trade of [0,1,25]) for(const defense of [0,1,25]) {
    const treasury={logisticsHub:0,researchGrid:0,defenseCoordination:defense,tradeNetwork:trade};
    treasury[['logisticsHub','researchGrid','defenseCoordination','tradeNetwork'][id]]=level;
    const quote=quoteModule.exports.allianceUpgradeQuote(id,treasury);
    const {expectedLevel,...amounts}=quote;
    assert.equal(expectedLevel,level);assert.deepEqual({...amounts},{...cost(id,level+1,treasury)});
  }
});

test('both UI actions bind the displayed quote rather than silently accepting a refreshed higher level', () => {
  const world=fs.readFileSync(path.join(__dirname,'../src/PlanetWorld.tsx'),'utf8');
  assert.ok(world.includes('client.upgradeAllianceBuilding(building.id, { expectedLevel: currentLevel, ...cost })'));
  assert.ok(app.includes('upgradeAllianceBuilding(buildingId, quote)'));
});

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
