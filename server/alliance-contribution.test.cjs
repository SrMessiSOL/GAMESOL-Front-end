const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../src/alliance-contribution.ts'), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const { allianceContributionCompleted: completed, allianceContributionBlock: block, allianceInfrastructureBlock: infrastructure } = exportsObject;
const now = Date.parse('2026-10-15T12:00:00Z') / 1000;
const day = Math.floor(now / 86400);
const member = { dailyEpoch: day, weeklyEpoch: Math.floor((day + 3) / 7), monthlyEpoch: 2026 * 12 + 9,
  dailyClaimedMask: 1n, weeklyClaimedMask: 2n, monthlyClaimedMask: 4n };

test('only the claimed mission in each current period is completed', () => {
  for (const [period, id] of [[1, 0], [2, 1], [3, 2]]) {
    assert.equal(completed(member, period, id, now), true);
    assert.equal(completed(member, period, id + 1, now), false);
  }
});
test('daily, Monday weekly and calendar-month UTC resets reopen old claims', () => {
  assert.equal(completed(member, 1, 0, Date.parse('2026-10-16T00:00:00Z') / 1000), false);
  assert.equal(completed(member, 2, 1, Date.parse('2026-10-19T00:00:00Z') / 1000), false);
  assert.equal(completed(member, 3, 2, Date.parse('2026-11-01T00:00:00Z') / 1000), false);
});
test('missing membership, invalid missions and periods cannot appear completed', () => {
  assert.equal(completed(null, 1, 0, now), false);
  for (const id of [-1, 64, 0.5]) assert.equal(completed(member, 1, id, now), false);
  assert.equal(completed(member, 0, 0, now), false);
});
test('render and click handler both guard completed contributions', () => {
  const ui = fs.readFileSync(require.resolve('../src/PlanetWorld.tsx'), 'utf8');
  assert.match(ui, /if \(contributionBlock\(mission\)\) return/);
  assert.match(ui, /disabled=\{busy \|\| Boolean\(contributionBlock\(mission\)\)\}/);
  assert.match(ui, /contributionBlock\(mission\) \?\? "DEPOSIT"/);
});

test('contributions reject missing membership and balances and accept exact affordability',()=>{
  const mission={period:1,id:1,metal:1000n,crystal:500n,deuterium:250n,antimatter:1000000n};
  const balances={metal:1000n,crystal:500n,deuterium:250n,antimatter:1000000n};
  assert.equal(block(member,mission,balances,now),null);
  assert.match(block(null,mission,balances,now),/Join/);
  assert.match(block({...member,role:0},mission,balances,now),/Join/);
  assert.match(block(member,mission,undefined,now),/Checking/);
  for(const field of ['metal','crystal','deuterium','antimatter']) assert.match(block(member,mission,{...balances,[field]:balances[field]-1n},now),/Needs/);
  assert.equal(block(member,{...mission,id:0},balances,now),'COMPLETED');
});
test('infrastructure blocks the wrong role, absent treasury, maximum level and every resource shortage',()=>{
  const cost={metal:1000n,crystal:500n,deuterium:250n,antimatter:1000000n};
  assert.equal(infrastructure(true,1,cost,cost),null);
  assert.match(infrastructure(false,1,cost,cost),/LEADER/);
  assert.match(infrastructure(true,1,null,cost),/Checking/);
  assert.match(infrastructure(true,255,cost,cost),/Maximum/);
  for(const field of ['metal','crystal','deuterium','antimatter']) assert.match(infrastructure(true,1,{...cost,[field]:cost[field]-1n},cost),/Needs/);
  const ui=fs.readFileSync(require.resolve('../src/PlanetWorld.tsx'),'utf8');
  assert.match(ui,/const block = allianceInfrastructureBlock\(leader, currentLevel, allianceTreasury, cost\)/);
  assert.match(ui,/disabled=\{busy \|\| Boolean\(block\)\}/);
});

test('live alliance confirmation is above the command panel on desktop and mobile', () => {
  const css = fs.readFileSync(require.resolve('../src/planet-world-local.css'), 'utf8');
  assert.match(css, /\.pw-confirm-backdrop\{position:fixed;z-index:2400/);
  assert.doesNotMatch(css, /\.production-preview \.pw-confirm/);
  assert.match(css, /@media\(max-width:560px\)\{\.pw-confirm-backdrop/);
});

test('rejection marks the applicant writable to receive the closed request rent', () => {
  const game = fs.readFileSync(require.resolve('../src/game-state.ts'), 'utf8');
  const method = game.slice(game.indexOf('  async rejectJoinRequest('), game.indexOf('  async expelAllianceMember('));
  assert.match(method, /pubkey: applicant, isSigner: false, isWritable: true/);
  assert.match(method, /pubkey: deriveAllianceJoinRequestPda\(alliancePda, applicant\), isSigner: false, isWritable: true/);
});
