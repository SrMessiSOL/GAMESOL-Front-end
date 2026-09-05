import { starTypeIndexForSystem } from "./stellar-system";

export type PlanetClass = "ocean" | "volcanic" | "ice" | "gas" | "terran";
export type PlanetTextureKind = "terran" | "ocean" | "rocky" | "gas";

export type PlanetSurfaceStyle = {
  name: string;
  biomeKey?: string;
  className: PlanetClass;
  texture: "ocean" | "gas";
  water: string;
  coast: string;
  land: string;
  highland: string;
  polar: string;
  site: string;
  atmosphere: string;
  previewColor: string;
  emissive: string;
  roughness: number;
  metalness: number;
  rings: boolean;
  variantSeed?: number;
  proceduralSeed?: number;
  textureRepeat?: [number, number];
  textureOffset?: [number, number];
};

type StellarEcology = {
  name: string;
  tint: string;
  atmosphere: string;
  heat: number;
};

const STELLAR_ECOLOGIES: readonly StellarEcology[] = [
  { name: "Ember", tint: "#ff7548", atmosphere: "#ff9a63", heat: .2 },
  { name: "Helios", tint: "#ffd47a", atmosphere: "#ffe5a3", heat: .13 },
  { name: "Auric", tint: "#ffe8b8", atmosphere: "#fff0c9", heat: .08 },
  { name: "Pearl", tint: "#fff3dc", atmosphere: "#fff8e9", heat: .04 },
  { name: "Cerulean", tint: "#71a9ff", atmosphere: "#8fc6ff", heat: -.05 },
  { name: "Ghostlight", tint: "#d9edf5", atmosphere: "#effbff", heat: -.18 },
  { name: "Roseflare", tint: "#ff856e", atmosphere: "#ffad91", heat: .15 },
  { name: "Boreal", tint: "#7fc9ff", atmosphere: "#a8ddff", heat: -.1 },
  { name: "Inferno", tint: "#ff543d", atmosphere: "#ff8769", heat: .23 },
  { name: "Ultraviolet", tint: "#96b8ff", atmosphere: "#bdd4ff", heat: -.12 },
  { name: "Crimson", tint: "#ff496a", atmosphere: "#ff8297", heat: .17 },
  { name: "Wolfwind", tint: "#b987ff", atmosphere: "#d5b8ff", heat: -.02 },
  { name: "Cryogenic", tint: "#d9efff", atmosphere: "#ecf8ff", heat: -.22 },
  { name: "Pulsewake", tint: "#82dcff", atmosphere: "#b6edff", heat: -.16 },
  { name: "Magnetar", tint: "#d6b5ff", atmosphere: "#e8d8ff", heat: -.13 },
  { name: "Twinlight", tint: "#ffd69a", atmosphere: "#ffe8bd", heat: .1 },
  { name: "Afterglow", tint: "#c991ff", atmosphere: "#dfbdff", heat: -.04 },
] as const;

const BIOME_STEPS = [1, 2, 4, 7, 8, 11, 13, 14] as const;

