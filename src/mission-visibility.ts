import type { UniverseMission, UniverseSnapshot } from './universe-data';

export type MissionLocation = { galaxy: number; system: number; position: number };
export type TrafficScope = { level: 'system' | 'galaxy' | 'universe'; galaxy: number; system: number };
export type TrafficPoint = { key: string; location: MissionLocation; departures: number; arrivals: number; waiting: number };
type MapPoint = [number, number, number];

export function galaxyTravelEndpoints(source: MissionLocation, target: MissionLocation, galaxy: number,
  systemPosition: (location: MissionLocation) => MapPoint, galaxyPosition: (galaxy: number) => MapPoint): { start: MapPoint; end: MapPoint; remoteAt: 'start' | 'end' | null } | null {
  const sourceHere = source.galaxy === galaxy, targetHere = target.galaxy === galaxy;
  if ((!sourceHere && !targetHere) || !missionVisibleAtScale(source, target, 'galaxy')) return null;
  const boundary = (remote: number): MapPoint => {
    const local = galaxyPosition(galaxy), other = galaxyPosition(remote);
    const direction = other.map((value, index) => value - local[index]);
    const length = Math.hypot(...direction) || 1;
    return direction.map(value => value / length * 100) as MapPoint;
  };
  return { start: sourceHere ? systemPosition(source) : boundary(source.galaxy),
    end: targetHere ? systemPosition(target) : boundary(target.galaxy), remoteAt: !sourceHere ? 'start' : !targetHere ? 'end' : null };
}

function valid(location: MissionLocation | undefined): location is MissionLocation {
  return !!location && Number.isInteger(location.galaxy) && location.galaxy >= 1 && location.galaxy <= 999
    && Number.isInteger(location.system) && location.system >= 1 && location.system <= 999
    && Number.isInteger(location.position) && location.position >= 1 && location.position <= 15;
}

export function missionEndpoints(mission: UniverseMission, planets: UniverseSnapshot['planets']): { source: MissionLocation; target: MissionLocation } | null {
  const locate = (id: string) => {
    const planet = planets.find(planet => planet.id === id);
    if (!planet) return undefined;
    const [galaxy, system, position] = planet.system.split(':').map(Number);
    return { galaxy, system, position };
  };
  const source = mission.sourcePosition ?? locate(mission.sourceId);
  const target = mission.destinationPosition ?? locate(mission.destinationId);
  return valid(source) && valid(target) ? { source, target } : null;
}

export function missionVisibleAtScale(source: MissionLocation, target: MissionLocation, level: TrafficScope['level']): boolean {
  return level === 'system' || (level === 'galaxy'
    ? source.galaxy !== target.galaxy || source.system !== target.system
    : source.galaxy !== target.galaxy);
}

export function trafficPointLabel(point: TrafficPoint): string {
  return [[point.departures, 'departing'], [point.arrivals, 'arriving'], [point.waiting, 'awaiting resolution']]
    .filter(([count]) => Number(count) > 0).map(([count, text]) => `${count} ${text}`).join(' · ');
}

export function missionTrafficPoints(snapshot: UniverseSnapshot, scope: TrafficScope): TrafficPoint[] {
  const points = new Map<string, TrafficPoint>();
  const add = (location: MissionLocation, role: 'departures' | 'arrivals' | 'waiting') => {
    if (scope.level !== 'universe' && location.galaxy !== scope.galaxy) return;
    if (scope.level === 'system' && location.system !== scope.system) return;
    const key = scope.level === 'universe' ? `${location.galaxy}`
      : scope.level === 'galaxy' ? `${location.galaxy}:${location.system}` : `${location.galaxy}:${location.system}:${location.position}`;
    const point = points.get(key) ?? { key, location, departures: 0, arrivals: 0, waiting: 0 };
    point[role] += 1; points.set(key, point);
  };
  for (const mission of snapshot.missions) {
    const endpoints = missionEndpoints(mission, snapshot.planets);
    if (!endpoints || !missionVisibleAtScale(endpoints.source, endpoints.target, scope.level)) continue;
    const { source, target } = endpoints;
    if (mission.phase === 'arrived') add(target, 'waiting');
    else if (mission.phase === 'returned') add(source, 'waiting');
    else {
      const returning = mission.phase === 'returning';
      add(returning ? target : source, 'departures');
      add(returning ? source : target, 'arrivals');
    }
  }
  return [...points.values()];
}
