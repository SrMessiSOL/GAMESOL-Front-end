import { planetClassForPosition, type PlanetClass } from "./planet-style";

export type UniversePlanet = {
  id: string;
  name: string;
  ownerLabel: string;
  coordinates: [number, number, number];
  seedLabel: string;
  orbit?: UniverseOrbit;
  system: string;
  className: PlanetClass;
  faction: "owned" | "allied" | "unknown" | "hostile";
  shielded: boolean;
  metal: number;
  crystal: number;
  deuterium: number;
  fleetPower: number;
};

export type UniverseOrbit = {
  radius: number;
  ellipse: number;
  inclination: number;
  phase: number;
  angularVelocity: number;
};

export function orbitForSystemPosition(position: number, seed = 0): UniverseOrbit {
  const slot = Math.max(1, Math.min(15, Math.trunc(position) || 1));
  const radius = 5.5 + slot * 2.55;
  return {
    radius,
    // Every orbit is a scaled copy of the same ellipse in the same plane.
    // Strictly increasing radii therefore cannot intersect.
    ellipse: 0.78,
    inclination: 0.045,
    phase: (((seed * 97) + (slot * 137)) % 360) * (Math.PI / 180),
    angularVelocity: 0.009 / Math.sqrt(radius / 8),
  };
}

export function pointOnUniverseOrbit(orbit: UniverseOrbit, angle = orbit.phase): [number, number, number] {
  return [
    Math.cos(angle) * orbit.radius,
    Math.sin(angle) * orbit.radius * orbit.inclination,
    Math.sin(angle) * orbit.radius * orbit.ellipse,
  ];
}

export type UniverseMission = {
  id: string;
  sourceId: string;
  destinationId: string;
  kind: "transport" | "attack" | "espionage" | "colonize";
  progress: number;
  etaSeconds: number;
};

type ChainPlanetSource = {
  entity: string;
  owner: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetIndex: number;
  diameter: number;
  temperature: number;
  maxFields: number;
  createdAt: number;
  protectionUntilTs: number;
  lastAttackedTs: number;
  metal?: bigint;
  crystal?: bigint;
  deuterium?: bigint;
  fleetPower?: number;
  smallCargo?: number;
  largeCargo?: number;
  lightFighter?: number;
  heavyFighter?: number;
  cruiser?: number;
  battleship?: number;
  battlecruiser?: number;
  bomber?: number;
  destroyer?: number;
  deathstar?: number;
  attacker?: number;
  missions?: ChainMission[];
};

type ChainMission = {
  missionType: number;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  departTs: number;
  arriveTs: number;
  returnTs: number;
  applied: boolean;
  speedFactor: number;
};

function safeBigIntToNumber(value?: bigint): number {
  if (value === undefined) return 0;
  const clamped = value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value < 0n ? 0n : value;
  return Number(clamped);
}

const SYSTEM_FLEET_POWER = {
  smallCargo: 5,
  largeCargo: 5,
  lightFighter: 50,
  heavyFighter: 150,
  cruiser: 400,
  battleship: 1000,
  battlecruiser: 700,
  bomber: 1000,
  destroyer: 2000,
  deathstar: 200000,
  recycler: 1,
  espionageProbe: 0,
  colonyShip: 50,
  solarSatellite: 1,
} as const;

function estimateFleetPower(planet: ChainPlanetSource): number {
  return (planet.smallCargo ?? 0) * SYSTEM_FLEET_POWER.smallCargo
    + (planet.largeCargo ?? 0) * SYSTEM_FLEET_POWER.largeCargo
    + (planet.lightFighter ?? 0) * SYSTEM_FLEET_POWER.lightFighter
    + (planet.heavyFighter ?? 0) * SYSTEM_FLEET_POWER.heavyFighter
    + (planet.cruiser ?? 0) * SYSTEM_FLEET_POWER.cruiser
    + (planet.battleship ?? 0) * SYSTEM_FLEET_POWER.battleship
    + (planet.battlecruiser ?? 0) * SYSTEM_FLEET_POWER.battlecruiser
    + (planet.bomber ?? 0) * SYSTEM_FLEET_POWER.bomber
    + (planet.destroyer ?? 0) * SYSTEM_FLEET_POWER.destroyer
    + (planet.deathstar ?? 0) * SYSTEM_FLEET_POWER.deathstar;
}

function missionKindFromCode(code: number): UniverseMission["kind"] {
  if (code === 5) return "colonize";
  if (code === 6) return "espionage";
  if (code === 2) return "attack";
  return "transport";
}

function etaForMission(mission: ChainMission): number {
  const now = Math.floor(Date.now() / 1000);
  if (now < mission.arriveTs) return mission.arriveTs - now;
  if (mission.applied && now < mission.returnTs) return mission.returnTs - now;
  return Math.max(0, Math.floor((mission.returnTs || mission.arriveTs) - now));
}

function deriveFaction(planet: ChainPlanetSource, viewer: string | null, now: number): UniversePlanet["faction"] {
  if (viewer && planet.owner.toLowerCase() === viewer.toLowerCase()) return "owned";
  if (planet.lastAttackedTs && planet.lastAttackedTs > now - 86400) return "hostile";
  if (planet.protectionUntilTs && planet.protectionUntilTs > now) return "allied";
  return "unknown";
}

export type UniverseSnapshot = {
  sector: string;
  planets: UniversePlanet[];
  missions: UniverseMission[];
};

export interface UniverseDataSource {
  load(): Promise<UniverseSnapshot>;
}

