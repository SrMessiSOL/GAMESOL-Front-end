const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/UniverseGame.tsx'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../src/wallet-modal.css'), 'utf8');
test('live account dialog is wired to existing focus and dismissal controls', () => {
  assert.match(source, /ref=\{accountDrawerRef\} id="live-player-account"[^>]*role="dialog" aria-modal="true" aria-labelledby="live-player-account-title"/);
  assert.match(source, /ref=\{playerTriggerRef\}[\s\S]*?aria-controls="live-player-account"/);
  assert.match(source, /keepFocusInsideDialog\(event, accountDrawerRef.current\)/);
  const legacy = source.slice(source.indexOf('id="live-player-account"'), source.indexOf('document.body,', source.indexOf('id="live-player-account"')));
  assert.equal((legacy.match(/>SIGN OUT<\/button>/g) || []).length, 1);
  assert.equal((legacy.match(/CHECK SPONSOR/g) || []).length, 1);
  assert.match(legacy, /ref=\{accountCloseRef\}[^>]*aria-label="Close player account"/);
});
test('wallet layout is viewport bounded, scrollable, and readable without preview mode', () => {
  assert.match(css, /max-height:calc\(100dvh - 32px\)!important/);
  assert.match(css, /overflow-y:auto!important/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /focus-visible/);
  assert.match(css, /@media\(max-width:600px\)/);
  assert.doesNotMatch(css, /production-preview/);
});
