const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('probe and colony blueprints match the active backend prerequisites', () => {
  const source = ts.createSourceFile('PlanetWorld.tsx', fs.readFileSync(path.join(__dirname, '../src/PlanetWorld.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'SHIP_REQUIREMENTS') expression = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(expression);
  const requirements = vm.runInNewContext(`(${expression})`);
  assert.deepEqual(JSON.parse(JSON.stringify(requirements.espionageProbe)), [['Shipyard', 'shipyard', 3], ['Computer Technology', 'computerTech', 2]]);
  assert.deepEqual(JSON.parse(JSON.stringify(requirements.colonyShip)), [['Shipyard', 'shipyard', 4], ['Impulse Drive', 'impulseDrive', 3], ['Astrophysics', 'astrophysics', 3]]);
  const legacyUi = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
  assert.match(legacyUi, /colonyShip: \[req\("Shipyard", planet.shipyard, 4\), req\("Impulse Drive", research.impulseDrive, 3\), req\("Astrophysics", research.astrophysics, 3\)\]/);
});

test('both frontend ship requirement tables agree for every hull', () => {
  function initializer(file, name) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let expression;
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer.getText(source);
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(expression, name);
    return expression;
  }
  const current = vm.runInNewContext(`(${initializer('PlanetWorld.tsx', 'SHIP_REQUIREMENTS')})`);
  const zero = new Proxy({}, { get: () => 0 });
  const legacy = vm.runInNewContext(`(${initializer('App.tsx', 'requirementsByShip')})`, {
    planet: zero, research: zero, req: (label, current, required) => [label, required],
  });
  assert.equal(Object.keys(current).length, 14);
  assert.deepEqual(Object.keys(current), Object.keys(legacy));
  for (const [hull, requirements] of Object.entries(current)) {
    assert.deepEqual(JSON.parse(JSON.stringify(requirements.map(([label, field, required]) => [label, required]))), JSON.parse(JSON.stringify(legacy[hull])), hull);
  }
});
