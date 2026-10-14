const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
test('colony remaining accounts match reward targets, owner index, registry contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/game-state.ts'), 'utf8');
  const ast = ts.createSourceFile('game-state.ts', source, ts.ScriptTarget.Latest, true);
  let method;
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'resolveColonize') method = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const arrays = [];
  function collect(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'keys' && ts.isArrayLiteralExpression(node.initializer)) arrays.push(node.initializer);
    ts.forEachChild(node, collect);
  }
  collect(method);
  assert.equal(arrays.length, 1);
  const names = arrays[0].elements.map(element => element.properties.find(p => p.name?.getText(ast) === 'pubkey').initializer.getText(ast));
  assert.equal(names[11], 'SystemProgram.programId');
  assert.deepEqual(names.slice(12), ['questRewardTargetsPda', 'ownerIndexPda', 'ownershipRegistryPda']);
});
