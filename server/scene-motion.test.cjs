const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = (name) => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
const source = ts.transpileModule(read('scene-motion.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function motion(window) {
  const context = { exports: {}, window };
  vm.runInNewContext(source, context);
  return context.exports;
}
const { transitReducer: reduce, INITIAL_TRANSIT, easeSceneProgress } = motion();
test('portrait scenes fit the horizontal field without changing desktop camera distances', () => {
  const { sceneAspectDistanceScale } = motion();
  assert.equal(sceneAspectDistanceScale(1280, 720), 1);
  assert.equal(sceneAspectDistanceScale(390, 844), 844 / 390);
  assert.equal(sceneAspectDistanceScale(100, 1000), 2.8);
  assert.equal(sceneAspectDistanceScale(0, 844), 1);
  assert.equal(sceneAspectDistanceScale(NaN, 844), 1);
});
const begin = { type: 'begin', id: 1, title: 'Planet', detail: '1:1:1' };

test('hidden tabs do not consume the scene loading timeout or remove readiness gates', () => {
  let now = 0;
  let timer;
  let callback;
  let visibilityChanged;
  let fired = 0;
  const page = {
    hidden: true,
    addEventListener(name, handler) { assert.equal(name, 'visibilitychange'); visibilityChanged = handler; },
    removeEventListener(name, handler) { assert.equal(handler, visibilityChanged); visibilityChanged = undefined; },
  };
  const scheduler = {
    performance: { now: () => now },
    setTimeout(handler, delay) { callback = handler; timer = delay; return 1; },
    clearTimeout() { timer = undefined; callback = undefined; },
  };
  const cleanup = motion().visiblePageTimeout(() => fired++, 15000, page, scheduler);
  assert.equal(timer, undefined);
  now = 30000; page.hidden = false; visibilityChanged();
  assert.equal(timer, 15000);
  now += 4000; page.hidden = true; visibilityChanged();
  assert.equal(timer, undefined);
  now += 60000; page.hidden = false; visibilityChanged();
  assert.equal(timer, 11000);
  callback(); assert.equal(fired, 1);
  cleanup(); assert.equal(visibilityChanged, undefined);
  assert.match(read('SceneTransition.tsx'), /visiblePageTimeout\(\(\) => dispatch\(\{ type: 'timeout'/);
});

test('scene changes cover first, wait for render readiness, then reveal', () => {
  let state = reduce(INITIAL_TRANSIT, begin);
  assert.equal(state.phase, 'covering');
  assert.equal(reduce(state, { type: 'ready', id: 1 }), state);
  state = reduce(state, { type: 'covered', id: 1 });
  assert.equal(state.phase, 'loading');
  assert.equal(reduce(state, { type: 'done', id: 1 }), state);
  state = reduce(state, { type: 'ready', id: 1 });
  assert.equal(state.phase, 'revealing');
  state = reduce(state, { type: 'done', id: 1 });
  assert.equal(state.phase, 'idle');
});

test('late callbacks and rapid duplicate requests cannot change the active destination', () => {
  const state = reduce(INITIAL_TRANSIT, begin);
  assert.equal(reduce(state, { ...begin, id: 2, title: 'Other world' }), state);
  assert.equal(reduce(state, { type: 'covered', id: 0 }), state);
  const loading = reduce(state, { type: 'covered', id: 1 });
  assert.equal(reduce(loading, { type: 'ready', id: 0 }), loading);
});

test('slow or failed destinations never silently reveal an unfinished scene', () => {
  const loading = reduce(reduce(INITIAL_TRANSIT, begin), { type: 'covered', id: 1 });
  assert.equal(reduce(loading, { type: 'done', id: 1 }), loading);
  const failed = reduce(loading, { type: 'timeout', id: 1 });
  assert.equal(failed.phase, 'error');
  assert.equal(reduce(failed, { type: 'done', id: 1 }), failed);
  assert.equal(reduce(failed, { type: 'ready', id: 0 }), failed);
  const revealed = reduce(loading, { type: 'ready', id: 1 });
  assert.equal(reduce(revealed, { type: 'timeout', id: 1 }), revealed);
});

test('a timed-out scene recovers only after its own renderer reports readiness', () => {
  const failed = reduce(reduce(reduce(INITIAL_TRANSIT, begin), { type: 'covered', id: 1 }), { type: 'timeout', id: 1 });
  const ready = reduce(failed, { type: 'ready', id: 1 });
  assert.equal(ready.phase, 'revealing');
  assert.equal(reduce(ready, { type: 'done', id: 1 }).phase, 'idle');
});

test('camera easing clamps its endpoints and moves monotonically without overshoot', () => {
  assert.equal(easeSceneProgress(-1), 0);
  assert.equal(easeSceneProgress(2), 1);
  assert.equal(easeSceneProgress(.5), .5);
  let previous = 0;
  for (let step = 0; step <= 100; step++) {
    const value = easeSceneProgress(step / 100);
    assert.ok(value >= previous && value <= 1);
    previous = value;
  }
});

test('reduced motion eliminates travel animation without bypassing readiness', () => {
  assert.equal(motion({ matchMedia: () => ({ matches: true }) }).motionDuration(850), 0);
  assert.equal(motion({ matchMedia: () => ({ matches: false }) }).motionDuration(850), 850);
  assert.equal(motion().motionDuration(850), 850);
});

test('both world surfaces signal readiness and the map does not recreate its canvas per level', () => {
  const map = read('UniverseLab.tsx');
  const game = read('UniverseGame.tsx');
  const world = read('PlanetWorld.tsx');
  assert.doesNotMatch(map, /<Canvas key=/);
  assert.match(map, /<SceneReady sceneKey=/);
  assert.match(world, /<SceneReady sceneKey=\{state\.entityPda\}/);
  assert.equal((game.match(/onSceneReady=\{planetTransit\.ready\}/g) || []).length, 2);
  assert.doesNotMatch(game, /PlanetTransitTransition|setPlanetApproach|setPlanetDeparture/);
  assert.match(map, /label="Zoom camera in"/);
  assert.match(map, /label="Jump to coordinates"/);
  assert.match(map, /command\.id === appliedCommand\.current/);
  assert.match(read('game-polish.css'), /\.ug-top>\.passkey-connect-control\{display:grid!important\}/);
});
