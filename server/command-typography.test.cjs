const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const read = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');

test('numeric presets and facility tiles override the generic command button layout', () => {
  const css = read('live-command-system.css');
  assert.match(css, /\.pw-command-modal \.command-quantity[^}]+padding:0;white-space:nowrap;overflow-wrap:normal/);
  assert.match(css, /\.pw-command-modal \.pw-facility-grid>button\{display:grid/);
  assert.match(css, /grid-template-columns:64px minmax\(0,1fr\) 18px/);
});

test('the actual report toolbar separates readable heading and count', () => {
  const css = read('live-command-system.css');
  assert.match(css, /\.pw-activity-toolbar>div\{display:grid;gap:6px/);
  assert.match(css, /\.pw-activity-toolbar small\{font:13px/);
  assert.match(css, /\.pw-activity-toolbar\{flex-direction:column;align-items:stretch/);
  const source = read('PlanetWorld.tsx');
  assert.ok(source.includes('<span>Mission history</span>'));
  assert.ok(!source.includes('DEVNET INTELLIGENCE LEDGER'));
});

test('populated fleet forms use spaced readable labels independent of preview mode', () => {
  const css = read('live-command-system.css');
  assert.match(css, /\.pw-fleet-grid label>span\{display:flex;[^}]*gap:12px;font:14px/);
  assert.match(css, /\.pw-launch-grid label>span\{font:500 12px/);
  assert.match(css, /\.pw-launch-section-head\{display:flex/);
});

test('wallet identifiers preserve case instead of uppercasing Solana addresses', () => {
  assert.match(read('wallet-modal.css'), /\.ug-wallet-row b\{[^}]*text-transform:none/);
  assert.ok(read('UniverseGame.tsx').includes('className="ug-wallet-trigger-label"'));
  assert.match(read('game-polish.css'), /\.ug-wallet-trigger-label\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
});

test('quest screens do not expose empty claim masks before the first ledger read', () => {
  const source = read('PlanetWorld.tsx');
  assert.ok(source.includes('const [questsLoading, setQuestsLoading] = useState(true)'));
  assert.ok(source.includes("if (nextModal === 'quests' && game) setQuestsLoading(true)"));
});

test('active queue countdowns do not present browser-mount time as total job progress', () => {
  const source = read('PlanetWorld.tsx');
  const start = source.indexOf('const queueCommand =');
  const end = source.indexOf('const questDefinitions =', start);
  const queue = source.slice(start, end);
  assert.ok(queue.includes('queueTime(seconds)'));
  assert.ok(!queue.includes('queueBaselines'));
  assert.ok(!queue.includes('Math.round(progress)'));
  assert.match(read('live-command-system.css'), /\.pw-queue-progress:not\(\.ready\)\{display:none/);
});

test('real transaction feedback includes spaced next steps and recovery without preview-only styles', () => {
  const css = read('operation-feedback.css');
  assert.doesNotMatch(css, /production-preview/);
  assert.match(css, /\.ug-operation-next,\.ug-operation-recovery\{display:grid;gap:8px/);
  assert.match(css, /\.ug-operation-modal p\{[^}]*font:14px\/1.6/);
  assert.match(css, /\.ug-operation-technical code\{[^}]*white-space:pre-wrap/);
  assert.match(css, /\.ug-operation-backdrop.success\{[^}]*pointer-events:none/);
  assert.match(css, /max-height:calc\(100dvh - 32px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.ok(read('UniverseGame.tsx').includes("import './operation-feedback.css'"));
});

test('market inline styles never restore tiny labels or tracked monospace copy', () => {
  const source = ts.createSourceFile('Markettab.tsx', read('Markettab.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let checked = 0;
  function visit(node) {
    if (ts.isPropertyAssignment(node)) {
      const key = node.name.getText(source);
      const value = node.initializer;
      if (key === 'fontSize' && ts.isNumericLiteral(value)) {
        assert.ok(Number(value.text) >= 12, `Tiny market label at ${node.pos}`);
        checked++;
      }
      if (key === 'letterSpacing' && ts.isNumericLiteral(value)) assert.equal(Number(value.text), 0);
      if (key === 'fontFamily' && ts.isStringLiteral(value)) assert.equal(value.text, 'Outfit, system-ui, sans-serif');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(checked > 50);
});
