const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/resource-projection.ts'), 'utf8');
const compiled = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: compiled, Number, BigInt, Math });
const project = compiled.projectResources;
const base = { metal: 10n, crystal: 20n, deuterium: 75n, metalHour: 100n, crystalHour: 100n, deuteriumHour: 100n, metalCap: 10000n, crystalCap: 10000n, deuteriumCap: 10000n, energyProduction: 79n, energyConsumption: 100n, lastUpdateTs: 1000 };
test('accrued resources unlock affordability using program integer energy scaling', () => {
  const value = project(base, 4600);
  assert.equal(value.deuterium, 154n);
  assert.equal(value.metal, 89n);
  assert.equal(base.deuterium, 75n);
  assert.equal(value.lastUpdateTs, 1000);
});
test('projection caps elapsed settlement at one day and storage limits', () => {
  assert.equal(project(base, 1000 + 86400 * 3).metal, 1906n);
  assert.equal(project({ ...base, metalCap: 15n }, 4600).metal, 15n);
});
test('zero consumption allows full production; future timestamps cannot grant resources', () => {
  assert.equal(project({ ...base, energyConsumption: 0n }, 4600).deuterium, 175n);
  assert.equal(project(base, 999), base);
  assert.equal(project(base, NaN), base);
});
test('large balances remain exact and saturating production matches u64 arithmetic', () => {
  const max = (1n << 64n) - 1n;
  const value = project({ ...base, metal: 9007199254740993n, metalCap: max }, 4600);
  assert.equal(value.metal, 9007199254741072n);
  assert.equal(project({ ...base, metal: 0n, metalHour: max, metalCap: max }, 4600).metal, max / 3600n / 10000n);
});
