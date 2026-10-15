const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.createSourceFile('PlanetWorld.tsx', fs.readFileSync(path.join(__dirname, '../src/PlanetWorld.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let launch;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'launchMission') launch = node.initializer.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(launch);
const code = ts.transpileModule(`module.exports = ${launch};`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;

async function exercise(missionType, owner, lookupFails = false, overrides = {}) {
  const calls = { submitted: 0, lookups: 0, error: '', checking: false };
  const module = { exports: {} };
  const context = {
    module, canLaunchMission: true, busy: false, missionChecking: false, missionType,
    missionTarget: { galaxy: 9, system: 427, position: 1, speed: 100 },
    missionCargo: {}, missionShips: { lightFighter: 1 },
    state: { planet: { owner: 'our-commander', attackUnlockedAt: 0, lastAttackLaunchTs: 0 }, research: { computerTech: 0 }, fleet: { missions: [{ missionType: 0 }] } },
    resource: { metal: 100n, crystal: 100n, deuterium: 100n },
    game: { isCoordFree: async () => false, getPublicPlanetInfoByCoordinates: async () => {
      calls.lookups++;
      if (lookupFails) throw Error('Target lookup unavailable');
      return owner === null ? null : { owner, protectionUntilTs: 0, lastAttackedTs: 0, ...overrides.target };
    } },
    setMissionChecking: value => { calls.checking = value; },
    setMissionError: value => { calls.error = value; },
    missionFuelCost: () => 0, missionName: () => 'TEST', queueTime: String,
    SHIP_COMBAT_POINTS: { lightFighter: 50 }, MIN_ATTACK_COMBAT_POINTS: 1,
    ATTACK_LAUNCH_COOLDOWN_SECONDS: 0, TARGET_ATTACK_COOLDOWN_SECONDS: 0,
    FLEET_LAUNCH_KEY: { lightFighter: 'lf' }, run: async () => { calls.submitted++; },
  };
  if (overrides.ships) context.missionShips = overrides.ships;
  if (overrides.minimum !== undefined) context.MIN_ATTACK_COMBAT_POINTS = overrides.minimum;
  if (overrides.targetCooldown !== undefined) context.TARGET_ATTACK_COOLDOWN_SECONDS = overrides.targetCooldown;
  if (overrides.planet) Object.assign(context.state.planet, overrides.planet);
  vm.runInNewContext(code, context);
  await module.exports();
  return calls;
}

for (const type of [1, 6]) {
  test(`mission ${type} rejects our other planet before submitting`, async () => {
    const result = await exercise(type, 'our-commander');
    assert.equal(result.submitted, 0);
    assert.match(result.error, /different commander/);
    assert.equal(result.checking, false);
  });
  test(`mission ${type} fails closed when target ownership is unavailable`, async () => {
    for (const failure of [false, true]) {
      const result = await exercise(type, null, failure);
      assert.equal(result.submitted, 0);
      assert.ok(result.error);
      assert.equal(result.checking, false);
    }
  });
  test(`mission ${type} allows a verified different owner through preflight`, async () => {
    assert.equal((await exercise(type, 'controlled-defender')).submitted, 1);
  });
}
test('transport to our other planet remains allowed without hostile owner checks', async () => {
  const result = await exercise(2, 'our-commander');
  assert.equal(result.submitted, 1);
  assert.equal(result.lookups, 0);
});

test('protected defender rejects attacks before a wallet command and still permits espionage', async () => {
  const target = { protectionUntilTs: Math.floor(Date.now() / 1000) + 604800 };
  const attack = await exercise(1, 'controlled-defender', false, { target });
  assert.equal(attack.submitted, 0);
  assert.match(attack.error, /Target is protected/);
  assert.equal(attack.checking, false);
  assert.equal((await exercise(6, 'controlled-defender', false, { target })).submitted, 1);
});

test('combat minimum rejects 19 fighters and permits exactly 20 against an eligible target', async () => {
  const weak = await exercise(1, 'controlled-defender', false, { ships: { lightFighter: 19 }, minimum: 1000 });
  assert.equal(weak.submitted, 0);
  assert.match(weak.error, /fleet too weak/);
  assert.equal((await exercise(1, 'controlled-defender', false, { ships: { lightFighter: 20 }, minimum: 1000 })).submitted, 1);
});

test('defender cooldown and attacker unlock reject without submitting', async () => {
  const now = Math.floor(Date.now() / 1000);
  const cooled = await exercise(1, 'controlled-defender', false, { target: { lastAttackedTs: now }, targetCooldown: 3600 });
  assert.equal(cooled.submitted, 0);
  assert.match(cooled.error, /Target cooldown/);
  const locked = await exercise(1, 'controlled-defender', false, { planet: { attackUnlockedAt: now + 3600 } });
  assert.equal(locked.submitted, 0);
  assert.match(locked.error, /Attack launches unlock/);
});
