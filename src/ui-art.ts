import { SHIP_ART as fleetArt } from './ship-catalog';
import './ship-artwork.css';

const artModules = import.meta.glob("./assets/ui/*.webp", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const premiumArtModules = import.meta.glob("./assets/ui/*-v2.jpg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const artIndex = new Map<string, string>();

for (const [path, url] of [...Object.entries(artModules), ...Object.entries(premiumArtModules)]) {
  const filename = path.split("/").pop() ?? "";
  const stem = filename.replace(/-v2\.(png|webp|jpg|jpeg)$/i, "").replace(/\.(png|webp|jpg|jpeg)$/i, "").toLowerCase();
  artIndex.set(stem, url);
}

export const UI_ART_EXPECTED_KEYS = [
  "metalMine",
  "crystalMine",
  "deuteriumSynthesizer",
  "solarPlant",
  "fusionReactor",
  "roboticsFactory",
  "naniteFactory",
  "shipyard",
  "metalStorage",
  "crystalStorage",
  "deuteriumTank",
  "researchLab",
  "energyTech",
  "combustionDrive",
  "impulseDrive",
  "hyperspaceDrive",
  "computerTech",
  "astrophysics",
  "igrNetwork",
  "smallCargo",
  "largeCargo",
  "lightFighter",
  "heavyFighter",
  "cruiser",
  "battleship",
  "battlecruiser",
  "bomber",
  "destroyer",
  "deathstar",
  "recycler",
  "espionageProbe",
  "colonyShip",
  "solarSatellite",
  "rocketLauncher",
  "lightLaser",
  "heavyLaser",
  "gaussCannon",
  "ionCannon",
  "plasmaTurret",
  "smallShieldDome",
  "largeShieldDome",
  "antiBallisticMissile",
  "interplanetaryMissile",
] as const;

function toLookupKey(key: string): string {
  return key.trim().toLowerCase();
}

export function resolveGameArt(key: string, fallback: string): string {
  const ship = fleetArt.get(toLookupKey(key));
  if (ship) return `url("${ship}")`;
  const resolved = artIndex.get(toLookupKey(key));
  return resolved ? `url("${resolved}")` : fallback;
}

export function resolveGameArtUrl(key: string): string | null {
  return fleetArt.get(toLookupKey(key)) ?? artIndex.get(toLookupKey(key)) ?? null;
}
