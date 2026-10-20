const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./frontend-ts-loader.cjs').frontendLoader();
const { missionTrafficPoints, missionEndpoints, galaxyTravelEndpoints } = load('mission-visibility.ts');
const source = { galaxy: 3, system: 293, position: 1 };
const target = { galaxy: 4, system: 12, position: 2 };
const mission = { id: 'flight', sourceId: 'a', destinationId: 'empty', sourcePosition: source, destinationPosition: target, phase: 'outbound' };
const snapshot = missions => ({ planets: [], missions });
const scope = (level, galaxy = 3, system = 293) => ({ level, galaxy, system });

test('empty destination exposes an arrival point independently of departure system', () => {
  assert.equal(missionTrafficPoints(snapshot([mission]), scope('system'))[0].departures, 1);
  const arrival = missionTrafficPoints(snapshot([mission]), scope('system', 4, 12));
  assert.equal(arrival[0].key, '4:12:2'); assert.equal(arrival[0].arrivals, 1);
});
test('galaxy and universe preserve both endpoints at the appropriate scale', () => {
  assert.equal(missionTrafficPoints(snapshot([mission]), scope('universe')).map(p => p.key).join(','), '3,4');
  assert.equal(missionTrafficPoints(snapshot([mission]), scope('galaxy', 4))[0].key, '4:12');
  const local = { ...mission, destinationPosition: { ...source, position: 2 } };
  assert.equal(missionTrafficPoints(snapshot([local]), scope('galaxy')).length, 0);
  assert.equal(missionTrafficPoints(snapshot([local]), scope('system')).length, 2);
});
test('return legs reverse departure and arrival; resolved legs wait at the correct endpoint', () => {
  const returning = { ...mission, phase: 'returning' };
  assert.equal(missionTrafficPoints(snapshot([returning]), scope('system'))[0].arrivals, 1);
  for (const [phase, galaxy, system, key] of [['arrived', 4, 12, '4:12:2'], ['returned', 3, 293, '3:293:1']]) {
    const points = missionTrafficPoints(snapshot([{ ...mission, phase }]), scope('system', galaxy, system));
    assert.equal(points[0].key, key); assert.equal(points[0].waiting, 1);
    assert.equal(points[0].departures + points[0].arrivals, 0);
  }
});
test('all missions are counted and malformed coordinates fail closed', () => {
  assert.equal(missionTrafficPoints(snapshot(Array.from({ length: 9 }, (_, i) => ({ ...mission, id: String(i) }))), scope('system', 4, 12))[0].arrivals, 9);
  assert.equal(missionEndpoints({ ...mission, destinationPosition: { ...target, position: 16 } }, []), null);
});

test('galaxy legs connect real systems and project intergalactic entry and exit at both ends', () => {
  const systemPosition = location => [location.system, 0, location.position];
  const galaxyPosition = galaxy => [galaxy * 500, 0, 0];
  const outbound = galaxyTravelEndpoints(source, target, 3, systemPosition, galaxyPosition);
  assert.equal(outbound.remoteAt, 'end'); assert.equal(outbound.start.join(','), '293,0,1');
  assert.equal(outbound.end.join(','), '100,0,0');
  const inbound = galaxyTravelEndpoints(source, target, 4, systemPosition, galaxyPosition);
  assert.equal(inbound.remoteAt, 'start'); assert.equal(inbound.start.join(','), '-100,0,0');
  assert.equal(inbound.end.join(','), '12,0,2');
  assert.equal(galaxyTravelEndpoints(source, target, 5, systemPosition, galaxyPosition), null);
  const local = galaxyTravelEndpoints(source, { ...source, system: 294 }, 3, systemPosition, galaxyPosition);
  assert.equal(local.remoteAt, null); assert.equal(local.start[0], 293); assert.equal(local.end[0], 294);
  assert.equal(galaxyTravelEndpoints(source, { ...source, position: 2 }, 3, systemPosition, galaxyPosition), null);
});
