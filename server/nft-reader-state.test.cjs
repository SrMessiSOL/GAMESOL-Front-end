const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Buffer } = require('buffer');

function compile(name) {
  return ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', name), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
const viewModule = { exports: {} };
vm.runInNewContext(compile('nft-reader-state.ts'), { exports: viewModule.exports, Date, Infinity });
const { nftReaderView } = viewModule.exports;
const restorationModule = { exports: {} };
vm.runInNewContext(compile('commander-restoration.ts'), { exports: restorationModule.exports });
const { restoredCommanderAsset } = restorationModule.exports;
const file = fs.readFileSync(path.join(__dirname, '../src/CryptoUfos.tsx'), 'utf8');
const ast = ts.createSourceFile('reader.tsx', file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CryptoUfosProvider');
const providerCode = ts.transpileModule(provider.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const asset = { id: 'owned-ufo', name: 'Owned UFO', image: '/test-only-real-art.png', traits: [] };
const account = address => ({ address, chains: ['solana:mainnet'], features: ['solana:signMessage'] });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

// Execute the provider's actual hooks and async callbacks without a browser wallet.
function fixture(chain = {record: null}) {
  const hooks = [], effects = [], requests = [], reads = [], storage = new Map();
  let cursor = 0, dirty = false, now = 1000000, listener, focus, signatureGate, saves = 0, saveError;
  const game = {getConnection: () => ({getGenesisHash: async () => 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'})};
  const wallet = { name: 'Solflare', chains: ['solana:mainnet'], accounts: [account('holder-a')], features: {
    'standard:connect': { connect: async () => ({ accounts: wallet.accounts }) },
    'standard:events': { on: (_, callback) => { listener = callback; return () => { listener = null; }; } },
    'solana:signMessage': { signMessage: async ({ message }) => { if (signatureGate) await signatureGate.promise; return [{ signedMessage: message, signature: Buffer.alloc(64) }]; } },
  } };
  const state = (initial) => {
    const index = cursor++;
    if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
    return [hooks[index].value, value => { const next = typeof value === 'function' ? value(hooks[index].value) : value; if (next !== hooks[index].value) { hooks[index].value = next; dirty = true; } }];
  };
  const ref = initial => { const index = cursor++; return hooks[index] ||= { current: initial }; };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const callback = (value, deps) => { const index = cursor++; if (!sameDeps(hooks[index]?.deps, deps)) hooks[index] = { value, deps }; return hooks[index].value; };
  const effect = (value, deps) => { const index = cursor++; if (!sameDeps(hooks[index]?.deps, deps)) { const old = hooks[index]; hooks[index] = { deps, cleanup: old?.cleanup }; effects.push(() => { hooks[index].cleanup?.(); hooks[index].cleanup = value(); }); } };
  const target = { exports: {} };
  const api = async body => {
    requests.push(body);
    if (body.action === 'ufo-status') return { enabled: true };
    if (body.action === 'owner-assets') return reads.length ? reads.shift()(body) : { owner: body.owner, assets: [asset], checkedAt: now, identityVerified: false };
    if (body.action === 'ufo-challenge') return { challengeToken: 'challenge', message: 'ownership-only-message' };
    if (body.action === 'ufo-verify') return { utilityToken: 'server-authorized-token', expiresAt: now + 3600000 };
    if (body.action === 'ufo-commander-attest') return {proof: {asset: asset.id}};
    throw Error('Unexpected test request');
  };
  const context = { exports: target.exports, require, Context: { Provider: 'provider' }, useState: state, useRef: ref, useCallback: callback, useEffect: effect,
    getWallets: () => ({ get: () => [wallet], on: () => () => {} }),
    connectHoldingWallet: async (value, silent) => { const result = await value.features['standard:connect'].connect({ silent }); const a = result.accounts[0]; if (!a) throw Error('Disconnected'); return a; },
    holdingAccount: accounts => accounts.find(value => value.chains.includes('solana:mainnet')) || null,
    cryptoUfosRequest: api, restoredCommanderAsset, nftReaderView: (link, busy, error) => nftReaderView(link, busy, error, now),
    fetchCommanderIdentity: async () => chain.record,
    saveCommanderSelection: async (_game, commander, id, attest, assertCurrent) => {
      if (id) await attest(); assertCurrent();
      if (saveError) throw saveError;
      saves++;
      chain.record = {commander, owner: id ? wallet.accounts[0].address : 'zero', asset: id ?? 'zero', nonce: (chain.record?.nonce ?? 0n) + 1n, verifiedAt: id ? 1n : 0n};
      return chain.record;
    },
    savedPreference: key => storage.get(key) ?? null, savePreference: (key, value) => value === null ? storage.delete(key) : storage.set(key, value),
    selectionKey: owner => `selection:${owner}`, READER_WALLET: 'reader', Buffer, TextEncoder, Number, Error,
    Date: class extends Date { static now() { return now; } },
    document: { visibilityState: 'visible' },
    window: { setInterval: () => 1, clearInterval: () => {}, addEventListener: (name, fn) => { if (name === 'focus') focus = fn; }, removeEventListener: () => {} },
    clearInterval: () => {},
  };
  vm.runInNewContext(providerCode, context);
  let current;
  function render() {
    for (let n = 0; n < 10; n++) {
      cursor = 0; dirty = false;
      current = target.exports.CryptoUfosProvider({ children: null }).props.value;
      while (effects.length) effects.shift()();
      if (!dirty) return current;
    }
    throw Error('Provider test render did not settle');
  }
  async function settle() { for (let n = 0; n < 8; n++) await Promise.resolve(); return render(); }
  async function bind(commander = 'commander') { render().bindGame(game, commander); await settle(); await settle(); }
  async function connected() { await bind(); await render().connect(wallet); await settle(); await render().assign(asset.id); await settle(); return render(); }
  return { render, settle, bind, connected, wallet, requests, reads, storage, chain, saveCount: () => saves, failSave: error => { saveError = error; },
    change: address => { wallet.accounts = address ? [account(address)] : []; listener?.({ accounts: wallet.accounts }); },
    focus: () => focus?.(), setNow: value => { now = value; },
    holdSignature: () => { signatureGate = deferred(); return signatureGate; },
  };
}

test('holding wallet account restoration reselects the on-chain avatar after a wallet event', async () => {
  const f = fixture(); await f.connected();
  f.change('holder-b'); await f.settle(); await f.settle();
  assert.equal(f.render().flagship, null);
  f.change('holder-a'); await f.settle(); await f.settle();
  assert.equal(f.render().flagship?.id, asset.id);
  assert.equal(f.saveCount(), 1, 'Restoring must not submit another avatar save');
});

test('cached real portrait remains visible while ownership is checking, failed or expired, but utility is blocked', () => {
  const link = { assets: [asset], selectedAsset: asset.id, checkedAt: 1000 };
  for (const [busy, error, now, status] of [[true, '', 1010, 'checking'], [false, 'RPC unavailable', 1010, 'unavailable'], [false, '', 121000, 'expired']]) {
    const result = nftReaderView(link, busy, error, now);
    assert.equal(result.flagship, asset); assert.equal(result.ownershipReady, false); assert.equal(result.ownershipStatus, status);
  }
  assert.equal(nftReaderView(link, false, '', 1010).ownershipReady, true);
  assert.equal(nftReaderView(link, false, '', 999).ownershipReady, false);
});

test('same-wallet refresh retains portrait and selection throughout a delayed ownership response', async () => {
  const f = fixture(); const ready = await f.connected(); const pending = deferred();
  f.reads.push(() => pending.promise);
  const read = ready.refresh(); await f.settle();
  assert.equal(f.render().flagship.id, asset.id); assert.equal(f.render().ownershipStatus, 'checking'); assert.equal(f.render().ownershipReady, false);
  pending.resolve({ owner: 'holder-a', assets: [asset], checkedAt: 1000000, identityVerified: false }); await read; await f.settle();
  assert.equal(f.render().flagship.id, asset.id); assert.equal(f.render().ownershipReady, true);
});

test('temporary read failure preserves cosmetic identity, blocks authorization, and recovers without losing selection', async () => {
  const f = fixture(); await f.connected(); f.reads.push(async () => { throw Error('DAS unavailable'); });
  await f.render().refresh(); await f.settle();
  assert.equal(f.render().flagship.id, asset.id); assert.equal(f.render().ownershipReady, false);
  await assert.rejects(f.render().verifyUtility('commander', asset.id), /Refresh ownership/);
  await f.render().refresh(); await f.settle();
  assert.equal(f.render().flagship.id, asset.id); assert.equal(f.render().ownershipReady, true);
});

test('confirmed NFT sale removes the avatar and saved selection, not just utility eligibility', async () => {
  const f = fixture(); await f.connected();
  f.reads.push(async body => ({ owner: body.owner, assets: [], checkedAt: 1000000, identityVerified: false }));
  await f.render().refresh(); await f.settle();
  assert.equal(f.render().flagship, null); assert.equal(f.render().link.selectedAsset, null); assert.equal(f.storage.has('selection:holder-a'), false);
  await assert.rejects(f.render().verifyUtility('commander', asset.id), /choose an owned/);
});

test('wallet change clears the old portrait immediately and ignores its late ownership response', async () => {
  const f = fixture(); await f.connected(); const old = deferred(); const next = deferred();
  f.reads.push(() => old.promise, () => next.promise);
  const read = f.render().refresh(); await f.settle(); const epoch = f.render().ownershipEpoch;
  f.change('holder-b'); await f.settle();
  assert.equal(f.render().flagship, null); assert.ok(f.render().ownershipEpoch > epoch);
  next.resolve({ owner: 'holder-b', assets: [], checkedAt: 1000000, identityVerified: false }); await f.settle();
  old.resolve({ owner: 'holder-a', assets: [asset], checkedAt: 1000000, identityVerified: false }); await read; await f.settle();
  assert.equal(f.render().link.owner, 'holder-b'); assert.equal(f.render().flagship, null);
});

test('disconnect keeps the saved portrait but revokes holder authorization, reconnect rechecks ownership', async () => {
  const f = fixture(); await f.connected(); const epoch = f.render().ownershipEpoch;
  f.render().unlink(); await f.settle();
  assert.equal(f.render().flagship.id, asset.id); assert.equal(f.render().holdingConnected, false); assert.ok(f.render().ownershipEpoch > epoch);
  await assert.rejects(f.render().verifyUtility('commander', asset.id), /Reconnect/);
  await f.render().connect(f.wallet); await f.settle();
  assert.equal(f.render().flagship.id, asset.id); assert.equal(f.render().ownershipReady, true);
});

test('wallet switch while a holding signature is pending cannot restore an old utility token', async () => {
  const f = fixture(); await f.connected(); const gate = f.holdSignature();
  const verified = f.requests.filter(value => value.action === 'ufo-verify').length;
  const auth = f.render().verifyUtility('commander', asset.id); await f.settle();
  f.change('holder-b'); await f.settle(); gate.resolve();
  await assert.rejects(auth, /Holding wallet changed/);
  assert.equal(f.requests.filter(value => value.action === 'ufo-verify').length, verified);
});

test('commander selection change while signing invalidates the previous UFO authorization', async () => {
  const f = fixture(); await f.connected(); const gate = f.holdSignature();
  const auth = f.render().verifyUtility('commander', asset.id); await f.settle();
  await f.render().assign(null); await f.settle(); gate.resolve();
  await assert.rejects(auth, /Holding wallet changed/);
});

test('a same-account wallet event refreshes ownership without unnecessarily resetting authorization scope', async () => {
  const f = fixture(); await f.connected(); const epoch = f.render().ownershipEpoch;
  f.change('holder-a'); await f.settle();
  assert.equal(f.render().ownershipEpoch, epoch); assert.equal(f.render().flagship.id, asset.id);
});

test('owner response mismatch fails closed and cannot replace the verified holding wallet', async () => {
  const f = fixture(); await f.connected();
  f.reads.push(async () => ({ owner: 'holder-b', assets: [asset], checkedAt: 1000000, identityVerified: false }));
  await f.render().refresh(); await f.settle();
  assert.equal(f.render().link.owner, 'holder-a'); assert.equal(f.render().ownershipReady, false);
  assert.match(f.render().error, /another holding wallet/);
});

test('silent restore reads current mainnet ownership and never authorizes utility or sends a game command', async () => {
  const chain = {record: {commander:'commander',owner:'holder-a',asset:asset.id,nonce:1n,verifiedAt:1n}};
  const f = fixture(chain); await f.bind();
  assert.equal(f.render().flagship.id, asset.id);
  assert.equal(f.requests.some(value => ['ufo-challenge', 'ufo-verify', 'ufo-attest'].includes(value.action)), false);
  assert.equal(f.render().holdingConnected, false); assert.equal(f.saveCount(), 0);
});

test('a fresh browser restores only the on-chain selection, never a local preference', async () => {
  const first = fixture(); await first.connected();
  const second = fixture(first.chain); await second.bind();
  assert.equal(second.storage.size, 0); assert.equal(second.render().flagship.id, asset.id);
  assert.equal(second.saveCount(), 0);
  await first.render().assign(null); await first.settle();
  const third = fixture(first.chain); third.storage.set('selection:holder-a', asset.id); await third.bind();
  assert.equal(third.render().flagship, null);
});

test('failed save retains the last confirmed selection and reports an actionable error', async () => {
  const f = fixture(); await f.connected(); f.failSave(Error('Quick Play is off. Turn it on first.'));
  await f.render().assign(null); await f.settle();
  assert.equal(f.render().flagship.id, asset.id); assert.match(f.render().error, /Quick Play/);
  assert.equal(f.saveCount(), 1);
});

test('wallet change during avatar signing stops submission and duplicate clicks cannot save twice', async () => {
  const f = fixture(); await f.connected(); const baseline = f.saveCount();
  const gate = f.holdSignature(); const save = f.render().assign(asset.id); await f.settle();
  await f.render().assign(asset.id); assert.equal(f.saveCount(), baseline);
  f.change('holder-b'); await f.settle(); gate.resolve(); await save; await f.settle();
  assert.equal(f.saveCount(), baseline); assert.equal(f.render().flagship, null);
});

test('a saved avatar cleared elsewhere disappears on refresh without reconnecting a wallet', async () => {
  const chain = {record: {commander:'commander',owner:'holder-a',asset:asset.id,nonce:1n,verifiedAt:1n}};
  const f = fixture(chain); await f.bind(); assert.equal(f.render().flagship.id,asset.id);
  chain.record = {...chain.record,asset:'zero',verifiedAt:0n,nonce:2n};
  await f.render().refresh(); await f.settle(); assert.equal(f.render().flagship,null);
  assert.equal(f.saveCount(),0);
});