export function createUniverseSnapshotFromChainData(
  planets: ChainPlanetSource[],
  options: { viewer?: string | null } = {},
): UniverseSnapshot {
  const now = Math.floor(Date.now() / 1000);
  const coordinateMap = new Map<string, string>();
  for (const planet of planets) {
    coordinateMap.set(`${planet.galaxy}:${planet.system}:${planet.position}`, planet.entity);
  }

  const mappedPlanets: UniversePlanet[] = planets.map((planet) => {
    const baseSeed = (planet.galaxy * 1000000) + (planet.system * 1000) + planet.position;
    const orbit = orbitForSystemPosition(planet.position, baseSeed + planet.planetIndex);

    return {
      id: planet.entity,
      name: planet.name || `Planet ${planet.galaxy}:${planet.system}:${planet.position}`,
      ownerLabel: planet.owner.slice(0, 4).toUpperCase(),
      seedLabel: `#${planet.planetIndex}`,
      coordinates: pointOnUniverseOrbit(orbit),
      orbit,
      system: `${planet.galaxy}:${planet.system}:${planet.position}`,
      className: planetClassForPosition(planet.position),
      faction: deriveFaction(planet, options.viewer ?? null, now),
      shielded: planet.protectionUntilTs > now,
      metal: safeBigIntToNumber(planet.metal),
      crystal: safeBigIntToNumber(planet.crystal),
      deuterium: safeBigIntToNumber(planet.deuterium),
      fleetPower: planet.fleetPower ?? estimateFleetPower(planet),
    };
  });

  const missions: UniverseMission[] = [];
  const missionIndexByDestination = new Map<string, number>();
  for (const source of planets) {
    for (const mission of source.missions ?? []) {
      const active = mission.arriveTs > now || (mission.applied && mission.returnTs > now) || mission.returnTs > now;
      if (!active) continue;
      const key = `${mission.targetGalaxy}:${mission.targetSystem}:${mission.targetPosition}`;
      const current = missionIndexByDestination.get(key) ?? 0;
      missionIndexByDestination.set(key, current + 1);
      if (current > 4) continue;
      const destinationId = coordinateMap.get(key) ?? `G${mission.targetGalaxy}S${mission.targetSystem}P${mission.targetPosition}`;
      missions.push({
        id: `${source.entity}-${current + 1}`,
        sourceId: source.entity,
        destinationId,
        kind: missionKindFromCode(mission.missionType),
        progress: (mission.applied || now >= mission.arriveTs) ? 0.72 : Math.max(0, Math.min(0.98, (now - mission.departTs) / Math.max(1, mission.arriveTs - mission.departTs))),
        etaSeconds: etaForMission(mission),
      });
    }
  }

  return {
    sector: "PUBLIC",
    planets: mappedPlanets,
    missions,
  };
}

export function snapshotFromPublicPlanets(planets: Array<{
  entity: string; owner: string; name: string; galaxy: number; system: number; position: number; planetIndex: number;
}>): UniverseSnapshot {
  const now = Math.floor(Date.now() / 1000);
  return createUniverseSnapshotFromChainData(
    planets.map((planet) => ({
      entity: planet.entity,
      owner: planet.owner,
      name: planet.name,
      galaxy: planet.galaxy,
      system: planet.system,
      position: planet.position,
      planetIndex: planet.planetIndex,
      diameter: 9_000,
      temperature: 90,
      maxFields: 160,
      createdAt: 0,
      protectionUntilTs: 0,
      lastAttackedTs: 0,
    })),
    { viewer: null },
  );
}

// Retained for isolated renderer development. Production routes use the
// on-chain readers above and do not import this source.
export function createMockUniverseSource(): UniverseDataSource {
  return {
    async load() {
      return {
        sector: "19:247",
        planets: [
          { id: "aurelia", name: "Aurelia Prime", ownerLabel: "YOU", seedLabel: "T01", coordinates: [-8, 1.2, 1], system: "19:247:7", className: "terran", faction: "owned", shielded: true, metal: 12400, crystal: 8200, deuterium: 3750, fleetPower: 15240 },
          { id: "titan", name: "Titan's Forge", ownerLabel: "[NVA] Novera", seedLabel: "T02", coordinates: [5.2, 2.2, -2], system: "19:247:11", className: "volcanic", faction: "allied", shielded: false, metal: 21600, crystal: 15300, deuterium: 6120, fleetPower: 24900 },
          { id: "nyx", name: "Nyx Relay", ownerLabel: "UNKNOWN", seedLabel: "T03", coordinates: [2, -1.7, 7.4], system: "19:247:4", className: "ice", faction: "unknown", shielded: false, metal: 8900, crystal: 19100, deuterium: 9450, fleetPower: 0 },
          { id: "vanta", name: "Vanta Reach", ownerLabel: "[RIFT] Kharon", seedLabel: "T04", coordinates: [-2, 3.1, -7], system: "19:247:13", className: "gas", faction: "hostile", shielded: true, metal: 31100, crystal: 7700, deuterium: 12900, fleetPower: 42800 },
          { id: "helion", name: "Helion Outpost", ownerLabel: "UNKNOWN", seedLabel: "T05", coordinates: [9, -2.4, 3], system: "19:247:2", className: "ocean", faction: "unknown", shielded: false, metal: 5200, crystal: 11800, deuterium: 6800, fleetPower: 4000 },
        ],
        missions: [
          { id: "mission-1", sourceId: "aurelia", destinationId: "titan", kind: "transport", progress: 0.58, etaSeconds: 2538 },
          { id: "mission-2", sourceId: "vanta", destinationId: "aurelia", kind: "espionage", progress: 0.22, etaSeconds: 5140 },
        ],
      };
    },
  };
}
