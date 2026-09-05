import type { PlanetSurfaceStyle } from "./planet-style";
import cinder from "./assets/planet-biomes/cinder.jpg";
import magma from "./assets/planet-biomes/magma.jpg";
import ochre from "./assets/planet-biomes/ochre.jpg";
import dune from "./assets/planet-biomes/dune.jpg";
import archipelago from "./assets/planet-biomes/archipelago.jpg";
import azure from "./assets/planet-biomes/azure.jpg";
import slate from "./assets/planet-biomes/slate.jpg";
import verdant from "./assets/planet-biomes/verdant.jpg";
import amethystGiant from "./assets/planet-biomes/amethyst-giant.jpg";
import lagoon from "./assets/planet-biomes/lagoon.jpg";
import cloudForest from "./assets/planet-biomes/cloud-forest.jpg";
import frost from "./assets/planet-biomes/frost.jpg";
import glacier from "./assets/planet-biomes/glacier.jpg";
import viridianGiant from "./assets/planet-biomes/viridian-giant.jpg";
import obsidian from "./assets/planet-biomes/obsidian.jpg";

export const PLANET_BIOME_TEXTURES: Readonly<Record<string, string>> = {
  Cinder: cinder,
  Magma: magma,
  Ochre: ochre,
  Dune: dune,
  Archipelago: archipelago,
  Azure: azure,
  Slate: slate,
  Verdant: verdant,
  "Amethyst Giant": amethystGiant,
  Lagoon: lagoon,
  "Cloud Forest": cloudForest,
  Frost: frost,
  Glacier: glacier,
  "Viridian Giant": viridianGiant,
  Obsidian: obsidian,
};

export const PLANET_BIOME_TEXTURE_URLS = Object.values(PLANET_BIOME_TEXTURES);

export function planetBiomeTexture(style: PlanetSurfaceStyle): string {
  return PLANET_BIOME_TEXTURES[style.biomeKey ?? style.name] ?? cinder;
}

export function planetBiomeIndex(style: PlanetSurfaceStyle): number {
  const index = Object.keys(PLANET_BIOME_TEXTURES).indexOf(style.biomeKey ?? style.name);
  return index >= 0 ? index : 0;
}
