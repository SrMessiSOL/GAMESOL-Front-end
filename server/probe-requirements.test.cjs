const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('probe blueprint matches the active vault byte-handler prerequisite', () => {
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
});
