const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

test('live system reuses the developed command UI without enabling unrelated preview wallet flows', () => {
  const game = read('UniverseGame.tsx');
  assert.match(game, /<UniverseLab\s+embedded\s+productionUi\s+initialEmpireOpen=\{false\}/);
  assert.match(game, /const productionPreview = .*pathname === "\/next"/);
});

test('system survey clears only camera selection and keeps renderer fallback intact', () => {
  const map = read('UniverseLab.tsx');
  assert.match(map, /label="Survey system" onClick=\{\(\) => setSelected\(null\)\}/);
  assert.match(map, /onContextLost=\{\(\) => setGraphicsMode\("compat"\)\}/);
  assert.match(map, /<CompatibilityUniverseScene/);
  assert.match(map, /import "\.\/system-command-polish.css"/);
  assert.doesNotMatch(map, /navigationRailOpen|navigation-rail-toggle/);
  assert.match(map, /<div className="navigation-console">/);
});

test('orbital positions reuse a compact desktop strip and two mobile rows with visible keyboard focus', () => {
  const css = read('system-command-polish.css');
  assert.match(css, /grid-template-columns:repeat\(15,minmax\(0,1fr\)\)/);
  assert.match(css, /grid-template-columns:repeat\(8,minmax\(0,1fr\)\)/);
  assert.match(css, /system-orbit-scanner>div>button \{ height:32px;/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /letter-spacing:\s*-/);
});
