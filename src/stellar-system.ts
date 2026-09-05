export const GALAXY_KINDS = ["spiral", "barred", "elliptical", "lenticular", "irregular", "spiral"] as const;
export type GalaxyKind = typeof GALAXY_KINDS[number];

export type StarDefinition = {
  color: string;
  scale: number;
  label: string;
  binary?: boolean;
  remnant?: boolean;
  phenomenon?: "wolf-rayet" | "pulsar" | "magnetar";
};

export const STAR_TYPES: readonly StarDefinition[] = [
  { color: "#ef4f32", scale: 0.38, label: "Red Dwarf" },
  { color: "#ff9d64", scale: 0.7, label: "Orange Dwarf" },
  { color: "#ffd78a", scale: 1, label: "Yellow Dwarf" },
  { color: "#fff1d2", scale: 1.1, label: "White Main Sequence" },
  { color: "#c9e2ff", scale: 1.32, label: "Blue Main Sequence" },
  { color: "#f5fbff", scale: 0.46, label: "White Dwarf" },
  { color: "#ff7554", scale: 2.15, label: "Red Giant" },
  { color: "#a9d7ff", scale: 2.3, label: "Blue Giant" },
  { color: "#ff553d", scale: 2.7, label: "Red Supergiant" },
  { color: "#b9d6ff", scale: 3, label: "Blue Supergiant" },
  { color: "#ff496a", scale: 1.82, label: "Carbon Star" },
  { color: "#b987ff", scale: 1.72, label: "Wolf-Rayet Star", phenomenon: "wolf-rayet" },
  { color: "#d9efff", scale: 0.25, label: "Neutron Star" },
  { color: "#82dcff", scale: 0.3, label: "Pulsar", phenomenon: "pulsar" },
  { color: "#d6b5ff", scale: 0.35, label: "Magnetar", phenomenon: "magnetar" },
  { color: "#ffe19a", scale: 1.05, label: "Binary System", binary: true },
  { color: "#c991ff", scale: 1.7, label: "Supernova Remnant", remnant: true },
] as const;

// Curated weights preserve an astrophysical dwarf/main-sequence majority while
// ensuring a player encounters meaningful visual variety in every galaxy.
const BASE_STAR_WEIGHTS = [16, 13, 12, 9, 8, 5, 7, 6, 4, 3.5, 4, 3.5, 2.5, 2, 1.2, 2, 1.3] as const;

