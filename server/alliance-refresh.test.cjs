const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
const start = app.indexOf('  const refreshAllianceState = useCallback');
const end = app.indexOf('  const replacePlanetState', start);
const code = ts.transpileModule(app.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness() {
  const values = {};
  const listeners = {};
  const ref = { current: 0 };
  const wallet = { current: 'A' };
  const client = {
    getMyAlliance: async () => null,
    fetchAlliances: async () => [],
  };
  let cleanup;
  let timer;
  const context = {
    clientRef: { current: client }, allianceReadRef: ref, allianceWalletRef: wallet,
    publicKey: { toBase58: () => 'A' }, tab: 'alliance',
    useCallback: f => f, useEffect: f => { cleanup = f(); },
    document: { visibilityState: 'visible', addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener: k => { delete listeners[k]; } },
    window: { addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener: k => { delete listeners[k]; }, setInterval: f => { timer = f; return 1; }, clearInterval: () => { timer = null; } },
  };
  for (const name of ['AllianceState', 'AllianceTreasury', 'AllianceMembership', 'AllianceDirectory', 'AllianceJoinRequests', 'MyAllianceJoinRequests', 'AllianceMembers']) {
    context[`set${name}`] = v => { values[name] = v; };
  }
  vm.runInNewContext(code + '\nglobalThis.refresh = refreshAllianceState;', context);
  return { context, client, values, listeners, cleanup: () => cleanup(), timer: () => timer };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('visible alliance panel refreshes on entry, focus and interval; cleanup removes listeners', async () => {
  const h = harness();
  let reads = 0;
  await settle();
  h.client.getMyAlliance = async () => { reads++; return null; };
  h.listeners.focus(); await settle();
  h.timer()(); await settle();
  assert.equal(reads, 2);
  h.context.document.visibilityState = 'hidden';
  h.listeners.visibilitychange(); await settle();
  assert.equal(reads, 2);
  h.context.document.visibilityState = 'visible';
  h.listeners.visibilitychange(); await settle();
  assert.equal(reads, 3);
  h.cleanup();
  assert.deepEqual(Object.keys(h.listeners), []);
  assert.equal(h.timer(), null);
});

test('responses from an account that was switched away cannot update alliance state', async () => {
  const h = harness(); await settle();
  let resolve;
  h.client.fetchAlliances = () => new Promise(r => { resolve = r; });
  const pending = h.context.refresh();
  h.context.allianceWalletRef.current = 'B';
  h.values.AllianceDirectory = 'account-B';
  resolve([]); await pending;
  assert.equal(h.values.AllianceDirectory, 'account-B');
  h.cleanup();
});

test('older overlapping response cannot overwrite a newer alliance snapshot', async () => {
  const h = harness(); await settle();
  let resolve;
  h.client.fetchAlliances = () => new Promise(r => { resolve = r; });
  const old = h.context.refresh();
  h.client.fetchAlliances = async () => [];
  await h.context.refresh();
  h.values.AllianceDirectory = 'newer';
  resolve([]); await old;
  assert.equal(h.values.AllianceDirectory, 'newer');
  h.cleanup();
});

const world = fs.readFileSync(path.join(__dirname, '../src/PlanetWorld.tsx'), 'utf8');
const worldStart = world.indexOf('  const allianceReadRevision = useRef');
const worldEnd = world.indexOf('  const building = BUILDINGS[selected]', worldStart);
const worldCode = ts.transpileModule(world.slice(worldStart, worldEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;

function worldHarness() {
  const values = {};
  const listeners = {};
  const game = {
    getGamesolGovernanceConfig: async () => null,
    getAllianceMembership: async () => null,
    fetchAlliances: async () => [],
  };
  let cleanup;
  let timer;
  const context = {
    game, modal: 'alliance', useRef: current => ({ current }),
    useEffect: f => { cleanup = f(); },
    document: { visibilityState: 'visible', addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener: k => { delete listeners[k]; } },
    window: { addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener: k => { delete listeners[k]; }, setInterval: f => { timer = f; return 1; }, clearInterval: () => { timer = null; } },
    PublicKey: class { constructor(value) { this.value = value; } },
  };
  for (const name of ['AllianceLoading', 'GamesolGovernance', 'AllianceMembership', 'Alliance', 'AllianceTreasury', 'AllianceJoinRequests', 'AllianceMembers', 'AllianceGovernance', 'AllianceDecisions', 'PendingAllianceDirectory', 'AllianceDirectory']) {
    context[`set${name}`] = v => { values[name] = v; };
  }
  vm.runInNewContext(worldCode + '\nglobalThis.refresh = refreshAlliance; globalThis.gameRef = allianceGameRef;', context);
  return { context, game, values, listeners, cleanup: () => cleanup(), timer: () => timer };
}

test('actual 3D alliance screen silently discovers membership changes on focus and interval', async () => {
  const h = worldHarness(); await settle();
  assert.equal(h.values.AllianceLoading, false);
  h.game.getAllianceMembership = async () => ({ role: 1, alliance: 'alliance-A' });
  h.game.getAlliance = async () => ({ publicKey: 'alliance-A', memberCount: 2 });
  h.game.getAllianceTreasury = async () => ({ metal: 1000n });
  h.game.fetchAllianceMembers = async () => ['leader', 'member'];
  h.game.getAllianceGovernanceConfig = async () => null;
  h.game.fetchAllianceDecisions = async () => [];
  h.listeners.focus(); await settle();
  assert.equal(h.values.AllianceMembership.role, 1);
  assert.equal(h.values.Alliance.memberCount, 2);
  assert.equal(h.values.AllianceLoading, false);
  h.game.getAllianceMembership = async () => null;
  h.timer()(); await settle();
  assert.equal(h.values.Alliance, null);
  assert.equal(h.values.AllianceTreasury, null);
  h.cleanup();
  assert.deepEqual(Object.keys(h.listeners), []);
});

test('3D alliance loader discards a departed account and cleans up in-flight reads', async () => {
  const h = worldHarness(); await settle();
  let resolve;
  h.game.getAllianceMembership = () => new Promise(r => { resolve = r; });
  const pending = h.context.refresh(true);
  await settle();
  h.context.gameRef.current = {};
  h.values.AllianceMembership = 'new-account';
  resolve({ role: 0 }); await pending;
  assert.equal(h.values.AllianceMembership, 'new-account');
  h.context.gameRef.current = h.game;
  const closing = h.context.refresh(true); await settle();
  h.cleanup(); resolve({ role: 0 }); await closing;
  assert.equal(h.values.AllianceMembership, 'new-account');
});

test('3D background RPC failure preserves the last known view and permits recovery', async () => {
  const h = worldHarness(); await settle();
  h.values.Alliance = 'last-confirmed';
  h.game.getGamesolGovernanceConfig = async () => { throw new Error('RPC offline'); };
  h.listeners.focus(); await settle();
  assert.equal(h.values.Alliance, 'last-confirmed');
  h.game.getGamesolGovernanceConfig = async () => null;
  h.listeners.focus(); await settle();
  assert.equal(h.values.Alliance, null);
  h.cleanup();
});
