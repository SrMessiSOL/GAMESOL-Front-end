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

async function exercise(missionType, owner, lookupFails = false) {
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
      return owner === null ? null : { owner, protectionUntilTs: 0, lastAttackedTs: 0 };
    } },
    setMissionChecking: value => { calls.checking = value; },
    setMissionError: value => { calls.error = value; },
    missionFuelCost: () => 0, missionName: () => 'TEST', queueTime: String,
    SHIP_COMBAT_POINTS: { lightFighter: 50 }, MIN_ATTACK_COMBAT_POINTS: 1,
    ATTACK_LAUNCH_COOLDOWN_SECONDS: 0, TARGET_ATTACK_COOLDOWN_SECONDS: 0,
    FLEET_LAUNCH_KEY: { lightFighter: 'lf' }, run: async () => { calls.submitted++; },
  };
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
