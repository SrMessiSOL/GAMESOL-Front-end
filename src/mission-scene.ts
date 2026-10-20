import { orbitForSystemPosition, type UniverseMission, type UniverseOrbit } from './universe-data';

export function emptySystemDisplayOrbit(position: number, galaxy: number, system: number, scale: number, starOffset: number): UniverseOrbit {
  const orbit = orbitForSystemPosition(position, galaxy * 1000 + system);
  return { ...orbit, radius: orbit.radius * 1.3 * scale + starOffset,
    phase: orbit.phase - (orbit.ascendingNode ?? 0), angularVelocity: orbit.angularVelocity * .12 };
}

export function missionDestinationIsLocal(mission: UniverseMission, galaxy: number, system: number): boolean {
  const target = mission.destinationPosition;
  return !!target && target.galaxy === galaxy && target.system === system && target.position >= 1 && target.position <= 15;
}

export function missionJourneyProgress(mission: UniverseMission, now: number, fallbackSampledAt: number): number {
  if (mission.phase === 'arrived' || mission.phase === 'returned') return 1;
  return Math.max(0, Math.min(1, mission.progress + Math.max(0, now - (mission.sampledAt ?? fallbackSampledAt)) / Math.max(1, mission.durationSeconds)));
}

export function systemEntryPoint(id: string, outerOrbit: number): [number, number, number] {
  let hash = 2166136261;
  for (const char of id) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  const angle = ((hash >>> 0) % 360) * Math.PI / 180;
  const radius = Math.max(24, outerOrbit + 12);
  return [Math.cos(angle) * radius, (((hash >>> 9) % 7) - 3) * 1.35, Math.sin(angle) * radius];
}

export function readableFleetScale(distance: number, verticalFov: number, viewportHeight: number): number {
  const unitsPerPixel = 2 * Math.tan(verticalFov * Math.PI / 360) * distance / Math.max(1, viewportHeight);
  return Math.max(1, Math.min(16, unitsPerPixel * 14));
}
