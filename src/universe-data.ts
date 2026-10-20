import { planetClassForPosition, type PlanetClass } from "./planet-style";
import { shortPlanetOwner } from './planet-owner';

export type UniversePlanet = {
  id: string;
  name: string;
  ownerLabel: string;
  ownerAddress?: string;
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
  ascendingNode?: number;
  phase: number;
  angularVelocity: number;
};

export function orbitForSystemPosition(position: number, seed = 0): UniverseOrbit {
  const slot = Math.max(1, Math.min(15, Math.trunc(position) || 1));
  const orbitSeed = Math.abs((seed * 1103515245) ^ (slot * 2654435761));
  const radius = 5.2 + slot * 3.15 + slot * slot * .05;
  return {
    radius,
    // Each planet lives inside its own radial shell. Keeping eccentricity in
    // this narrow range prevents neighboring shells from intersecting even
    // when their orbital planes and phases differ.
    ellipse: .965 + (orbitSeed % 7) * .004,
    inclination: (((orbitSeed >>> 5) % 17) - 8) * .018,
    ascendingNode: ((orbitSeed >>> 10) % 360) * (Math.PI / 180),
    phase: (((seed * 97) + (slot * 137)) % 360) * (Math.PI / 180),
    angularVelocity: 0.009 / Math.sqrt(radius / 8),
  };
}

export function pointOnUniverseOrbit(orbit: UniverseOrbit, angle = orbit.phase): [number, number, number] {
  const localX = Math.cos(angle) * orbit.radius;
  const localZ = Math.sin(angle) * orbit.radius * orbit.ellipse;
  const node = orbit.ascendingNode ?? 0;
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  return [
    localX * cosNode - localZ * sinNode,
    Math.sin(angle) * orbit.radius * orbit.inclination,
    localX * sinNode + localZ * cosNode,
  ];
}

export type UniverseMission = {
  id: string;
  sourceId: string;
  destinationId: string;
  sourceCoordinates?: [number, number, number];
  destinationCoordinates?: [number, number, number];
  destinationPosition?: { galaxy: number; system: number; position: number };
  sourcePosition?: { galaxy: number; system: number; position: number };
  destinationOrbit?: UniverseOrbit;
  destinationClearance?: number;
  sampledAt?: number;
  kind: "transport" | "attack" | "espionage" | "colonize";
  phase: "outbound" | "arrived" | "returning" | "returned";
  progress: number;
  etaSeconds: number;
  durationSeconds: number;
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
  if (code === 1) return "attack";
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
      ownerLabel: shortPlanetOwner(planet.owner),
      ownerAddress: planet.owner,
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
  for (const source of planets) {
    for (const [slot, mission] of (source.missions ?? []).entries()) {
      // A populated mission slot remains authoritative until the player
      // resolves it on-chain, including while it waits at either endpoint.
      const active = mission.missionType > 0 && mission.departTs > 0;
      if (!active) continue;
      const key = `${mission.targetGalaxy}:${mission.targetSystem}:${mission.targetPosition}`;
      const destinationId = coordinateMap.get(key) ?? `G${mission.targetGalaxy}S${mission.targetSystem}P${mission.targetPosition}`;
      missions.push({
        id: `${source.entity}-${slot}`,
        sourceId: source.entity,
        destinationId,
        destinationPosition: { galaxy: mission.targetGalaxy, system: mission.targetSystem, position: mission.targetPosition },
        sourcePosition: { galaxy: source.galaxy, system: source.system, position: source.position },
        sampledAt: now,
        kind: missionKindFromCode(mission.missionType),
        phase: mission.applied
          ? now >= mission.returnTs ? "returned" : "returning"
          : now >= mission.arriveTs ? "arrived" : "outbound",
        progress: mission.applied
          ? Math.max(0, Math.min(1, (now - mission.arriveTs) / Math.max(1, mission.returnTs - mission.arriveTs)))
          : now >= mission.arriveTs
            ? 1
            : Math.max(0, Math.min(1, (now - mission.departTs) / Math.max(1, mission.arriveTs - mission.departTs))),
        etaSeconds: etaForMission(mission),
        durationSeconds: mission.applied
          ? Math.max(1, mission.returnTs - mission.arriveTs)
          : Math.max(1, mission.arriveTs - mission.departTs),
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
          { id: "mission-1", sourceId: "aurelia", destinationId: "titan", kind: "transport", phase: "outbound", progress: 0.58, etaSeconds: 2538, durationSeconds: 6042 },
          { id: "mission-2", sourceId: "vanta", destinationId: "aurelia", kind: "espionage", phase: "outbound", progress: 0.22, etaSeconds: 5140, durationSeconds: 6590 },
        ],
      };
    },
  };
}
