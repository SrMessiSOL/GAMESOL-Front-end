const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('public entry isolates wallet initialization while retaining game routing', () => {
  const entry = read('src/main.tsx');
  assert.match(entry, /window\.location\.pathname !== '\/'/);
  assert.match(entry, /import\('\.\/game-bootstrap'\)/);
  assert.match(entry, /document\.documentElement\.classList\.add\('public-document'\)/);
  assert.doesNotMatch(entry, /@lazorkit|game-state|CryptoUfosProvider/);
  const game = read('src/game-bootstrap.tsx');
  for (const route of ['/app', '/founders', '/universe-game', '/sovereignty-lab']) assert.ok(game.includes(route));
  assert.match(game, /LazorkitProvider/);
});

test('public page unlocks native document scrolling without changing game overflow', () => {
  const css = read('src/public-world.css');
  assert.match(css, /html\.public-document\{[^}]*overflow-y:auto/);
  assert.match(css, /html\.public-document body\{[^}]*overflow:visible/);
  assert.match(css, /html\.public-document #root\{[^}]*height:auto/);
  assert.match(css, /\.public-backdrop\{pointer-events:none;touch-action:auto\}/);
});

test('public journey keeps reduced motion, artwork fallback and no signing surface', () => {
  const page = read('src/PublicWorld.tsx');
  assert.match(page, /prefers-reduced-motion: reduce/);
  assert.match(page, /class SceneFallback extends Component/);
  assert.match(page, /webglcontextlost/);
  assert.match(page, /Pause ambient animation/);
  assert.doesNotMatch(page, /signTransaction|sendTransaction|useWallet|fetch\(/);
  for (const id of ['universe', 'galaxy', 'system', 'planet']) assert.ok(page.includes(`id: '${id}'`));
  assert.match(page, /Devnet assets have no monetary value/);
});
