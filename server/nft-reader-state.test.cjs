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
const { restoredCommanderAsset, savedCommanderPortrait } = restorationModule.exports;
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
  let cursor = 0, dirty = false, now = 1000000, listener, focus, signatureGate, utilityGate, saves = 0, saveError;
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
    if (body.action === 'ufo-linked-verify') {
      if (utilityGate) await utilityGate.promise;
      if (!chain.record || chain.record.verifiedAt <= 0n || chain.record.owner !== body.owner
        || chain.record.asset !== body.asset || chain.record.commander !== body.commander) throw Error('Saved commander changed');
      return {utilityToken:'linked-server-token',expiresAt:now+3600000};
    }
    if (body.action === 'ufo-commander-attest') return {proof: {asset: asset.id}};
    throw Error('Unexpected test request');
  };
  const context = { exports: target.exports, require, Context: { Provider: 'provider' }, useState: state, useRef: ref, useCallback: callback, useEffect: effect,
    getWallets: () => ({ get: () => [wallet], on: () => () => {} }),
    connectHoldingWallet: async (value, silent) => { const result = await value.features['standard:connect'].connect({ silent }); const a = result.accounts[0]; if (!a) throw Error('Disconnected'); return a; },
    holdingAccount: accounts => accounts.find(value => value.chains.includes('solana:mainnet')) || null,
    cryptoUfosRequest: api, restoredCommanderAsset, savedCommanderPortrait, nftReaderView: (link, busy, error) => nftReaderView(link, busy, error, now),
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
    holdUtility: () => { utilityGate = deferred(); return utilityGate; },
  };
}

test('fresh ownership remains usable when the service clock is ahead of the browser', async () => {
  const f = fixture(); await f.bind();
  f.reads.push(body => ({owner:body.owner,assets:[asset],checkedAt:1000500,identityVerified:false}));
  await f.render().connect(f.wallet); await f.settle();
  assert.equal(f.render().ownershipReady, true);
  f.setNow(1120000);
  assert.equal(f.render().ownershipReady, false);
});

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
  await assert.rejects(f.render().verifyUtility('commander', asset.id), /saved UFO/);
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

test('disconnect retains the saved portrait and link; silent utility rechecks need no holder signature', async () => {
  const f = fixture(); await f.connected(); const epoch = f.render().ownershipEpoch;
  f.render().unlink(); await f.settle();
  assert.equal(f.render().flagship.id, asset.id); assert.equal(f.render().holdingConnected, false); assert.ok(f.render().ownershipEpoch > epoch);
  const before = f.requests.filter(r => r.action === 'ufo-challenge').length;
  assert.equal((await f.render().verifyUtility('commander', asset.id)).utilityToken,'linked-server-token');
  assert.equal(f.requests.filter(r => r.action === 'ufo-challenge').length,before);
  await f.render().connect(f.wallet); await f.settle();
  assert.equal(f.render().flagship.id, asset.id); assert.equal(f.render().ownershipReady, true);
});

test('wallet switch during a silent ownership check cannot restore an old utility token', async () => {
  const f = fixture(); await f.connected(); const gate = f.holdUtility();
  const verified = f.requests.filter(value => value.action === 'ufo-verify').length;
  const auth = f.render().verifyUtility('commander', asset.id); await f.settle();
  f.change('holder-b'); await f.settle(); gate.resolve();
  await assert.rejects(auth, /Holding wallet or commander changed/);
  assert.equal(f.requests.filter(value => value.action === 'ufo-verify').length, verified);
});

test('commander selection change during silent verification invalidates the previous UFO authorization', async () => {
  const f = fixture(); await f.connected(); const gate = f.holdUtility();
  const auth = f.render().verifyUtility('commander', asset.id); await f.settle();
  await f.render().assign(null); await f.settle(); gate.resolve();
  await assert.rejects(auth, /Saved commander changed|Holding wallet or commander changed/);
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

test('fresh browser shows the on-chain portrait during delayed or failed ownership reads without authorizing utility', async () => {
  const chain = {record: {commander:'commander',owner:'holder-a',asset:asset.id,nonce:1n,verifiedAt:1n}};
  const f = fixture(chain), pending = deferred();
  f.reads.push(() => pending.promise);
  await f.bind();
  assert.equal(f.storage.size, 0);
  assert.equal(f.render().flagship.id, asset.id);
  assert.equal(f.render().flagship.image, `/api/crypto-ufos-image?id=${asset.id}`);
  assert.equal(f.render().ownershipReady, false);
  pending.reject(Error('DAS unavailable')); await f.settle();
  assert.equal(f.render().flagship.id, asset.id);
  assert.equal(f.render().ownershipReady, false);
  assert.equal(f.requests.some(r => ['ufo-challenge','ufo-verify','ufo-attest'].includes(r.action)), false);
  await assert.rejects(f.render().verifyUtility('commander', asset.id), /Refresh ownership/);
});

test('portrait-only restoration is removed when fresh ownership confirms transfer', async () => {
  const chain = {record: {commander:'commander',owner:'holder-a',asset:asset.id,nonce:1n,verifiedAt:1n}};
  const f = fixture(chain), pending = deferred(); f.reads.push(() => pending.promise);
  await f.bind(); assert.equal(f.render().flagship.id, asset.id);
  pending.resolve({owner:'holder-a',assets:[],checkedAt:1000000,identityVerified:false}); await f.settle();
  assert.equal(f.render().flagship, null);
  assert.equal(f.render().link.selectedAsset, null);
});

test('portrait fallback cannot cross commanders or holding wallets and cleared records never restore it', () => {
  const saved = {commander:'a',record:{owner:'holder-a',asset:asset.id,verifiedAt:1n}};
  assert.equal(savedCommanderPortrait(saved,'b','holder-a'),null);
  assert.equal(savedCommanderPortrait(saved,'a','holder-b'),null);
  assert.equal(savedCommanderPortrait({...saved,record:{...saved.record,verifiedAt:0n}},'a','holder-a'),null);
  assert.equal(savedCommanderPortrait(null,'a','holder-a'),null);
});

test('PFP title and portrait never inherit utility expiry or ownership-status styling', () => {
  const avatar = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'CommanderAvatar');
  const compiled = ts.transpileModule(avatar.getText(ast), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  for (const ownershipStatus of ['verified','expired','checking','unavailable','disconnected']) {
    const target = {exports:{}};
    vm.runInNewContext(compiled,{exports:target.exports,require,
      useCryptoUfos:()=>({flagship:asset,ownershipStatus}),useUfoFrame:()=>({accent:'#fff'}),NftImage:()=>null});
    const rendered = target.exports.CommanderAvatar({});
    assert.equal(rendered.props.title,asset.name);
    assert.equal(rendered.props['data-ownership'],undefined);
    assert.equal(rendered.props.children.props.asset,asset);
  }
});
