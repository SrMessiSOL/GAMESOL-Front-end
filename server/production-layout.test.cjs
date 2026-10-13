const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '../src/command-workspace.css'), 'utf8');
test('live production metrics and quantity control have layout independent of preview mode', () => {
  assert.match(css, /\.planet-world \.pw-shipyard-overview\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.planet-world \.pw-production-control\{display:grid/);
  assert.match(css, /\.planet-world \.pw-command-section-title>div\{display:grid;gap:6px/);
  assert.match(css, /\.planet-world \.pw-shipyard-overview\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('live production actions preserve readable disabled and keyboard focus states', () => {
  assert.match(css, /\.command-action:disabled\{opacity:1;color:#93a6ad;background:#15232b/);
  assert.match(css, /\.command-action:focus-visible\{outline:2px solid/);
  assert.match(css, /\.pw-card-readiness\{[^}]*font:500 11px/);
});
test('shared live command layer covers every previously preview-only overview and raw action', () => {
  const shared = fs.readFileSync(path.join(__dirname, '../src/live-command-system.css'), 'utf8');
  for (const name of ['pw-research-overview', 'pw-defense-overview', 'pw-quest-overview', 'pw-intelligence-overview', 'pw-alliance-recruitment-status', 'market-status-strip']) assert.ok(shared.includes(`.${name}`));
  assert.doesNotMatch(shared, /production-preview/);
  assert.match(shared, /\.pw-command-modal button\{[^}]*min-height:44px/);
  assert.match(shared, /prefers-reduced-motion:reduce/);
  assert.match(shared, /\.pw-command-modal button:disabled/);
  assert.match(shared, /max-width:640px/);
  assert.match(shared, /:has\(\.pw-command-modal\) \.pw-wallet-trigger\{visibility:hidden;pointer-events:none/);
});
