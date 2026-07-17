export type PlanetClass = "ocean" | "volcanic" | "ice" | "gas" | "terran";

export type PlanetSurfaceStyle = {
  name: string;
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
};

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