export type GalaxySystemLayout = {
  position: [number, number, number];
  normalizedRadius: number;
  armRegion: boolean;
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function mixedSystemSeed(galaxy: number, system: number, salt: number): number {
  let value = Math.imul(galaxy ^ salt, 0x45d9f3b) ^ Math.imul(system + salt, 0x27d4eb2d);
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

export function galaxyKindForId(galaxy: number): GalaxyKind {
  return GALAXY_KINDS[galaxy % GALAXY_KINDS.length];
}

export function galaxySystemLayout(galaxy: number, system: number): GalaxySystemLayout {
  const kind = galaxyKindForId(galaxy);
  const random = seeded(mixedSystemSeed(galaxy, system, 31337));
  const twist = ((galaxy * 37) % 360) * (Math.PI / 180);
  const diskRadius = 53;

  if (kind === "elliptical") {
    const radius = Math.pow(random(), .76) * diskRadius;
    const angle = random() * Math.PI * 2;
    const verticalAngle = Math.asin(random() * 2 - 1);
    const thickness = .28 + random() * .22;
    return {
      position: [Math.cos(angle) * Math.cos(verticalAngle) * radius, Math.sin(verticalAngle) * radius * thickness, Math.sin(angle) * Math.cos(verticalAngle) * radius * .76],
      normalizedRadius: radius / diskRadius,
      armRegion: false,
    };
  }

  if (kind === "irregular") {
    const clump = system % 5;
    const clumpRandom = seeded(mixedSystemSeed(galaxy, clump + 1, 8191));
    const centerAngle = twist + clumpRandom() * Math.PI * 2;
    const centerRadius = 7 + clumpRandom() * 34;
    const spread = 5 + clumpRandom() * 9;
    const localRadius = Math.sqrt(random()) * spread;
    const localAngle = random() * Math.PI * 2;
    const x = Math.cos(centerAngle) * centerRadius + Math.cos(localAngle) * localRadius;
    const z = Math.sin(centerAngle) * centerRadius * .7 + Math.sin(localAngle) * localRadius;
    return { position: [x, (random() - .5) * 18 + Math.sin(localAngle) * 4.4, z], normalizedRadius: Math.min(1, Math.hypot(x, z) / diskRadius), armRegion: true };
  }

  const coreBiased = random() < .025;
  const radius = coreBiased
    ? 7.5 + Math.pow(random(), 1.5) * 12
    : 8.5 + Math.pow(random(), kind === "lenticular" ? .68 : .54) * (diskRadius - 8.5);
  if (kind === "lenticular") {
    const angle = twist + random() * Math.PI * 2;
    const bulge = Math.max(0, 1 - radius / 18);
    const warp = Math.sin(angle * 2 + twist) * (1.8 + radius * .05);
    return {
      position: [Math.cos(angle) * radius, (random() - .5) * (7 + bulge * 14 + radius * .085) + warp, Math.sin(angle) * radius * .82],
      normalizedRadius: radius / diskRadius,
      armRegion: false,
    };
  }

  const armCount = kind === "barred" ? 2 : 4;
  const arm = system % armCount;
  const armAngle = twist + arm * (Math.PI * 2 / armCount) + radius * (kind === "barred" ? .118 : .145);
  const interarm = random() < .14;
  const angle = armAngle + (random() - .5) * (.32 + radius * .008) + (interarm ? (random() - .5) * 1.05 : 0);
  if (kind === "barred" && radius < 17) {
    const alongBar = (random() < .5 ? -1 : 1) * (3 + random() * 16);
    return {
      position: [Math.cos(twist) * alongBar + (random() - .5) * 2.8, (random() - .5) * 12.5, Math.sin(twist) * alongBar * .72 + (random() - .5) * 2.8],
      normalizedRadius: Math.abs(alongBar) / diskRadius,
      armRegion: false,
    };
  }
  const scatteredRadius = Math.max(2, radius + (random() - .5) * (2.2 + radius * .045));
  const diskThickness = 8 + radius * .12;
  const galacticWarp = Math.sin(angle * 2 + twist) * (2.2 + radius * .052);
  return {
    position: [Math.cos(angle) * scatteredRadius, (random() - .5) * diskThickness + galacticWarp, Math.sin(angle) * scatteredRadius * .82],
    normalizedRadius: radius / diskRadius,
    armRegion: radius > 14,
  };
}

export function starTypeIndexForSystem(galaxy: number, system: number): number {
  const layout = galaxySystemLayout(galaxy, system);
  const roll = seeded(mixedSystemSeed(galaxy, system, 65521))();
  const weights = [...BASE_STAR_WEIGHTS];

  // Spiral arms favor young hot stars; cores favor evolved stars and stellar
  // remnants; the outer halo remains cooler and dwarf-heavy.
  if (layout.armRegion) {
    weights[0] -= 2.5;
    weights[1] -= 1.5;
    weights[4] += 2.2;
    weights[7] += 1.1;
    weights[9] += .7;
  }
  if (layout.normalizedRadius < .18) {
    weights[0] -= 2;
    weights[6] += 1.2;
    weights[10] += 1;
    weights[16] += .8;
  } else if (layout.normalizedRadius > .78) {
    weights[0] += 3;
    weights[1] += 1.5;
    weights[8] -= 1;
    weights[9] -= .7;
  }

  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  let cursor = roll * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= Math.max(0, weights[index]);
    if (cursor <= 0) return index;
  }
  return weights.length - 1;
}

export function starForSystem(galaxy: number, system: number): StarDefinition {
  return STAR_TYPES[starTypeIndexForSystem(galaxy, system)];
}