function visualHash(galaxy: number, system: number, position: number, salt = 0): number {
  let hash = 2166136261;
  for (const value of [galaxy, system, position, salt]) {
    hash ^= Math.trunc(value) >>> 0;
    hash = Math.imul(hash, 16777619);
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

function blendHex(base: string, tint: string, amount: number): string {
  const parse = (value: string, channel: number) => Number.parseInt(value.slice(1 + channel * 2, 3 + channel * 2), 16);
  const mixed = [0, 1, 2].map((channel) => Math.round(parse(base, channel) + (parse(tint, channel) - parse(base, channel)) * amount));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

// One deterministic visual identity for every orbital position. These values
// are shared by the system map and the close planet view so a world never
// changes art direction when the player opens it.
export const PLANET_SURFACE_STYLES: readonly PlanetSurfaceStyle[] = [
  { name: "Cinder", className: "volcanic", texture: "gas", water: "#280b07", coast: "#5f1709", land: "#9b3d13", highland: "#dc6a23", polar: "#ffc06a", site: "#743015", atmosphere: "#ff6e32", previewColor: "#ff7040", emissive: "#64180c", roughness: .48, metalness: .08, rings: false },
  { name: "Magma", className: "volcanic", texture: "gas", water: "#2a0d04", coast: "#7b2208", land: "#bf4a14", highland: "#ff8a2c", polar: "#ffd06a", site: "#8b3713", atmosphere: "#ff8a3d", previewColor: "#ff9a47", emissive: "#792008", roughness: .42, metalness: .1, rings: false },
  { name: "Ochre", className: "terran", texture: "ocean", water: "#51320e", coast: "#896329", land: "#b58a48", highland: "#dfbd73", polar: "#f2db9d", site: "#806333", atmosphere: "#f2c16f", previewColor: "#d6a55b", emissive: "#4f3214", roughness: .76, metalness: .03, rings: false },
  { name: "Dune", className: "terran", texture: "ocean", water: "#4a2512", coast: "#8c4920", land: "#b97033", highland: "#e5ad62", polar: "#f8d18b", site: "#805127", atmosphere: "#f5b45b", previewColor: "#e29a54", emissive: "#512612", roughness: .72, metalness: .04, rings: false },
  { name: "Archipelago", className: "ocean", texture: "ocean", water: "#083b58", coast: "#21695a", land: "#4f7b4c", highland: "#9a895c", polar: "#d9eddf", site: "#426c48", atmosphere: "#70d9b4", previewColor: "#5bc5b0", emissive: "#103f47", roughness: .34, metalness: .06, rings: false },
  { name: "Azure", className: "ocean", texture: "ocean", water: "#07577c", coast: "#14868d", land: "#4c886a", highland: "#799a70", polar: "#d6f5ed", site: "#3c7964", atmosphere: "#54d7ff", previewColor: "#62dcff", emissive: "#0a4968", roughness: .28, metalness: .08, rings: false },
  { name: "Slate", className: "terran", texture: "ocean", water: "#162c3b", coast: "#40564b", land: "#69705b", highland: "#a79572", polar: "#d5d7cb", site: "#5c6558", atmosphere: "#a7d8c0", previewColor: "#91b5a7", emissive: "#263c38", roughness: .68, metalness: .06, rings: false },
  { name: "Verdant", className: "terran", texture: "ocean", water: "#10414d", coast: "#1e6a55", land: "#38844c", highland: "#7aa05d", polar: "#e6f4d6", site: "#357346", atmosphere: "#72e0a2", previewColor: "#68d98b", emissive: "#164b3c", roughness: .52, metalness: .04, rings: false },
  { name: "Amethyst Giant", className: "gas", texture: "gas", water: "#18275c", coast: "#354d9d", land: "#5167b2", highland: "#9aa5df", polar: "#e7ecff", site: "#4b5ba0", atmosphere: "#9faeff", previewColor: "#a8a3ff", emissive: "#302a78", roughness: .5, metalness: .12, rings: true },
  { name: "Lagoon", className: "ocean", texture: "ocean", water: "#0d4357", coast: "#28715f", land: "#557b50", highland: "#947d54", polar: "#d9f0e2", site: "#456e49", atmosphere: "#83e0c8", previewColor: "#77d8c5", emissive: "#174d4f", roughness: .36, metalness: .05, rings: false },
  { name: "Cloud Forest", className: "terran", texture: "ocean", water: "#244256", coast: "#456d72", land: "#739078", highland: "#aeb894", polar: "#edf7ed", site: "#667e6b", atmosphere: "#a0e7de", previewColor: "#a5d6cb", emissive: "#355958", roughness: .46, metalness: .05, rings: false },
  { name: "Frost", className: "ice", texture: "ocean", water: "#164c73", coast: "#4d86a5", land: "#a2c6d7", highland: "#d8eef3", polar: "#ffffff", site: "#81afc1", atmosphere: "#a6e6ff", previewColor: "#c5efff", emissive: "#326e8e", roughness: .3, metalness: .16, rings: true },
  { name: "Glacier", className: "ice", texture: "ocean", water: "#17385e", coast: "#3d7094", land: "#86b3c3", highland: "#cce2e5", polar: "#ffffff", site: "#709fab", atmosphere: "#b5e4ff", previewColor: "#a9dfff", emissive: "#315d82", roughness: .26, metalness: .18, rings: false },
  { name: "Viridian Giant", className: "gas", texture: "gas", water: "#24340c", coast: "#596e13", land: "#859b22", highland: "#bbca45", polar: "#dded90", site: "#73891f", atmosphere: "#b5eb52", previewColor: "#b7dd58", emissive: "#4f6817", roughness: .54, metalness: .1, rings: true },
  { name: "Obsidian", className: "volcanic", texture: "gas", water: "#23252a", coast: "#4a4d53", land: "#6c6d68", highland: "#9f9685", polar: "#d0c9bd", site: "#5c5c58", atmosphere: "#c4c9cf", previewColor: "#a29b91", emissive: "#383a40", roughness: .62, metalness: .2, rings: false },
] as const;

export function planetSurfaceStyle(position: number): PlanetSurfaceStyle {
  const normalized = Number.isFinite(position) ? Math.trunc(position) : 1;
  const index = ((normalized - 1) % PLANET_SURFACE_STYLES.length + PLANET_SURFACE_STYLES.length) % PLANET_SURFACE_STYLES.length;
  return PLANET_SURFACE_STYLES[index];
}

export function planetClassForPosition(position: number): PlanetClass {
  return planetSurfaceStyle(position).className;
}

export function planetSurfaceStyleForSystem(position: number, galaxy: number, system: number): PlanetSurfaceStyle {
  const normalizedPosition = Math.max(1, Math.trunc(position) || 1);
  const normalizedGalaxy = Math.max(1, Math.min(999, Math.trunc(galaxy) || 1));
  const normalizedSystem = Math.max(1, Math.min(999, Math.trunc(system) || 1));
  const systemSeed = visualHash(galaxy, system, 0, 811);
  const ecology = STELLAR_ECOLOGIES[starTypeIndexForSystem(galaxy, system)];
  const step = BIOME_STEPS[(systemSeed >>> 5) % BIOME_STEPS.length];
  const offset = (systemSeed >>> 11) % PLANET_SURFACE_STYLES.length;
  const baseIndex = (offset + (normalizedPosition - 1) * step) % PLANET_SURFACE_STYLES.length;
  const base = PLANET_SURFACE_STYLES[baseIndex];
  const variantSeed = visualHash(galaxy, system, normalizedPosition, 1777);
  const stellarInfluence = .1 + ((variantSeed >>> 7) % 13) / 100;
  const radialHeat = 1 - Math.min(1, (normalizedPosition - 1) / 14);
  const heatInfluence = Math.max(0, ecology.heat * radialHeat);
  const textureScale = .92 + (variantSeed % 29) / 100;
  const textureScaleY = .94 + ((variantSeed >>> 8) % 23) / 100;
  return {
    ...base,
    name: `${ecology.name} ${base.name}`,
    biomeKey: base.name,
    atmosphere: blendHex(base.atmosphere, ecology.atmosphere, stellarInfluence + heatInfluence * .22),
    previewColor: blendHex(base.previewColor, ecology.tint, stellarInfluence + heatInfluence * .18),
    emissive: blendHex(base.emissive, ecology.tint, stellarInfluence * .72 + heatInfluence * .12),
    rings: base.rings || ((variantSeed >>> 17) % 31 === 0 && normalizedPosition > 7),
    variantSeed,
    // A collision-free identity for all 14,970,015 possible universe slots.
    // The hashed seed above is still used for visually random secondary traits.
    proceduralSeed: ((normalizedGalaxy - 1) * 999 + (normalizedSystem - 1)) * 15 + Math.min(15, normalizedPosition),
    textureRepeat: [textureScale, textureScaleY],
    textureOffset: [((variantSeed >>> 12) % 997) / 997, ((variantSeed >>> 20) % 251) / 251],
  };
}

export function planetTextureKind(style: PlanetSurfaceStyle): PlanetTextureKind {
  if (style.className === "gas") return "gas";
  if (style.className === "volcanic") return "rocky";
  if (style.className === "ocean" || style.className === "ice") return "ocean";
  return "terran";
}
