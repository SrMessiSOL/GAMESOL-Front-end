import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ArcballControls, Billboard, Environment, Lightformer, Stars, Text, useGLTF, useTexture } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Activity, Building2, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, Crosshair, FlaskConical, Gem, Hammer, Inbox, LoaderCircle, Menu, Pickaxe, Rocket, RotateCcw, Scale, Shield, ShoppingCart, Trophy, Users, X, Zap } from "lucide-react";
import { ALLIANCE_CREATE_ANTIMATTER_COST, ALLIANCE_CREATE_USDC_COST, BUILDINGS, EXPLORER_CLUSTER, GAMESOL_GOVERNANCE_ROOT_ENABLED, NETWORK_LABEL, SHIPS, SHIP_TYPE_IDX, SYSTEM_SOVEREIGNTY_ACTION_COSTS, buildTimeSecs, energyEfficiency, upgradeCost, type AllianceDecisionAccount, type AllianceGovernanceConfigAccount, type AllianceJoinRequestAccount, type AllianceMembershipAccount, type AllianceStateAccount, type AllianceTreasuryStateAccount, type BattleResolvedEventRecord, type EspionageReportEventRecord, type GameClient, type GamesolGovernanceConfigAccount, type PlayerState, type QuestProgressStateAccount, type QuestRewardTargetStateAccount, type QuestStateAccount, type StoreConfigState, type StorePurchaseStateAccount } from "./game-state";
import { PublicKey } from "@solana/web3.js";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { activeQuestDefinitions, allianceBuildingCost, ALLIANCE_BUILDINGS, ALLIANCE_DEPOSIT_DEFINITIONS, hasQuestBit, questClaimedMask, questGroupResetSeconds, questRewardTargetForRequirement, STORE_PACKS, storePurchasedMask, tutorialQuestsComplete, type QuestDefinition } from "./App";
import gamesolMark from "./assets/ui/logobg.png";
import WalletConnectControl from "./WalletConnectControl";
import { CommanderAvatar } from "./CryptoUfos";
import { SceneReady, useCameraInputCancel } from './SceneTransition';
import { easeSceneProgress, motionDuration } from './scene-motion';
import usdcCoin from "./assets/ui/usdc.svg";
import "./planet-world.css";
import "./planet-world-extra.css";
import "./planet-world-local.css";
import './game-polish.css';
import { GameButton, GameIconButton } from './design-system/game-ui';
import { CommandActionButton, CommandQuantity } from './design-system/command-controls';
import { StorePackCard, StorePurchaseReview } from './StoreControls';
import { formatUsdc, isWholeQuantity, storePurchaseEligibility } from './command-validation';
import type { StorePack } from './store-catalog';
import './command-workspace.css';
import { resolveGameArt, resolveGameArtUrl } from "./ui-art";
import type { MarketClient } from "./market-client";
import MarketTab from "./Markettab";
import { BUILDING_REQUIREMENTS } from "./combat-engine";
import { planetSurfaceStyleForSystem, type PlanetSurfaceStyle } from "./planet-style";
import { planetBiomeIndex } from "./planet-biome-assets";
import { useProceduralPlanetTexture } from "./procedural-planet-texture";
import { buyDecisionMarketSide, estimateDecisionMarketBuyMinimum, estimateDecisionMarketSellMinimum, fetchDecisionMarket, sellDecisionMarketSide, type DecisionMarketSide, type DecisionMarketSnapshot } from "./futarchy-market";
import terranClouds from "./assets/planet-world/terran-clouds-v2.webp";
import cinematicNebulaPanorama from "./assets/universe-lab/cinematic-nebula-panorama-v2.webp";
import stellarFlare from "./assets/universe-lab/stellar-flare-v2.webp";
const MODEL_ROOT = "/planet-models/quaternius";

function PlanetCommandState({ kind, title, description, compact = false }: { kind: "loading" | "empty" | "unavailable"; title: string; description: string; compact?: boolean }) {
  const Icon = kind === "loading" ? LoaderCircle : kind === "unavailable" ? CircleAlert : Inbox;
  return <section className={`pw-command-state is-${kind}${compact ? " is-compact" : ""}`} role={kind === "loading" ? "status" : undefined} aria-live={kind === "loading" ? "polite" : undefined}>
    <span className="pw-command-state-icon" aria-hidden="true"><Icon /></span>
    <div><strong>{title}</strong><p>{description}</p></div>
    {kind === "loading" && <div className="pw-command-state-progress" aria-hidden="true"><i /><i /><i /></div>}
  </section>;
}

function terrainSignal(normal: THREE.Vector3): number {
  return Math.sin(normal.x * 4.8 + normal.z * 3.4) + Math.sin(normal.y * 7.6 - normal.x * 2.3) * .55 + Math.cos(normal.z * 9.2) * .3 + facilityLandInfluence(normal) * .72;
}

function terrainRadius(normal: THREE.Vector3): number {
  const continent = terrainSignal(normal);
  return 5.72 + Math.max(0, continent - .42) * .24 + Math.max(0, continent - .05) * .055;
}

function seededTerrainSignal(normal: THREE.Vector3, style: PlanetSurfaceStyle): number {
  const seed = style.proceduralSeed ?? style.variantSeed ?? 1;
  const phase = (seed % 4093) / 4093 * Math.PI * 2;
  const rotation = ((seed >>> 9) % 997) / 997 * Math.PI * 2;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const x = normal.x * cosine - normal.z * sine;
  const z = normal.x * sine + normal.z * cosine;
  const broad = Math.sin(x * (3.15 + (seed % 7) * .23) + z * 2.4 + phase);
  const ridges = Math.sin(normal.y * (6.2 + ((seed >>> 5) % 9) * .21) - x * 3.3 + phase * .63) * .56;
  const detail = Math.cos(z * (8.1 + ((seed >>> 13) % 11) * .18) + normal.y * 2.7 - phase * 1.21) * .31;
  return broad + ridges + detail + facilityLandInfluence(normal) * .78;
}

function terrainRadiusForStyle(normal: THREE.Vector3, style: PlanetSurfaceStyle): number {
  if (style.className === "gas") return 5.78 + seededTerrainSignal(normal, style) * .012;
  const continent = seededTerrainSignal(normal, style);
  const amplitude = style.className === "volcanic" ? 1.34 : style.className === "ice" ? 1.12 : style.className === "ocean" ? .7 : .94;
  const uniqueRadius = 5.71 + Math.max(0, continent - .36) * .235 * amplitude + Math.max(0, continent + .08) * .052 * amplitude;
  const facilityBlend = THREE.MathUtils.smoothstep(facilityLandInfluence(normal), .18, .82);
  return THREE.MathUtils.lerp(uniqueRadius, terrainRadius(normal), facilityBlend);
}

function facilityLandInfluence(normal: THREE.Vector3): number {
  let strongest = 0;
  for (const [latitude, longitude] of FACILITY_SPOTS) {
    const site = new THREE.Vector3(
      Math.cos(latitude) * Math.sin(longitude),
      Math.sin(latitude),
      Math.cos(latitude) * Math.cos(longitude),
    );
    const dot = normal.dot(site);
    const influence = THREE.MathUtils.smoothstep(dot, .82, .985);
    strongest = Math.max(strongest, influence);
  }
  return strongest;
}

type FacilityBlueprint = {
  base: string;
  core: string;
  detail: string;
  baseScale: number;
  coreScale: number;
  detailScale: number;
  yaw: number;
  baseTint: string;
  coreTint: string;
  detailTint: string;
};

const FACILITY_BLUEPRINTS: FacilityBlueprint[] = [
  { base: "Platforms/Platform_DarkPlates.gltf", core: "Columns/Column_Pipes.gltf", detail: "Props/Prop_Vent_Big.gltf", baseScale: .20, coreScale: .14, detailScale: .16, yaw: -.35, baseTint: "#253846", coreTint: "#627d89", detailTint: "#c2803c" },
  { base: "Platforms/Platform_Metal2_Curve.gltf", core: "Columns/Column_Astra.gltf", detail: "Props/Prop_Light_Wide.gltf", baseScale: .21, coreScale: .15, detailScale: .17, yaw: .42, baseTint: "#183944", coreTint: "#47bce0", detailTint: "#a9efff" },
  { base: "Platforms/Platform_Round1.gltf", core: "Columns/Column_Round.gltf", detail: "Props/Prop_Computer.gltf", baseScale: .20, coreScale: .13, detailScale: .17, yaw: -.55, baseTint: "#183f42", coreTint: "#4db8a1", detailTint: "#94ebd4" },
  { base: "Platforms/Platform_Squares.gltf", core: "Columns/Column_Simple.gltf", detail: "Props/Prop_Light_Floor.gltf", baseScale: .22, coreScale: .15, detailScale: .18, yaw: .2, baseTint: "#4d3c21", coreTint: "#d6a541", detailTint: "#fff1a3" },
  { base: "Platforms/Platform_Metal_Curve.gltf", core: "Columns/Column_Hollow.gltf", detail: "Props/Prop_Fan_Small.gltf", baseScale: .21, coreScale: .15, detailScale: .18, yaw: -.2, baseTint: "#27304f", coreTint: "#6e78dc", detailTint: "#a8b4ff" },
  { base: "Platforms/Platform_3Plates.gltf", core: "Columns/Column_Large_Straight.gltf", detail: "Props/Prop_AccessPoint.gltf", baseScale: .21, coreScale: .14, detailScale: .16, yaw: .65, baseTint: "#293746", coreTint: "#5d8fac", detailTint: "#8ee6ff" },
  { base: "Platforms/Platform_Rails_4.gltf", core: "Columns/Column_MetalSupport.gltf", detail: "Props/Prop_Cable_3.gltf", baseScale: .19, coreScale: .15, detailScale: .20, yaw: -.7, baseTint: "#402f4f", coreTint: "#a76add", detailTint: "#e2b5ff" },
  { base: "Platforms/Platform_Metal.gltf", core: "Platforms/Door_Frame_SquareTall.gltf", detail: "Props/Prop_Rail_4.gltf", baseScale: .23, coreScale: .20, detailScale: .19, yaw: .25, baseTint: "#31424b", coreTint: "#8babb8", detailTint: "#d9edf0" },
  { base: "Platforms/Platform_Simple2.gltf", core: "Props/Prop_Barrel_Large.gltf", detail: "Props/Prop_Crate4.gltf", baseScale: .21, coreScale: .16, detailScale: .15, yaw: -.45, baseTint: "#3a4148", coreTint: "#7b8790", detailTint: "#c0c8cd" },
  { base: "Platforms/Platform_Simple2_Curve.gltf", core: "Props/Prop_Chest.gltf", detail: "Props/Prop_Light_Small.gltf", baseScale: .21, coreScale: .21, detailScale: .16, yaw: .55, baseTint: "#253c52", coreTint: "#6397be", detailTint: "#9ce7ff" },
  { base: "Platforms/Platform_DarkPlates_Curves.gltf", core: "Props/Prop_Barrel_Large.gltf", detail: "Props/Prop_Vent_Wide.gltf", baseScale: .20, coreScale: .16, detailScale: .16, yaw: -.1, baseTint: "#274145", coreTint: "#6c8b80", detailTint: "#90dcb9" },
  { base: "Platforms/Platform_CenterPlate_Curve.gltf", core: "Columns/Column_Astra.gltf", detail: "Props/Prop_Computer.gltf", baseScale: .20, coreScale: .14, detailScale: .17, yaw: .7, baseTint: "#29334c", coreTint: "#9a79cb", detailTint: "#cdb9ff" },
  { base: "Platforms/Platform_Round1.gltf", core: "Columns/Column_Pipes.gltf", detail: "Props/Prop_Light_Corner.gltf", baseScale: .20, coreScale: .13, detailScale: .17, yaw: -.65, baseTint: "#293d47", coreTint: "#4f9eae", detailTint: "#83e8f6" },
];

const FACILITY_SPOTS: Array<[number, number]> = [
  [.98, -1.72], [.62, -.72], [1.15, .12], [.48, 1.22], [.95, 2.1],
  [.08, -1.18], [-.42, -.45], [.12, .15], [-.55, .78], [-.08, 1.7],
  [-1.06, -1.63], [-.86, -.82], [-1.16, .56],
];

const RESEARCH = [
  { name: "Energy Technology", key: "energyTech", desc: "Raises Fusion Reactor energy output by 10%.", cost: [0, 800, 400] },
  { name: "Combustion Drive", key: "combustionDrive", desc: "Improves travel speed for combustion-drive ships.", cost: [400, 0, 600] },
  { name: "Impulse Drive", key: "impulseDrive", desc: "Improves travel speed for impulse-drive ships.", cost: [2000, 4000, 600] },
  { name: "Hyperspace Drive", key: "hyperspaceDrive", desc: "Improves travel speed for hyperspace-drive ships.", cost: [10000, 20000, 6000] },
  { name: "Computer Technology", key: "computerTech", desc: "Advances toward additional usable mission slots.", cost: [0, 400, 600] },
  { name: "Astrophysics", key: "astrophysics", desc: "Advances colonization capacity and colony requirements.", cost: [4000, 2000, 1000] },
  { name: "Intergalactic Research Network", key: "igrNetwork", desc: "Increases the research-network level and laboratory requirements.", cost: [240000, 400000, 160000] },
  { name: "Weapons Technology", key: "weaponsTechnology", desc: "Increases weapons effectiveness for ships and defenses.", cost: [800, 200, 0] },
  { name: "Shielding Technology", key: "shieldingTechnology", desc: "Increases shielding effectiveness for ships and defenses.", cost: [200, 600, 0] },
  { name: "Armor Technology", key: "armorTechnology", desc: "Increases armor effectiveness for ships and defenses.", cost: [1000, 0, 0] },
] as const;

const DEFENSE = [
  { name: "Rocket Launcher", key: "rocketLauncher", role: "KINETIC BATTERY", desc: "Reliable surface defense for the first layer of a planetary grid.", cost: [2000, 0, 0] },
  { name: "Light Laser", key: "lightLaser", role: "LASER BATTERY", desc: "Low-cost directed-energy coverage for sustained perimeter defense.", cost: [1500, 500, 0] },
  { name: "Heavy Laser", key: "heavyLaser", role: "HEAVY BATTERY", desc: "Reinforced laser emplacement for stronger orbital resistance.", cost: [6000, 2000, 0] },
  { name: "Gauss Cannon", key: "gaussCannon", role: "MASS DRIVER", desc: "High-impact electromagnetic artillery for hardened targets.", cost: [20000, 15000, 2000] },
  { name: "Ion Cannon", key: "ionCannon", role: "ION BATTERY", desc: "Shield-focused energy defense supported by advanced technology.", cost: [2000, 6000, 0] },
  { name: "Plasma Turret", key: "plasmaTurret", role: "PLASMA BATTERY", desc: "Endgame surface weapon requiring a mature technology stack.", cost: [50000, 50000, 30000] },
  { name: "Small Shield Dome", key: "smallShieldDome", role: "PLANETARY SHIELD", desc: "A unique defensive field protecting the planetary command zone.", cost: [10000, 10000, 0] },
  { name: "Large Shield Dome", key: "largeShieldDome", role: "PLANETARY SHIELD", desc: "A unique large-scale field for advanced planetary protection.", cost: [50000, 50000, 0] },
  { name: "Anti-Ballistic Missile", key: "antiBallisticMissile", role: "MISSILE DEFENSE", desc: "Interceptor stockpile produced through the planetary missile silo.", cost: [8000, 0, 2000] },
  { name: "Interplanetary Missile", key: "interplanetaryMissile", role: "STRATEGIC MISSILE", desc: "Long-range missile inventory enabled by silo infrastructure.", cost: [12500, 2500, 5000] },
] as const;

// Mirrors the proven launch safety rules in the preserved legacy App fleet modal.
const ATTACK_LAUNCH_COOLDOWN_SECONDS = 60;
const TARGET_ATTACK_COOLDOWN_SECONDS = 30 * 60;
const MIN_ATTACK_COMBAT_POINTS = 1_000;
const MAX_U64 = (1n << 64n) - 1n;

function storageCapacityAtLevel(level: number): bigint {
  const safeLevel = Math.max(0, Math.min(255, Math.floor(level)));
  const capacity = 10_000n * (1n << BigInt(safeLevel));
  return capacity > MAX_U64 ? MAX_U64 : capacity;
}

const SHIP_COMBAT_POINTS: Record<string, number> = { lightFighter: 50, heavyFighter: 150, cruiser: 400, battleship: 1_000, battlecruiser: 700, bomber: 1_000, destroyer: 2_000, deathstar: 200_000, smallCargo: 5, largeCargo: 5, recycler: 1, espionageProbe: 1, colonyShip: 50 };
const SHIP_FUEL: Record<string, number> = { smallCargo: 10, largeCargo: 50, lightFighter: 20, heavyFighter: 75, cruiser: 300, battleship: 500, battlecruiser: 250, bomber: 1_000, destroyer: 1_000, deathstar: 1, recycler: 300, espionageProbe: 1, colonyShip: 1_000 };

function missionFuelCost(ships: Record<string, number>, speedFactor: number): number {
  const baseFuel = Object.entries(ships).reduce((total, [key, quantity]) => total + (SHIP_FUEL[key] ?? 0) * Math.max(0, quantity), 0);
  if (baseFuel <= 0) return 0;
  const speed = Math.max(10, Math.min(100, speedFactor));
  return Math.max(1, Math.floor((baseFuel * speed ** 2) / 10_000));
}

type RequirementRow = { label: string; current: number; required: number };

const RESEARCH_LAB_REQUIREMENTS: Record<string, RequirementRow[]> = {
  energyTech: [{ label: "Research Lab", current: 0, required: 1 }],
  combustionDrive: [{ label: "Research Lab", current: 0, required: 1 }, { label: "Energy Technology", current: 0, required: 1 }],
  impulseDrive: [{ label: "Research Lab", current: 0, required: 5 }, { label: "Energy Technology", current: 0, required: 1 }],
  hyperspaceDrive: [{ label: "Research Lab", current: 0, required: 7 }],
  computerTech: [{ label: "Research Lab", current: 0, required: 1 }],
  astrophysics: [{ label: "Research Lab", current: 0, required: 3 }, { label: "Impulse Drive", current: 0, required: 3 }],
  igrNetwork: [{ label: "Research Lab", current: 0, required: 10 }, { label: "Computer Technology", current: 0, required: 8 }],
  weaponsTechnology: [{ label: "Research Lab", current: 0, required: 4 }],
  shieldingTechnology: [{ label: "Research Lab", current: 0, required: 6 }, { label: "Energy Technology", current: 0, required: 3 }],
  armorTechnology: [{ label: "Research Lab", current: 0, required: 2 }],
};

const SHIP_REQUIREMENTS: Record<string, Array<[string, string, number]>> = {
  smallCargo: [["Shipyard", "shipyard", 2], ["Combustion Drive", "combustionDrive", 2]],
  largeCargo: [["Shipyard", "shipyard", 4], ["Combustion Drive", "combustionDrive", 6]],
  lightFighter: [["Shipyard", "shipyard", 1]],
  heavyFighter: [["Shipyard", "shipyard", 3], ["Armor Technology", "armorTechnology", 2], ["Impulse Drive", "impulseDrive", 2]],
  cruiser: [["Shipyard", "shipyard", 5], ["Impulse Drive", "impulseDrive", 4]],
  battleship: [["Shipyard", "shipyard", 7], ["Hyperspace Drive", "hyperspaceDrive", 4]],
  battlecruiser: [["Shipyard", "shipyard", 8], ["Hyperspace Drive", "hyperspaceDrive", 5], ["Computer Technology", "computerTech", 5], ["Weapons Technology", "weaponsTechnology", 5]],
  bomber: [["Shipyard", "shipyard", 8], ["Impulse Drive", "impulseDrive", 6], ["Hyperspace Drive", "hyperspaceDrive", 5], ["Weapons Technology", "weaponsTechnology", 5]],
  destroyer: [["Shipyard", "shipyard", 9], ["Hyperspace Drive", "hyperspaceDrive", 6], ["Armor Technology", "armorTechnology", 6]],
  deathstar: [["Shipyard", "shipyard", 12], ["Hyperspace Drive", "hyperspaceDrive", 7], ["Weapons Technology", "weaponsTechnology", 10], ["Energy Technology", "energyTech", 12]],
  recycler: [["Shipyard", "shipyard", 4], ["Combustion Drive", "combustionDrive", 6], ["Shielding Technology", "shieldingTechnology", 2]],
  espionageProbe: [["Shipyard", "shipyard", 3], ["Combustion Drive", "combustionDrive", 3]],
  colonyShip: [["Shipyard", "shipyard", 4], ["Impulse Drive", "impulseDrive", 3], ["Astrophysics", "astrophysics", 4]],
  solarSatellite: [["Shipyard", "shipyard", 1]],
};

const DEFENSE_REQUIREMENTS: Record<string, Array<[string, string, number]>> = {
  rocketLauncher: [["Shipyard", "shipyard", 1]],
  lightLaser: [["Shipyard", "shipyard", 2]],
  heavyLaser: [["Shipyard", "shipyard", 4]],
  gaussCannon: [["Shipyard", "shipyard", 6], ["Weapons Technology", "weaponsTechnology", 3]],
  ionCannon: [["Shipyard", "shipyard", 4], ["Shielding Technology", "shieldingTechnology", 2]],
  plasmaTurret: [["Shipyard", "shipyard", 8], ["Shielding Technology", "shieldingTechnology", 8], ["Weapons Technology", "weaponsTechnology", 10], ["Energy Technology", "energyTech", 8]],
  smallShieldDome: [["Shipyard", "shipyard", 1], ["Shielding Technology", "shieldingTechnology", 2]],
  largeShieldDome: [["Shipyard", "shipyard", 1], ["Shielding Technology", "shieldingTechnology", 6]],
  antiBallisticMissile: [["Shipyard", "shipyard", 1], ["Missile Silo", "missileSilo", 1]],
  interplanetaryMissile: [["Shipyard", "shipyard", 1], ["Missile Silo", "missileSilo", 1]],
};

const FLEET_LAUNCH_KEY: Record<string, "sc" | "lc" | "lf" | "hf" | "cr" | "bs" | "bc" | "bm" | "ds" | "de" | "rec" | "ep" | "col"> = {
  smallCargo: "sc", largeCargo: "lc", lightFighter: "lf", heavyFighter: "hf", cruiser: "cr", battleship: "bs", battlecruiser: "bc", bomber: "bm", destroyer: "ds", deathstar: "de", recycler: "rec", espionageProbe: "ep", colonyShip: "col",
};

const NEXT_BUILDING_EFFECT: Record<string, string> = {
  metalMine: "Increases metal production from this world.", crystalMine: "Increases crystal production from this world.", deuteriumSynthesizer: "Increases deuterium production from this world.", solarPlant: "Increases available energy.", fusionReactor: "Increases energy generated from deuterium.", roboticsFactory: "Reduces construction time across this world.", naniteFactory: "Greatly reduces construction time across this world.", shipyard: "Expands ship and defense production capacity.", metalStorage: "Increases the metal resource cap.", crystalStorage: "Increases the crystal resource cap.", deuteriumTank: "Increases the deuterium resource cap.", researchLab: "Enables higher research requirements.", missileSilo: "Expands missile infrastructure capacity.",
};

function facilityStage(level: number): 1 | 2 | 3 | 4 {
  if (level <= 3) return 1;
  if (level <= 7) return 2;
  if (level <= 11) return 3;
  return 4;
}

function FacilityAsset({ url, scale, tint, position, rotation = [0, 0, 0], objectRef }: { url: string; scale: number; tint: string; position?: [number, number, number]; rotation?: [number, number, number]; objectRef?: { current: THREE.Object3D | null } }) {
  const { scene } = useGLTF(url);
  const industrialDetail = useMemo(() => {
    const size = 96;
    const data = new Uint8Array(size * size * 4);
    let seed = [...url].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
    for (let pixel = 0; pixel < size * size; pixel += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = pixel % size;
      const y = Math.floor(pixel / size);
      const brushed = Math.sin(x * .72 + Math.sin(y * .13) * 2.4) * 13;
      const panelSeam = x % 24 < 2 || y % 24 < 2 ? -42 : 0;
      const noise = ((seed >>> 24) - 128) * .16;
      const value = THREE.MathUtils.clamp(174 + brushed + panelSeam + noise, 28, 232);
      data[pixel * 4] = value;
      data[pixel * 4 + 1] = value;
      data[pixel * 4 + 2] = value;
      data[pixel * 4 + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4.5, 4.5);
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }, [url]);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
      const nextMaterials = sourceMaterials.map((material) => {
        const nextMaterial = material.clone();
        if (nextMaterial instanceof THREE.MeshStandardMaterial) {
          nextMaterial.color.multiply(new THREE.Color(tint));
          const isLight = /light|window|core|node|receiver|conduit|ring|crystal|missile/i.test(node.name);
          const isFoundation = /foundation|deck|pit|trench|roof|vault/i.test(node.name);
          const isArmor = /armor|brace|pillar|tower|gantry|buttress/i.test(node.name);
          nextMaterial.metalness = isLight ? .34 : isFoundation ? .92 : isArmor ? .82 : Math.max(.58, nextMaterial.metalness);
          nextMaterial.roughness = isLight ? .16 : isFoundation ? .38 : isArmor ? .22 : Math.min(.34, nextMaterial.roughness);
          nextMaterial.envMapIntensity = isLight ? 1.8 : isArmor ? 1.55 : 1.32;
          if (isLight) {
            nextMaterial.emissive.copy(nextMaterial.color);
            nextMaterial.emissiveIntensity = Math.max(1.35, nextMaterial.emissiveIntensity);
            nextMaterial.toneMapped = false;
          } else {
            nextMaterial.bumpMap = industrialDetail;
            nextMaterial.bumpScale = isFoundation ? .035 : .018;
            nextMaterial.roughnessMap = industrialDetail;
          }
        }
        return nextMaterial;
      });
      node.material = Array.isArray(node.material) ? nextMaterials : nextMaterials[0];
      node.castShadow = true;
      node.receiveShadow = true;
    });
    return clone;
  }, [industrialDetail, scene, tint]);
  useEffect(() => () => {
    model.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((entry) => entry.dispose());
    });
    industrialDetail.dispose();
  }, [industrialDetail, model]);
  return <primitive ref={objectRef as any} object={model} scale={scale} position={position} rotation={rotation} />;
}

function FacilityConstructionRig({ active, level, accent }: { active: boolean; level: number; accent: string }) {
  const crane = useRef<THREE.Group>(null!);
  const droneOrbit = useRef<THREE.Group>(null!);
  const scan = useRef<THREE.Mesh>(null!);
  const welding = useRef<THREE.PointLight>(null!);
  useFrame(({ clock }, delta) => {
    if (!active) return;
    const elapsed = clock.getElapsedTime();
    if (crane.current) crane.current.rotation.y = Math.sin(elapsed * .24) * .48;
    if (droneOrbit.current) droneOrbit.current.rotation.y += delta * .46;
    if (scan.current) scan.current.position.y = .12 + ((elapsed * .22) % 1) * 1.48;
    if (welding.current) welding.current.intensity = 2.8 + Math.max(0, Math.sin(elapsed * 11.7)) * 9;
  });
  if (!active) return null;
  const scaffoldHeight = 1.36 + Math.min(level, 12) * .025;
  return <group>
    <mesh position={[0, scaffoldHeight / 2, 0]}>
      <boxGeometry args={[1.58, scaffoldHeight, 1.58]} />
      <meshBasicMaterial color={accent} wireframe transparent opacity={.075} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
    {[-.74, .74].flatMap((x) => [-.74, .74].map((z) => <group key={`${x}:${z}`} position={[x, 0, z]}>
      <mesh position={[0, scaffoldHeight / 2, 0]} castShadow><boxGeometry args={[.045, scaffoldHeight, .045]} /><meshStandardMaterial color="#758b94" metalness={.88} roughness={.24} /></mesh>
      {[.32, .7, 1.08].map((height) => height < scaffoldHeight && <mesh key={height} position={[x > 0 ? -.36 : .36, height, 0]} rotation={[0, 0, x > 0 ? -.78 : .78]}><boxGeometry args={[.86, .026, .026]} /><meshStandardMaterial color="#425964" metalness={.82} roughness={.28} /></mesh>)}
    </group>))}
    <group position={[-.92, 0, -.82]}>
      <mesh position={[0, .72, 0]} castShadow><boxGeometry args={[.075, 1.44, .075]} /><meshStandardMaterial color="#657d88" metalness={.86} roughness={.24} /></mesh>
      <group ref={crane} position={[0, 1.42, 0]}>
        <mesh position={[.52, 0, 0]} castShadow><boxGeometry args={[1.14, .055, .065]} /><meshStandardMaterial color="#95aab1" metalness={.82} roughness={.2} /></mesh>
        <mesh position={[.84, -.26, 0]}><boxGeometry args={[.025, .55, .025]} /><meshBasicMaterial color={accent} transparent opacity={.56} toneMapped={false} /></mesh>
        <mesh position={[.84, -.54, 0]} castShadow><octahedronGeometry args={[.075, 0]} /><meshStandardMaterial color="#d8edf0" metalness={.7} roughness={.18} /></mesh>
      </group>
    </group>
    <group ref={droneOrbit} position={[0, .94, 0]}>
      {[0, 1, 2].map((drone) => { const angle = drone * Math.PI * 2 / 3; return <group key={drone} position={[Math.cos(angle) * 1.12, (drone - 1) * .18, Math.sin(angle) * 1.12]} rotation={[0, -angle, 0]}>
        <mesh castShadow><octahedronGeometry args={[.075, 0]} /><meshStandardMaterial color="#9bb0b8" metalness={.88} roughness={.18} /></mesh>
        <mesh position={[0, -.075, 0]}><sphereGeometry args={[.035, 8, 8]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>
      </group>; })}
    </group>
    <mesh ref={scan} position={[0, .15, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={7}><ringGeometry args={[.58, .78, 48]} /><meshBasicMaterial color={accent} transparent opacity={.28} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    <pointLight ref={welding} position={[.42, .55, .34]} color="#dffcff" intensity={5} distance={2.3} decay={2} />
    <mesh position={[.42, .55, .34]}><sphereGeometry args={[.035, 8, 8]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
  </group>;
}

function FacilityScaleActivity({ level, selected, accent, powered }: { level: number; selected: boolean; accent: string; powered: boolean }) {
  const traffic = useRef<THREE.Group>(null!);
  const pulse = useRef<THREE.MeshBasicMaterial>(null!);
  const count = THREE.MathUtils.clamp(Math.ceil(level / 4), 1, 4);
  useFrame(({ clock }, delta) => {
    if (level <= 0) return;
    if (traffic.current) traffic.current.rotation.y += delta * (.12 + Math.min(level, 12) * .004) * (powered ? 1 : .08);
    if (pulse.current) pulse.current.opacity = powered ? (selected ? .65 : .32) + Math.sin(clock.getElapsedTime() * 1.8) * .09 : .08;
  });
  if (level <= 0) return null;
  return <group>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, .035, 0]}><ringGeometry args={[.94, .975, 64]} /><meshBasicMaterial ref={pulse} color={accent} transparent opacity={.38} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    <group ref={traffic} position={[0, .09, 0]}>
      {Array.from({ length: count }, (_, vehicle) => {
        const angle = vehicle * Math.PI * 2 / count;
        return <group key={vehicle} position={[Math.cos(angle) * .96, vehicle % 2 ? .025 : 0, Math.sin(angle) * .96]} rotation={[0, -angle + Math.PI / 2, 0]}>
          <mesh castShadow><boxGeometry args={[.13, .055, .07]} /><meshStandardMaterial color="#78909a" metalness={.82} roughness={.25} /></mesh>
          <mesh position={[-.075, .004, 0]}><boxGeometry args={[.035, .018, .052]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>
          <mesh position={[.075, .004, 0]}><boxGeometry args={[.025, .014, .045]} /><meshBasicMaterial color="#ffbc6b" toneMapped={false} /></mesh>
        </group>;
      })}
    </group>
    {Array.from({ length: Math.min(6, 2 + Math.floor(level / 3)) }, (_, beacon) => {
      const angle = beacon * 2.399963;
      const radius = .32 + (beacon % 3) * .16;
      return <mesh key={beacon} position={[Math.cos(angle) * radius, .075, Math.sin(angle) * radius]}><sphereGeometry args={[.018, 6, 6]} /><meshBasicMaterial color={beacon % 2 ? accent : "#ffffff"} toneMapped={false} /></mesh>;
    })}
    {selected && <spotLight position={[1.35, 1.65, .8]} target-position={[0, .25, 0]} color="#dff8ff" intensity={7.5} distance={4.5} angle={.48} penumbra={.76} decay={2} castShadow={false} />}
  </group>;
}

function FacilityGroundWorks({ index, level, accent }: { index: number; level: number; accent: string }) {
  if (level <= 0) return null;
  const tier = facilityStage(level);
  const radius = 1.02 + (tier - 1) * .12;
  const industrial = index <= 2 || (index >= 8 && index <= 10);
  const energy = index === 3 || index === 4;
  const factory = index === 5 || index === 6;
  const shipyard = index === 7;
  const research = index === 11;
  return <group>
    <mesh position={[0, -.054, 0]} receiveShadow><cylinderGeometry args={[radius, radius + .08, .055, 32]} /><meshStandardMaterial color="#08131a" metalness={.72} roughness={.56} /></mesh>
    <mesh position={[0, -.021, 0]} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[radius * .74, radius * .78, 72]} /><meshBasicMaterial color={accent} transparent opacity={.24} toneMapped={false} /></mesh>
    {Array.from({ length: 4 + tier }, (_, route) => {
      const angle = route * Math.PI * 2 / (4 + tier) + index * .17;
      return <group key={route} rotation={[0, -angle, 0]}>
        <mesh position={[0, -.013, radius * .72]}><boxGeometry args={[.1, .018, radius * .58]} /><meshStandardMaterial color="#182b33" metalness={.62} roughness={.48} /></mesh>
        <mesh position={[0, .002, radius * .73]}><boxGeometry args={[.012, .006, radius * .48]} /><meshBasicMaterial color={accent} transparent opacity={.38} toneMapped={false} /></mesh>
      </group>;
    })}
    {industrial && [-1, 1].map((side) => <group key={side} position={[side * (radius + .08), .08, -.22]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[.045, .045, .82 + tier * .1, 10]} /><meshStandardMaterial color="#566c74" metalness={.84} roughness={.28} /></mesh>
      <mesh position={[0, .07, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.09, .016, 8, 24]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>
    </group>)}
    {energy && Array.from({ length: tier + 1 }, (_, pylon) => <group key={pylon} position={[(pylon - tier / 2) * .28, .1, radius + .18]}>
      <mesh position={[0, .16, 0]} castShadow><cylinderGeometry args={[.025, .045, .32, 8]} /><meshStandardMaterial color="#647c87" metalness={.84} roughness={.23} /></mesh>
      <mesh position={[0, .32, 0]}><sphereGeometry args={[.035, 8, 8]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>
    </group>)}
    {factory && Array.from({ length: tier + 1 }, (_, bay) => <group key={bay} position={[radius + .12, .07, (bay - tier / 2) * .25]}>
      <mesh castShadow><boxGeometry args={[.28, .13, .18]} /><meshStandardMaterial color="#2e4651" metalness={.78} roughness={.3} /></mesh>
      <mesh position={[-.145, .015, 0]}><boxGeometry args={[.012, .055, .11]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>
    </group>)}
    {shipyard && <group position={[0, .015, radius + .32]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.28, .34, 48]} /><meshBasicMaterial color={accent} transparent opacity={.62} toneMapped={false} /></mesh>
      {[0, Math.PI / 2].map((angle) => <mesh key={angle} rotation={[0, angle, 0]}><boxGeometry args={[.055, .012, .58]} /><meshBasicMaterial color={accent} transparent opacity={.46} toneMapped={false} /></mesh>)}
    </group>}
    {research && Array.from({ length: 3 + tier }, (_, sensor) => { const angle = sensor * Math.PI * 2 / (3 + tier); return <group key={sensor} position={[Math.cos(angle) * (radius + .16), .08, Math.sin(angle) * (radius + .16)]}>
      <mesh position={[0, .12, 0]}><cylinderGeometry args={[.018, .03, .24, 8]} /><meshStandardMaterial color="#708994" metalness={.82} roughness={.22} /></mesh>
      <mesh position={[0, .25, 0]}><sphereGeometry args={[.03, 8, 8]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>
    </group>; })}
  </group>;
}

function FacilityOperationalAtmosphere({ index, level, accent, powered }: { index: number; level: number; accent: string; powered: boolean }) {
  const particles = useRef<THREE.Points>(null!);
  const scanner = useRef<THREE.Group>(null!);
  const material = useRef<THREE.PointsMaterial>(null!);
  const particleCount = THREE.MathUtils.clamp(8 + level * 2, 10, 30);
  const positions = useMemo(() => {
    const values = new Float32Array(particleCount * 3);
    let seed = (index + 1) * 2654435761 + level * 97;
    for (let particle = 0; particle < particleCount; particle += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const angle = ((seed & 0xffff) / 0xffff) * Math.PI * 2;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const radius = .18 + ((seed & 0xffff) / 0xffff) * .72;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const height = .14 + ((seed & 0xffff) / 0xffff) * 1.08;
      values[particle * 3] = Math.cos(angle) * radius;
      values[particle * 3 + 1] = height;
      values[particle * 3 + 2] = Math.sin(angle) * radius;
    }
    return values;
  }, [index, level, particleCount]);
  useFrame(({ clock }, delta) => {
    if (level <= 0) return;
    const elapsed = clock.getElapsedTime();
    if (particles.current) {
      particles.current.rotation.y += delta * (index === 6 ? .42 : index === 4 ? .24 : .08) * (powered ? 1 : .08);
      particles.current.position.y = Math.sin(elapsed * .42 + index) * .045;
    }
    if (scanner.current) scanner.current.rotation.y -= delta * (.16 + level * .003) * (powered ? 1 : .08);
    if (material.current) material.current.opacity = powered ? .22 + Math.sin(elapsed * 1.25 + index) * .06 : .035;
  });
  if (level <= 0) return null;
  const dust = index === 0 || index === 5;
  const vapor = index === 2 || index === 10;
  const energetic = index === 1 || index === 3 || index === 4 || index === 6 || index === 9 || index === 11;
  const particleColor = dust ? "#d69a58" : vapor ? "#a5fff0" : index === 12 ? "#ff817b" : accent;
  return <group>
    <points ref={particles} renderOrder={4}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial ref={material} color={particleColor} size={dust ? .045 : .032} sizeAttenuation transparent opacity={dust ? .16 : .26} blending={energetic ? THREE.AdditiveBlending : THREE.NormalBlending} depthWrite={false} toneMapped={!energetic} />
    </points>
    {vapor && [-.38, .38].map((x) => <group key={x} position={[x, .72, -.2]}>
      {[0, 1, 2].map((plume) => <mesh key={plume} position={[Math.sin(plume * 2.1) * .03, plume * .19, 0]} scale={1 + plume * .35}><sphereGeometry args={[.055, 8, 6]} /><meshBasicMaterial color="#b8fff4" transparent opacity={.09 - plume * .018} depthWrite={false} /></mesh>)}
    </group>)}
    {energetic && <group ref={scanner} position={[0, .92, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.36 + Math.min(level, 12) * .012, .008, 6, 36, Math.PI * 1.35]} /><meshBasicMaterial color={particleColor} transparent opacity={.42} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
      {index === 11 && <mesh rotation={[0, 0, -.42]} position={[.34, .22, 0]}><coneGeometry args={[.12, 1.1, 20, 1, true]} /><meshBasicMaterial color={accent} transparent opacity={.035} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>}
    </group>}
    {index === 7 && <group position={[0, .5, .58]}>
      {[-.25, 0, .25].map((x, welder) => <group key={x} position={[x, welder * .12, 0]}><pointLight color="#9ff6ff" intensity={1.6 + level * .09} distance={1.15} decay={2} /><mesh><sphereGeometry args={[.022, 6, 6]} /><meshBasicMaterial color="#eaffff" toneMapped={false} /></mesh></group>)}
    </group>}
    {(index === 8 || index === 9 || index === 10) && <group position={[.92, .1, 0]}>
      {Array.from({ length: Math.min(4, 1 + Math.floor(level / 4)) }, (_, cargo) => <mesh key={cargo} position={[0, cargo * .1, (cargo % 2) * .12]} castShadow><boxGeometry args={[.18, .08, .1]} /><meshStandardMaterial color={index === 9 ? "#397f99" : index === 10 ? "#34745e" : "#667b84"} metalness={.7} roughness={.32} /></mesh>)}
    </group>}
  </group>;
}

function FacilityDressing({ index, level, selected, powered }: { index: number; level: number; selected: boolean; powered: boolean }) {
  const building = BUILDINGS[index];
  const modelRef = useRef<THREE.Object3D | null>(null);
  const revealStartedAt = useRef(-1);
  const animated = useRef<Array<{ object: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }>>([]);
  const emissiveMaterials = useRef<THREE.MeshStandardMaterial[]>([]);
  const stage = facilityStage(level);
  const operational = level > 0;
  useEffect(() => {
    animated.current = [];
    emissiveMaterials.current = [];
    revealStartedAt.current = -1;
  }, [index, stage]);
  useFrame(({ clock }) => {
    const root = modelRef.current;
    if (!root) return;
    const elapsed = clock.getElapsedTime();
    if (revealStartedAt.current < 0) revealStartedAt.current = elapsed;
    const revealProgress = THREE.MathUtils.clamp((elapsed - revealStartedAt.current) / 1.15, 0, 1);
    const revealEase = 1 - Math.pow(1 - revealProgress, 4);
    const baseScale = operational ? .145 : .118;
    root.scale.setScalar(baseScale * (.78 + revealEase * .22));
    root.position.y = .01 - (1 - revealEase) * .12;
    if (!operational) return;
    if (animated.current.length === 0) {
      const motionNames = /bucket-wheel|heliostat|containment-ring|crane-arm|field-ring|hull-under-construction|deep-space-dish|missile-|energy-node|crystal-spire/;
      root.traverse((object) => {
        if (motionNames.test(object.name)) animated.current.push({ object, position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone() });
        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((entry) => { if (entry instanceof THREE.MeshStandardMaterial && entry.emissiveIntensity > 0) emissiveMaterials.current.push(entry); });
        }
      });
    }
    const motionTime = elapsed * (powered ? 1 : .12);
    animated.current.forEach(({ object, position, rotation, scale }, part) => {
      object.position.copy(position); object.rotation.copy(rotation); object.scale.copy(scale);
      if (object.name.includes("bucket-wheel")) object.rotation.z = rotation.z + motionTime * .62;
      else if (object.name.includes("heliostat")) object.rotation.z = rotation.z + Math.sin(motionTime * .18 + part) * .08;
      else if (object.name.includes("containment-ring")) object.rotation.y = rotation.y + motionTime * (.18 + part * .025);
      else if (object.name.includes("crane-arm")) object.rotation.z = rotation.z + Math.sin(motionTime * .22 + part) * .12;
      else if (object.name.includes("field-ring")) object.rotation.y = rotation.y + motionTime * (.22 + part * .035);
      else if (object.name.includes("hull-under-construction")) object.position.y = position.y + Math.sin(motionTime * .55) * .12;
      else if (object.name.includes("deep-space-dish")) object.rotation.z = rotation.z + motionTime * .13;
      else if (object.name.includes("missile-")) object.position.y = position.y + Math.max(0, Math.sin(motionTime * .22 + part) * .05);
      else if (object.name.includes("crystal-spire")) object.scale.multiplyScalar(1 + Math.sin(motionTime * .45 + part) * .012);
      else if (object.name.includes("energy-node")) object.position.y = position.y + Math.sin(motionTime * .4 + part) * .06;
    });
    const revealFlash = (1 - revealProgress) * 2.4;
    const powerIntensity = powered ? (selected ? 2.15 : 1.35) : .24 + (Math.sin(elapsed * 5.4 + index) > .82 ? .42 : 0);
    emissiveMaterials.current.forEach((entry, part) => { entry.emissiveIntensity = powerIntensity + revealFlash + Math.sin(elapsed * .7 + part * .41) * (powered ? .18 : .04); });
  });
  if (!building) return null;
  return <group rotation={[0, index * .31, 0]}>
    <Suspense fallback={null}>
      <FacilityAsset
        url={`/planet-models/gamesol/${building.key}-stage${stage}.glb`}
        scale={operational ? .145 : .118}
        tint={operational ? "#ffffff" : "#5c6870"}
        position={[0, .01, 0]}
        objectRef={modelRef}
      />
    </Suspense>
  </group>;
}

function FacilitySystems({ index, level, selected, powered }: { index: number; level: number; selected: boolean; powered: boolean }) {
  const rotor = useRef<THREE.Group>(null!);
  const counterRotor = useRef<THREE.Group>(null!);
  const pulse = useRef<THREE.MeshBasicMaterial>(null!);
  const operational = level > 0;
  const tier = Math.min(3, Math.floor(Math.max(0, level - 1) / 4));
  const accent = ["#ffb14a", "#67e8ff", "#68efb6", "#ffd15c", "#72e6ff", "#6ed8ff", "#b692ff", "#71e7ff", "#c8e4ef", "#72e6ff", "#7ce9bd", "#bd9cff"][index] ?? "#67ddff";
  useFrame(({ clock }, delta) => {
    if (!operational) return;
    const powerRate = powered ? 1 : .1;
    if (rotor.current) rotor.current.rotation.y += delta * (.28 + index * .025) * powerRate;
    if (counterRotor.current) counterRotor.current.rotation.z -= delta * (.2 + tier * .08) * powerRate;
    if (pulse.current) pulse.current.opacity = powered ? (selected ? .58 : .28) + Math.sin(clock.getElapsedTime() * 2.4 + index) * .1 : .08 + (Math.sin(clock.getElapsedTime() * 5.4 + index) > .82 ? .22 : 0);
  });
  if (!operational) return <group>
    <mesh position={[0, .1, 0]} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[.3, .34, 24]} /><meshBasicMaterial color="#52636b" transparent opacity={.34} /></mesh>
    {[-.34, .34].map((x) => <mesh key={x} position={[x, .16, 0]}><boxGeometry args={[.035, .32, .035]} /><meshStandardMaterial color="#445761" metalness={.72} roughness={.35} /></mesh>)}
  </group>;
  return <group>
    <group ref={rotor} position={[0, .83 + tier * .08, 0]} rotation={[.32, 0, index % 2 ? .18 : -.18]}>
      <mesh><torusGeometry args={[.25 + tier * .035, .018, 8, 32]} /><meshBasicMaterial ref={pulse} color={accent} transparent opacity={.34} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
      {tier >= 1 && <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.18 + tier * .025, .012, 8, 28]} /><meshBasicMaterial color={accent} transparent opacity={.38} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>}
    </group>
    <group ref={counterRotor} position={[0, .82 + tier * .08, 0]}>
      <mesh><octahedronGeometry args={[.055 + tier * .012, 1]} /><meshBasicMaterial color="#efffff" toneMapped={false} /></mesh>
      <mesh><sphereGeometry args={[.09 + tier * .014, 12, 8]} /><meshBasicMaterial color={accent} transparent opacity={.24} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    </group>
    {index === 3 && <group ref={counterRotor} position={[0, .46, 0]} rotation={[0, 0, -.18]}>{[-.32, .32].map((x) => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[.5, .025, .24]} /><meshPhysicalMaterial color="#194b70" emissive="#0c4162" emissiveIntensity={.58} metalness={.45} roughness={.22} clearcoat={.45} /></mesh>)}</group>}
  </group>;
}

function FacilitySelection({ name, level, powered, resourceFill }: { name: string; level: number; powered: boolean; resourceFill?: number }) {
  const ring = useRef<THREE.Mesh>(null!);
  const material = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(({ clock }, delta) => {
    if (ring.current) ring.current.rotation.z += delta * .35;
    if (material.current) material.current.opacity = .62 + Math.sin(clock.getElapsedTime() * 3.1) * .2;
  });
  return <>
    <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]} position={[0, .028, 0]} renderOrder={5}>
      <ringGeometry args={[.68, .76, 64, 1, 0, Math.PI * 1.72]} />
      <meshBasicMaterial ref={material} color="#61e6ff" transparent opacity={.8} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
    <mesh position={[0, .65, 0]} renderOrder={4}><cylinderGeometry args={[.012, .08, 1.25, 12, 1, true]} /><meshBasicMaterial color="#62ddff" transparent opacity={.12} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
    <Billboard position={[0, 1.38, 0]} follow><Text fontSize={.15} color={powered ? "#e8fbff" : "#ffaf72"} outlineWidth={.008} outlineColor="#03101b" anchorX="center" anchorY="middle">{`${name.toUpperCase()}  ·  L${level}${resourceFill === undefined ? "" : `  ·  ${Math.round(resourceFill * 100)}% STORED`}${powered ? "" : "  ·  POWER LIMITED"}`}</Text></Billboard>
  </>;
}

function ResourceFacilityState({ index, level, fill, powered }: { index: number; level: number; fill?: number; powered: boolean }) {
  const logistics = useRef<THREE.Group>(null!);
  const resourceIndex = index <= 2 ? index : index >= 8 && index <= 10 ? index - 8 : -1;
  const resourceColors = ["#d8a660", "#67e8ff", "#63edbd"];
  const color = resourceColors[resourceIndex] ?? "#68e5ff";
  const amount = THREE.MathUtils.clamp(fill ?? 0, 0, 1);
  useFrame(({ clock }) => {
    if (!logistics.current) return;
    const elapsed = clock.getElapsedTime() * (powered ? 1 : .08);
    logistics.current.rotation.y = elapsed * .24 + index * .31;
    logistics.current.children.forEach((carrier, carrierIndex) => {
      carrier.position.y = .12 + Math.sin(elapsed * 1.4 + carrierIndex * 2.1) * .025;
    });
  });
  if (level <= 0 || resourceIndex < 0) return null;
  if (index <= 2) {
    const carrierCount = 1 + Math.min(3, Math.floor(amount * 4));
    return <group ref={logistics} position={[0, .06, 0]}>
      {Array.from({ length: carrierCount }, (_, carrier) => {
        const angle = carrier * Math.PI * 2 / carrierCount;
        const payloadScale = .2 + amount * .8;
        return <group key={carrier} position={[Math.cos(angle) * .88, .12, Math.sin(angle) * .88]} rotation={[0, -angle + Math.PI / 2, 0]}>
          <mesh castShadow><boxGeometry args={[.18, .065, .1]} /><meshStandardMaterial color="#314955" metalness={.82} roughness={.28} /></mesh>
          <mesh position={[0, .07, 0]} scale={[payloadScale, payloadScale, payloadScale]} castShadow>{resourceIndex === 1 ? <octahedronGeometry args={[.075, 0]} /> : <dodecahedronGeometry args={[.065, 0]} />}<meshStandardMaterial color={color} emissive={color} emissiveIntensity={powered ? .55 : .08} metalness={.45} roughness={.24} /></mesh>
          <mesh position={[-.1, .005, 0]}><boxGeometry args={[.025, .02, .06]} /><meshBasicMaterial color={powered ? color : "#ff965d"} toneMapped={false} /></mesh>
        </group>;
      })}
    </group>;
  }
  const fillHeight = .08 + amount * .72;
  return <group position={[.72, .06, -.28]}>
    <mesh position={[0, .43, 0]}><cylinderGeometry args={[.11, .11, .84, 18, 1, true]} /><meshPhysicalMaterial color="#8fc8d6" transparent opacity={.16} roughness={.16} metalness={.35} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    <mesh position={[0, fillHeight / 2, 0]}><cylinderGeometry args={[.09, .09, fillHeight, 18]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={powered ? .9 : .12} transparent opacity={.72} metalness={.24} roughness={.18} /></mesh>
    <mesh position={[0, .86, 0]} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[.105, .135, 24]} /><meshBasicMaterial color={powered ? color : "#ff965d"} transparent opacity={.7} toneMapped={false} /></mesh>
    {[.2, .4, .6, .8].map((mark) => <mesh key={mark} position={[.14, mark * .82, 0]}><boxGeometry args={[.07, .008, .012]} /><meshBasicMaterial color="#a8dbe6" transparent opacity={mark <= amount ? .75 : .16} toneMapped={false} /></mesh>)}
  </group>;
}

function FacilityLandmark({ index, level }: { index: number; level: number }) {
  const scale = 1.26 + Math.min(level, 12) * .055;
  const metal = <meshStandardMaterial color="#1c3848" metalness={.78} roughness={.26} />;
  const trim = <meshStandardMaterial color="#8ec9d6" metalness={.72} roughness={.2} />;
  const cyan = <meshStandardMaterial color="#34cdf4" emissive="#087d9c" emissiveIntensity={1.5} metalness={.35} roughness={.18} />;
  const amber = <meshStandardMaterial color="#ffc35b" emissive="#915007" emissiveIntensity={1.2} metalness={.2} roughness={.24} />;
  const green = <meshStandardMaterial color="#58dca0" emissive="#08734d" emissiveIntensity={1} metalness={.25} roughness={.24} />;
  const violet = <meshStandardMaterial color="#b18dff" emissive="#4e2c9b" emissiveIntensity={1} metalness={.28} roughness={.22} />;
  const common = { castShadow: true, receiveShadow: true };
  if (index === 0) return <group scale={scale}><mesh {...common} position={[0,.12,0]}><boxGeometry args={[.82,.2,.52]} />{metal}</mesh><mesh {...common} position={[0,.32,-.04]} rotation={[0,0,-.36]}><boxGeometry args={[.12,.58,.13]} />{trim}</mesh><mesh {...common} position={[.13,.6,-.04]} rotation={[0,0,1.08]}><boxGeometry args={[.1,.62,.11]} />{trim}</mesh><mesh {...common} position={[.38,.8,-.04]} rotation={[0,0,-.3]}><boxGeometry args={[.52,.1,.12]} />{metal}</mesh><mesh {...common} position={[.58,.67,-.04]}><coneGeometry args={[.13,.26,7]} />{amber}</mesh>{[-.28,.28].map((x) => <mesh {...common} key={x} position={[x,.02,.2]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.12,.12,.14,10]} />{trim}</mesh>)}</group>;
  if (index === 1) return <group scale={scale}><mesh {...common} position={[0,.08,0]}><cylinderGeometry args={[.5,.58,.16,10]} />{metal}</mesh>{[[-.22,.38,.04],[.06,.62,.1],[.3,.36,-.08],[-.08,.34,-.26]].map((point, key) => <mesh {...common} key={key} position={point as [number,number,number]} rotation={[.15 * key,.4 * key,.1]}><octahedronGeometry args={[.2 + key*.04,0]} />{cyan}</mesh>)}<mesh position={[0,.12,.34]}><boxGeometry args={[.56,.06,.05]} />{trim}</mesh></group>;
  if (index === 2) return <group scale={scale}>{[-.26,0,.26].map((x) => <group key={x}><mesh {...common} position={[x,.3,0]}><cylinderGeometry args={[.14,.18,.58,14]} />{metal}</mesh><mesh {...common} position={[x,.62,0]}><sphereGeometry args={[.15,16,12]} />{green}</mesh><mesh {...common} position={[x,.9,0]}><cylinderGeometry args={[.035,.045,.2,8]} />{trim}</mesh></group>)}<mesh {...common} position={[0,.1,.27]}><boxGeometry args={[.88,.14,.18]} />{trim}</mesh></group>;
  if (index === 3) return <group scale={scale}><mesh {...common} position={[0,.08,0]}><boxGeometry args={[1.04,.16,.7]} />{metal}</mesh>{[[-.34,.31,0],[.34,.31,0],[-.34,.31,.2],[.34,.31,.2]].map((point,key) => <group key={key} position={point as [number,number,number]} rotation={[0,0,key % 2 ? -.38 : .38]}><mesh {...common} position={[0,.13,0]}><boxGeometry args={[.34,.04,.52]} />{amber}</mesh><mesh {...common} position={[0,0,0]}><cylinderGeometry args={[.035,.05,.3,8]} />{trim}</mesh></group>)}</group>;
  if (index === 4) return <group scale={scale}><mesh {...common} position={[0,.14,0]}><cylinderGeometry args={[.52,.62,.28,16]} />{metal}</mesh>{[.32,.48,.64].map((height,key) => <mesh {...common} key={height} position={[0,height,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.33-key*.045,.052,12,36]} />{cyan}</mesh>)}<mesh {...common} position={[0,.78,0]}><cylinderGeometry args={[.1,.16,.3,12]} />{trim}</mesh></group>;
  if (index === 5) return <group scale={scale}><mesh {...common} position={[0,.2,0]}><boxGeometry args={[.72,.38,.58]} />{metal}</mesh>{[[-.23,.47,0],[.23,.47,0]].map((point,key) => <mesh {...common} key={key} position={point as [number,number,number]}><cylinderGeometry args={[.09,.12,.24,10]} />{cyan}</mesh>)}<mesh {...common} position={[0,.46,.18]}><boxGeometry args={[.5,.05,.05]} />{trim}</mesh></group>;
  if (index === 6) return <group scale={scale}>{[[-.25,0,-.1],[.22,0,.08],[0,0,.25]].map((point,key) => <group key={key} position={point as [number,number,number]}><mesh {...common} position={[0,.23,0]}><cylinderGeometry args={[.12,.15,.46,10]} />{metal}</mesh><mesh {...common} position={[0,.5,0]}><sphereGeometry args={[.11,12,12]} />{violet}</mesh></group>)}</group>;
  if (index === 7) return <group scale={scale}><mesh {...common} position={[0,.07,0]}><boxGeometry args={[1.05,.14,.72]} />{metal}</mesh>{[-.33,.33].map((x) => <mesh {...common} key={x} position={[x,.21,0]}><boxGeometry args={[.08,.16,.75]} />{trim}</mesh>)}<mesh {...common} position={[0,.17,.04]}><boxGeometry args={[.42,.03,.58]} />{cyan}</mesh></group>;
  if (index === 8 || index === 9 || index === 10) { const material = index === 8 ? trim : index === 9 ? cyan : green; return <group scale={scale}>{[-.18,.18].map((x) => <group key={x}><mesh {...common} position={[x,.28,0]}><cylinderGeometry args={[.16,.2,.5,12]} />{metal}</mesh><mesh {...common} position={[x,.57,0]}><sphereGeometry args={[.16,14,12]} />{material}</mesh></group>)}</group>; }
  if (index === 11) return <group scale={scale}><mesh {...common} position={[0,.11,0]}><cylinderGeometry args={[.5,.58,.2,16]} />{metal}</mesh><mesh {...common} position={[0,.32,0]}><sphereGeometry args={[.32,20,14,0,Math.PI*2,0,Math.PI/2]} />{violet}</mesh><mesh {...common} position={[0,.72,0]}><cylinderGeometry args={[.035,.05,.48,8]} />{trim}</mesh><mesh {...common} position={[0,.99,0]}><sphereGeometry args={[.08,12,12]} />{cyan}</mesh></group>;
  return null;
}

function FacilityEvolution({ index, tier }: { index: number; tier: number }) {
  if (tier <= 0) return null;
  const accent = ["#ffb14a", "#63e8ff", "#67ecb3", "#ffd35d", "#63dcff", "#75d9ff", "#b891ff", "#68e4ff", "#bed8e3", "#70e5ff", "#72e6b0", "#bd9bff"][index] ?? "#68ddff";
  const metal = <meshPhysicalMaterial color="#173241" metalness={.86} roughness={.25} clearcoat={.18} />;
  const armor = <meshStandardMaterial color="#476574" metalness={.74} roughness={.27} />;
  const glow = <meshBasicMaterial color={accent} transparent opacity={.7} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />;
  const darkGlow = <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={.72} metalness={.34} roughness={.2} />;
  const common = { castShadow: true, receiveShadow: true };

  if (index === 0) return <group>
    {tier >= 1 && [-.48, .48].map((x) => <group key={x} position={[x, 0, -.1]}><mesh {...common} position={[0,.28,0]}><cylinderGeometry args={[.07,.1,.52,10]} />{metal}</mesh><mesh {...common} position={[0,.58,0]} rotation={[0,0,x > 0 ? -.35 : .35]}><coneGeometry args={[.12,.28,8]} />{darkGlow}</mesh></group>)}
    {tier >= 2 && <group><mesh {...common} position={[0,.82,-.12]}><boxGeometry args={[1.28,.1,.12]} />{armor}</mesh>{[-.58,.58].map((x) => <mesh {...common} key={x} position={[x,.47,-.12]}><boxGeometry args={[.1,.76,.12]} />{metal}</mesh>)}</group>}
    {tier >= 3 && <group rotation={[0,0,-.25]} position={[0,.95,-.12]}><mesh {...common} position={[.34,0,0]}><boxGeometry args={[.78,.13,.15]} />{metal}</mesh><mesh {...common} position={[.74,-.13,0]}><coneGeometry args={[.2,.38,7]} />{darkGlow}</mesh></group>}
  </group>;
  if (index === 1) return <group>
    {tier >= 1 && Array.from({length:6},(_,key) => { const angle=key*Math.PI/3; return <mesh {...common} key={key} position={[Math.cos(angle)*.58,.2,Math.sin(angle)*.58]} rotation={[.1,key*.7,.2]}><octahedronGeometry args={[.13 + (key%2)*.04,0]} />{darkGlow}</mesh>; })}
    {tier >= 2 && [.32,.54,.76].map((height,key) => <mesh key={height} position={[0,height,0]} rotation={[Math.PI/2,key*.45,0]}><torusGeometry args={[.48-key*.07,.018,8,40]} />{glow}</mesh>)}
    {tier >= 3 && <group position={[0,1.03,0]}><mesh {...common}><octahedronGeometry args={[.28,1]} />{darkGlow}</mesh><mesh scale={1.65}><octahedronGeometry args={[.28,1]} /><meshBasicMaterial color={accent} transparent opacity={.13} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh></group>}
  </group>;
  if (index === 2) return <group>
    {tier >= 1 && [-.48,.48].map((x) => <group key={x} position={[x,0,.06]}><mesh {...common} position={[0,.32,0]}><cylinderGeometry args={[.16,.2,.58,14]} />{metal}</mesh><mesh position={[0,.62,0]}><sphereGeometry args={[.16,16,10]} />{darkGlow}</mesh></group>)}
    {tier >= 2 && <><mesh {...common} position={[0,.76,-.1]}><cylinderGeometry args={[.08,.12,1.15,12]} />{armor}</mesh><mesh position={[0,1.28,-.1]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.31,.035,10,36]} />{glow}</mesh></>}
    {tier >= 3 && Array.from({length:4},(_,key) => <mesh {...common} key={key} position={[Math.cos(key*Math.PI/2)*.58,.84,Math.sin(key*Math.PI/2)*.58]} rotation={[0,0,key%2?.32:-.32]}><cylinderGeometry args={[.055,.08,.8,9]} />{armor}</mesh>)}
  </group>;
  if (index === 3) return <group>
    {tier >= 1 && [-.56,.56].flatMap((x) => [-.28,.28].map((z) => <mesh {...common} key={`${x}:${z}`} position={[x,.22,z]} rotation={[0,0,x > 0 ? -.22 : .22]}><boxGeometry args={[.46,.025,.32]} /><meshPhysicalMaterial color="#1d5277" emissive="#0a3855" emissiveIntensity={.62} metalness={.42} roughness={.18} clearcoat={.5} /></mesh>))}
    {tier >= 2 && <><mesh {...common} position={[0,.7,0]}><cylinderGeometry args={[.07,.13,1.2,12]} />{metal}</mesh><mesh {...common} position={[0,1.25,0]} rotation={[0,0,.18]}><cylinderGeometry args={[.38,.38,.035,32]} />{darkGlow}</mesh></>}
    {tier >= 3 && <mesh position={[0,1.25,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.55,.025,10,48]} />{glow}</mesh>}
  </group>;
  if (index === 4) return <group>
    {tier >= 1 && [-.45,.45].map((x) => <group key={x} position={[x,.38,0]}><mesh {...common}><cylinderGeometry args={[.18,.24,.7,16]} />{metal}</mesh><mesh position={[0,.12,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.22,.028,10,36]} />{glow}</mesh></group>)}
    {tier >= 2 && [.38,.7,1.02].map((height,key) => <mesh key={height} position={[0,height,0]} rotation={[key%2?Math.PI/2:0,0,key*.5]}><torusGeometry args={[.5-key*.06,.026,10,40]} />{glow}</mesh>)}
    {tier >= 3 && <group position={[0,1.05,0]}><mesh><sphereGeometry args={[.2,20,14]} />{darkGlow}</mesh><mesh scale={1.7}><sphereGeometry args={[.2,20,14]} /><meshBasicMaterial color={accent} transparent opacity={.16} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh></group>}
  </group>;
  if (index === 5) return <group>
    {tier >= 1 && [-.52,.52].map((x) => <group key={x} position={[x,.4,0]} rotation={[0,0,x > 0 ? -.28 : .28]}><mesh {...common}><boxGeometry args={[.11,.72,.13]} />{metal}</mesh><mesh {...common} position={[x > 0 ? -.16 : .16,.32,0]} rotation={[0,0,x > 0 ? .8 : -.8]}><boxGeometry args={[.38,.09,.11]} />{armor}</mesh></group>)}
    {tier >= 2 && <><mesh {...common} position={[0,1.0,-.06]}><boxGeometry args={[1.28,.12,.16]} />{armor}</mesh><mesh {...common} position={[0,1.18,-.06]}><cylinderGeometry args={[.09,.13,.34,10]} />{darkGlow}</mesh></>}
    {tier >= 3 && Array.from({length:3},(_,key)=><mesh {...common} key={key} position={[(key-1)*.38,.72,.32]}><cylinderGeometry args={[.07,.1,.72,9]} />{metal}</mesh>)}
  </group>;
  if (index === 6) return <group>
    {tier >= 1 && Array.from({length:5},(_,key)=>{const angle=key*Math.PI*2/5; return <mesh {...common} key={key} position={[Math.cos(angle)*.55,.4,Math.sin(angle)*.55]}><cylinderGeometry args={[.06,.12,.72,8]} />{darkGlow}</mesh>;})}
    {tier >= 2 && [.28,.58,.88].map((height,key)=><mesh key={height} position={[0,height,0]} rotation={[Math.PI/2,key*.55,0]}><torusGeometry args={[.5-key*.07,.018,8,40]} />{glow}</mesh>)}
    {tier >= 3 && <group position={[0,1.12,0]}><mesh><icosahedronGeometry args={[.2,2]} />{darkGlow}</mesh><mesh scale={2.1}><icosahedronGeometry args={[.2,1]} /><meshBasicMaterial color={accent} wireframe transparent opacity={.26} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh></group>}
  </group>;
  if (index === 7) return <group>
    {tier >= 1 && <><mesh {...common} position={[0,.1,.62]}><boxGeometry args={[.5,.08,1.18]} />{metal}</mesh>{[-.17,.17].map((x)=><mesh key={x} position={[x,.15,.72]}><boxGeometry args={[.035,.012,.92]} />{glow}</mesh>)}</>}
    {tier >= 2 && [-.58,.58].map((x)=><group key={x} position={[x,.54,.1]}><mesh {...common}><boxGeometry args={[.12,1.0,.18]} />{metal}</mesh><mesh {...common} position={[x > 0 ? -.2:.2,.44,0]}><boxGeometry args={[.45,.11,.16]} />{armor}</mesh></group>)}
    {tier >= 3 && <><mesh {...common} position={[0,1.12,.12]}><boxGeometry args={[1.32,.14,.2]} />{armor}</mesh><mesh position={[0,1.12,.24]}><boxGeometry args={[.72,.025,.03]} />{glow}</mesh></>}
  </group>;
  if (index === 8) return <group>
    {tier >= 1 && Array.from({length:4},(_,key)=><mesh {...common} key={key} position={[(key%2?1:-1)*.42,.3,(key<2?-1:1)*.32]}><cylinderGeometry args={[.16,.2,.56,12]} />{armor}</mesh>)}
    {tier >= 2 && <mesh {...common} position={[0,.62,0]}><boxGeometry args={[1.15,.18,.92]} />{metal}</mesh>}
    {tier >= 3 && Array.from({length:4},(_,key)=><mesh {...common} key={key} position={[(key%2?1:-1)*.5,.78,(key<2?-1:1)*.38]}><boxGeometry args={[.12,.58,.12]} />{darkGlow}</mesh>)}
  </group>;
  if (index === 9) return <group>
    {tier >= 1 && [-.46,.46].map((x)=><group key={x} position={[x,.36,0]}><mesh {...common}><octahedronGeometry args={[.26,0]} />{darkGlow}</mesh><mesh scale={1.35}><octahedronGeometry args={[.26,0]} /><meshBasicMaterial color={accent} wireframe transparent opacity={.25} /></mesh></group>)}
    {tier >= 2 && [.28,.62,.96].map((height,key)=><mesh key={height} position={[0,height,0]} rotation={[Math.PI/2,key*.45,0]}><torusGeometry args={[.54-key*.06,.02,8,40]} />{glow}</mesh>)}
    {tier >= 3 && <mesh {...common} position={[0,1.18,0]}><octahedronGeometry args={[.32,1]} />{darkGlow}</mesh>}
  </group>;
  if (index === 10) return <group>
    {tier >= 1 && Array.from({length:4},(_,key)=>{const angle=key*Math.PI/2; return <group key={key} position={[Math.cos(angle)*.5,.3,Math.sin(angle)*.5]}><mesh {...common}><cylinderGeometry args={[.16,.2,.58,14]} />{metal}</mesh><mesh position={[0,.31,0]}><sphereGeometry args={[.16,12,8]} />{darkGlow}</mesh></group>;})}
    {tier >= 2 && <><mesh {...common} position={[0,.55,0]}><sphereGeometry args={[.54,24,16,0,Math.PI*2,0,Math.PI/2]} />{armor}</mesh><mesh position={[0,.55,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.57,.025,9,40]} />{glow}</mesh></>}
    {tier >= 3 && <mesh {...common} position={[0,1.18,0]}><cylinderGeometry args={[.08,.13,.9,12]} />{darkGlow}</mesh>}
  </group>;
  if (index === 11) return <group>
    {tier >= 1 && [-.5,.5].map((x)=><group key={x} position={[x,.42,0]} rotation={[0,0,x>0?-.18:.18]}><mesh {...common}><cylinderGeometry args={[.055,.1,.76,10]} />{metal}</mesh><mesh {...common} position={[0,.43,0]} rotation={[0,0,x>0?.45:-.45]}><cylinderGeometry args={[.22,.22,.025,28]} />{darkGlow}</mesh></group>)}
    {tier >= 2 && <><mesh {...common} position={[0,.94,0]}><cylinderGeometry args={[.08,.17,1.35,14]} />{armor}</mesh>{[.52,.82,1.12].map((height,key)=><mesh key={height} position={[0,height,0]} rotation={[Math.PI/2,key*.5,0]}><torusGeometry args={[.34-key*.055,.018,8,36]} />{glow}</mesh>)}</>}
    {tier >= 3 && <group position={[0,1.55,0]}><mesh><sphereGeometry args={[.16,16,12]} />{darkGlow}</mesh><mesh scale={2.2}><sphereGeometry args={[.16,16,12]} /><meshBasicMaterial color={accent} transparent opacity={.14} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh></group>}
  </group>;
  return null;
}

function FacilityDistrict({ index, level }: { index: number; level: number }) {
  if (level <= 0) return null;
  const tier = Math.min(3, Math.floor(Math.max(0, level - 1) / 4));
  const accent = ["#ffad42", "#61e7ff", "#66efb7", "#ffd15c", "#6de7ff", "#72d9ff", "#b58dff", "#69e8ff", "#d0e9f2", "#73e8ff", "#72e8b5", "#bb97ff", "#ff7d78"][index] ?? "#69e5ff";
  const shell = <meshPhysicalMaterial color="#132c3b" metalness={.86} roughness={.24} clearcoat={.28} clearcoatRoughness={.22} />;
  const armor = <meshPhysicalMaterial color="#4c6875" metalness={.78} roughness={.27} clearcoat={.18} />;
  const dark = <meshStandardMaterial color="#071722" metalness={.78} roughness={.32} />;
  const light = <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.65} metalness={.25} roughness={.18} toneMapped={false} />;
  const glow = <meshBasicMaterial color={accent} transparent opacity={.58} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />;
  const common = { castShadow: true, receiveShadow: true };
  const moduleCount = 3 + tier;
  const industrial = index <= 2;
  const energy = index === 3 || index === 4;
  const factory = index === 5 || index === 6;
  const shipyard = index === 7;
  const storage = index >= 8 && index <= 10;
  const research = index === 11;
  const missile = index === 12;
  return <group scale={1.02 + Math.min(level, 16) * .025}>
    <mesh {...common} position={[0, -.045, 0]}><cylinderGeometry args={[1.02 + tier * .09, 1.08 + tier * .1, .095, 24]} />{dark}</mesh>
    <mesh position={[0, .012, 0]} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[.82 + tier * .07, .86 + tier * .07, 72]} />{glow}</mesh>
    {Array.from({ length: moduleCount }, (_, module) => {
      const angle = module / moduleCount * Math.PI * 2 + index * .41;
      const radius = .68 + tier * .06;
      const height = .14 + (module % 2) * .07 + tier * .025;
      return <group key={module} position={[Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius]} rotation={[0, -angle, 0]}>
        <mesh {...common}><boxGeometry args={[.28 + tier * .025, height, .2]} />{shell}</mesh>
        <mesh position={[0, height * .2, .103]}><boxGeometry args={[.17, .018, .008]} />{light}</mesh>
        {tier >= 2 && <mesh {...common} position={[0, height * .62, 0]}><boxGeometry args={[.08, .12, .08]} />{armor}</mesh>}
      </group>;
    })}
    {Array.from({ length: 4 }, (_, route) => {
      const angle = route * Math.PI / 2 + Math.PI / 4;
      return <mesh key={route} position={[Math.cos(angle) * .49, .018, Math.sin(angle) * .49]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[.055, .012, .72]} />
        <meshBasicMaterial color={accent} transparent opacity={.32} toneMapped={false} />
      </mesh>;
    })}
    {industrial && <group>
      {[-.42, .42].map((x) => <group key={x} position={[x, .28, -.08]}><mesh {...common}><cylinderGeometry args={[.16, .22, .5 + tier * .12, 12]} />{shell}</mesh><mesh position={[0, .28 + tier * .06, 0]}><coneGeometry args={[.18, .22, 12]} />{armor}</mesh><mesh position={[0, .18, .13]}><boxGeometry args={[.11, .035, .015]} />{light}</mesh></group>)}
      <mesh {...common} position={[0, .34, .2]} rotation={[0, 0, -.11]}><boxGeometry args={[.9, .11, .16]} />{armor}</mesh>
    </group>}
    {energy && <group>
      <mesh {...common} position={[0, .4, 0]}><cylinderGeometry args={[.28, .43, .75 + tier * .16, 20]} />{shell}</mesh>
      {[.2, .44, .68].slice(0, 2 + tier).map((height) => <mesh key={height} position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.36 + height * .08, .027, 10, 48]} />{glow}</mesh>)}
      <pointLight position={[0, .72 + tier * .1, 0]} color={accent} intensity={1.1 + tier * .4} distance={2.4} />
    </group>}
    {factory && <group>
      <mesh {...common} position={[0, .25, 0]}><boxGeometry args={[.86, .46 + tier * .09, .58]} />{shell}</mesh>
      {[-.27, 0, .27].map((x) => <mesh key={x} position={[x, .28, .296]}><boxGeometry args={[.13, .045, .012]} />{light}</mesh>)}
      {[-.33, .33].map((x) => <mesh {...common} key={x} position={[x, .66 + tier * .045, -.1]}><cylinderGeometry args={[.065, .1, .52 + tier * .08, 10]} />{armor}</mesh>)}
    </group>}
    {shipyard && <group>
      <mesh {...common} position={[0, .16, .22]}><boxGeometry args={[1.25, .24, .72]} />{shell}</mesh>
      {[-.48, .48].map((x) => <group key={x} position={[x, .62, .18]}><mesh {...common}><boxGeometry args={[.11, .95 + tier * .15, .15]} />{armor}</mesh><mesh {...common} position={[x > 0 ? -.25 : .25, .39 + tier * .06, 0]}><boxGeometry args={[.54, .11, .15]} />{shell}</mesh></group>)}
      {[-.2, 0, .2].map((x) => <mesh key={x} position={[x, .3, .45]}><boxGeometry args={[.025, .018, .72]} />{light}</mesh>)}
    </group>}
    {storage && <group>
      {[-.34, 0, .34].map((x, cell) => <group key={x} position={[x, .34 + (cell % 2) * .08, 0]}><mesh {...common}><cylinderGeometry args={[.17, .22, .62 + tier * .12, 16]} />{shell}</mesh><mesh position={[0, .08, .18]}><boxGeometry args={[.16, .035, .012]} />{light}</mesh><mesh {...common} position={[0, .36 + tier * .06, 0]}><sphereGeometry args={[.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />{armor}</mesh></group>)}
    </group>}
    {research && <group>
      <mesh {...common} position={[0, .26, 0]}><cylinderGeometry args={[.48, .58, .42, 20]} />{shell}</mesh>
      <mesh {...common} position={[0, .48, 0]}><sphereGeometry args={[.39 + tier * .035, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />{armor}</mesh>
      <mesh {...common} position={[0, .98 + tier * .09, 0]}><cylinderGeometry args={[.045, .08, .72 + tier * .14, 10]} />{shell}</mesh>
      <mesh position={[0, 1.37 + tier * .16, 0]}><sphereGeometry args={[.09 + tier * .015, 16, 12]} />{light}</mesh>
    </group>}
    {missile && <group>
      {[-.34, 0, .34].map((x, silo) => <group key={x} position={[x, .12, 0]}><mesh {...common}><cylinderGeometry args={[.18, .21, .24, 16]} />{shell}</mesh><mesh position={[0, .13, 0]} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[.11, .17, 32]} />{glow}</mesh>{tier >= 2 && <mesh {...common} position={[0, .45 + silo * .05, 0]}><cylinderGeometry args={[.065, .09, .68 + silo * .1, 10]} />{armor}</mesh>}</group>)}
      <mesh {...common} position={[0, .28, -.42]}><boxGeometry args={[.86, .46, .22]} />{shell}</mesh>
      <mesh position={[0, .31, -.535]}><boxGeometry args={[.52, .045, .01]} />{light}</mesh>
    </group>}
  </group>;
}

function Facility({ index, level, selected, constructing, powered, resourceFill, name, onSelect }: { index: number; level: number; selected: boolean; constructing: boolean; powered: boolean; resourceFill?: number; name: string; onSelect: () => void }) {
  const [latitude, longitude] = FACILITY_SPOTS[index] ?? [0, 0];
  const normal = useMemo(() => new THREE.Vector3(
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.cos(longitude),
  ).normalize(), [latitude, longitude]);
  const orientation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal), [normal]);
  const surfacePosition = useMemo(() => normal.clone().multiplyScalar(terrainRadius(normal) + .075), [normal]);
  const yaw = ((index * 1.73) + latitude * 2.4 - longitude * .7) % (Math.PI * 2);
  const tier = Math.min(3, Math.floor(Math.max(0, level - 1) / 4));
  const operational = level > 0;
  const accent = operational ? powered ? "#63e5ff" : "#ff965d" : "#66777f";
  return <group position={surfacePosition} quaternion={orientation} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
    <group rotation={[0, yaw, 0]}>
      <mesh position={[0, -.09, 0]} receiveShadow castShadow><cylinderGeometry args={[.76 + tier * .07, .9 + tier * .075, .16, 16]} /><meshPhysicalMaterial color="#0d2635" roughness={.31} metalness={.88} clearcoat={.22} /></mesh>
      <mesh position={[0, -.001, 0]} receiveShadow castShadow><cylinderGeometry args={[.65 + tier * .06, .71 + tier * .065, .045, 16]} /><meshStandardMaterial color={operational ? "#315b6b" : "#2b383d"} roughness={.27} metalness={.74} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, .024, 0]}><ringGeometry args={[.49 + tier * .05, .53 + tier * .05, 48]} /><meshBasicMaterial color={accent} transparent opacity={operational ? .34 : .12} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
      {tier >= 1 && <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -.012, 0]}><ringGeometry args={[.72 + tier * .055, .75 + tier * .055, 48]} /><meshBasicMaterial color="#39778a" transparent opacity={.38} /></mesh>}
      {Array.from({ length: 6 }, (_, beacon) => {
        const angle = beacon * Math.PI / 3;
        const radius = .64 + tier * .06;
        return <group key={beacon} position={[Math.cos(angle) * radius, .055, Math.sin(angle) * radius]} rotation={[0, -angle, 0]}>
          <mesh castShadow><boxGeometry args={[.055, .09 + tier * .018, .055]} /><meshStandardMaterial color="#173746" metalness={.82} roughness={.24} /></mesh>
          <mesh position={[0, .07 + tier * .009, 0]}><sphereGeometry args={[.025, 8, 8]} /><meshBasicMaterial color={accent} transparent opacity={operational ? .92 : .22} toneMapped={false} /></mesh>
        </group>;
      })}
      {tier >= 2 && [0, Math.PI].map((angle) => <group key={angle} position={[Math.cos(angle) * .96, .015, Math.sin(angle) * .96]} rotation={[0, -angle, 0]}><mesh castShadow receiveShadow><boxGeometry args={[.34, .08, .2]} /><meshStandardMaterial color="#173343" metalness={.8} roughness={.28} /></mesh><mesh position={[0, .045, 0]}><boxGeometry args={[.22, .006, .08]} /><meshBasicMaterial color={accent} transparent opacity={.5} toneMapped={false} /></mesh></group>)}
      <FacilityGroundWorks index={index} level={level} accent={accent} />
      <FacilityDressing index={index} level={level} selected={selected} powered={powered} />
      <FacilitySystems index={index} level={level} selected={selected} powered={powered} />
      <FacilityScaleActivity level={level} selected={selected} accent={accent} powered={powered} />
      <FacilityOperationalAtmosphere index={index} level={level} accent={accent} powered={powered} />
      <ResourceFacilityState index={index} level={level} fill={resourceFill} powered={powered} />
      <FacilityConstructionRig active={constructing} level={level} accent="#ffbd64" />
      {selected && <FacilitySelection name={name} level={level} powered={powered} resourceFill={resourceFill} />}
    </group>
  </group>;
}

function AtmosphereShell({ color }: { color: string }) {
  const uniforms = useMemo(() => ({ glowColor: { value: new THREE.Color(color) } }), [color]);
  return <mesh scale={1.075} renderOrder={4}>
    <sphereGeometry args={[5.8, 64, 48]} />
    <shaderMaterial
      uniforms={uniforms}
      vertexShader={`
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `}
      fragmentShader={`
        uniform vec3 glowColor;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float rim = pow(1.0 - max(0.0, dot(vNormal, viewDirection)), 2.65);
          float horizon = smoothstep(0.08, 0.92, rim);
          gl_FragColor = vec4(glowColor * (1.1 + rim), horizon * 0.68);
        }
      `}
      side={THREE.BackSide}
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      toneMapped={false}
    />
  </mesh>;
}

function PlanetaryDefenseField({ smallDome, largeDome, color }: { smallDome: number; largeDome: number; color: string }) {
  const material = useRef<THREE.ShaderMaterial>(null!);
  const uniforms = useMemo(() => ({ shieldColor: { value: new THREE.Color(color) }, time: { value: 0 }, strength: { value: largeDome > 0 ? .72 : .42 } }), [color, largeDome]);
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.time.value = clock.getElapsedTime();
  });
  if (smallDome <= 0 && largeDome <= 0) return null;
  return <mesh scale={largeDome > 0 ? 1.13 : 1.095} renderOrder={5}>
    <sphereGeometry args={[5.8, 64, 48]} />
    <shaderMaterial
      ref={material}
      uniforms={uniforms}
      vertexShader={`
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main(){
          vNormal=normalize(mat3(modelMatrix)*normal);
          vec4 worldPosition=modelMatrix*vec4(position,1.0);
          vWorldPosition=worldPosition.xyz;
          gl_Position=projectionMatrix*viewMatrix*worldPosition;
        }`}
      fragmentShader={`
        uniform vec3 shieldColor;
        uniform float time;
        uniform float strength;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main(){
          vec3 viewDirection=normalize(cameraPosition-vWorldPosition);
          float rim=pow(1.0-max(0.0,dot(vNormal,viewDirection)),3.2);
          float scan=.5+.5*sin(vWorldPosition.y*7.5+time*.85);
          float pulse=.84+.16*sin(time*1.7);
          float alpha=(rim*.34+rim*scan*.16)*strength*pulse;
          gl_FragColor=vec4(shieldColor*(1.15+rim*.65),alpha);
        }`}
      side={THREE.BackSide}
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      toneMapped={false}
    />
  </mesh>;
}

function DefenseBattery({ type, formation, quantity, powered }: { type: number; formation: number; quantity: number; powered: boolean }) {
  const turret = useRef<THREE.Group>(null!);
  const pulse = useRef<THREE.MeshBasicMaterial>(null!);
  const latitude = -.95 + ((type * 5 + formation * 3) % 11) * .18;
  const longitude = -2.75 + ((type * 7 + formation * 5) % 19) * .3;
  const normal = useMemo(() => new THREE.Vector3(
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.cos(longitude),
  ).normalize(), [latitude, longitude]);
  const orientation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal), [normal]);
  const position = useMemo(() => normal.clone().multiplyScalar(terrainRadius(normal) + .045), [normal]);
  const strengthTier = THREE.MathUtils.clamp(Math.floor(Math.log10(quantity + 1)), 0, 3);
  const accents = ["#ffb56b", "#69e7ff", "#77c9ff", "#d8efff", "#8cb6ff", "#d28cff"];
  const accent = powered ? accents[type] : "#ff8a62";
  useFrame(({ clock }, delta) => {
    if (turret.current) turret.current.rotation.y += delta * (.14 + type * .018) * (powered ? 1 : .08);
    if (pulse.current) pulse.current.opacity = powered ? .34 + Math.sin(clock.getElapsedTime() * 1.7 + type + formation) * .12 : .06;
  });
  return <group position={position} quaternion={orientation} scale={.72 + strengthTier * .08}>
    <mesh receiveShadow castShadow position={[0, .025, 0]}><cylinderGeometry args={[.3, .38, .12, 12]} /><meshStandardMaterial color="#142b37" metalness={.86} roughness={.3} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, .09, 0]}><ringGeometry args={[.23, .27, 32]} /><meshBasicMaterial ref={pulse} color={accent} transparent opacity={.36} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    <group ref={turret} position={[0, .2, 0]}>
      <mesh castShadow><cylinderGeometry args={[.14, .2, .25, 12]} /><meshStandardMaterial color="#38515e" metalness={.88} roughness={.22} /></mesh>
      {type === 0 && <group rotation={[.18, 0, 0]}>{[-.08, .08].map((x) => <mesh key={x} position={[x, .16, .2]} castShadow><cylinderGeometry args={[.035, .055, .42, 8]} /><meshStandardMaterial color="#738994" metalness={.9} roughness={.19} /></mesh>)}</group>}
      {(type === 1 || type === 2) && <group position={[0, .13, .22]} rotation={[Math.PI / 2 - .18, 0, 0]}>{[-.055, .055].map((x) => <mesh key={x} position={[x, 0, 0]}><cylinderGeometry args={[.018 + type * .005, .035, .48 + type * .08, 8]} /><meshStandardMaterial color="#8ca2aa" emissive={accent} emissiveIntensity={powered ? .24 : .03} metalness={.92} roughness={.16} /></mesh>)}</group>}
      {type === 3 && <group position={[0, .16, .18]} rotation={[Math.PI / 2 - .2, 0, 0]}><mesh castShadow><cylinderGeometry args={[.06, .105, .62, 12]} /><meshStandardMaterial color="#8da5ae" metalness={.94} roughness={.14} /></mesh><mesh position={[0, .32, 0]}><torusGeometry args={[.09, .018, 8, 24]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh></group>}
      {type === 4 && <group position={[0, .2, .15]}><mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.14, .025, 9, 28]} /><meshBasicMaterial color={accent} transparent opacity={.72} toneMapped={false} /></mesh><mesh position={[0, 0, .18]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[.11, .48, 16, 1, true]} /><meshBasicMaterial color={accent} transparent opacity={.12} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh></group>}
      {type === 5 && <group position={[0, .2, .08]}><mesh><icosahedronGeometry args={[.14, 1]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={powered ? 1.2 : .12} metalness={.42} roughness={.12} toneMapped={false} /></mesh><mesh scale={1.65}><icosahedronGeometry args={[.14, 1]} /><meshBasicMaterial color={accent} wireframe transparent opacity={.22} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh></group>}
    </group>
    {Array.from({ length: strengthTier }, (_, node) => { const angle = node * Math.PI * 2 / Math.max(1, strengthTier); return <mesh key={node} position={[Math.cos(angle) * .34, .09, Math.sin(angle) * .34]}><sphereGeometry args={[.025, 7, 7]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>; })}
  </group>;
}

function PlanetaryDefenseNetwork({ state, powered }: { state: PlayerState; powered: boolean }) {
  const batteries = DEFENSE.slice(0, 6).flatMap((defense, type) => {
    const quantity = Number((state.planet as unknown as Record<string, number>)[defense.key] ?? 0);
    const formations = quantity > 0 ? THREE.MathUtils.clamp(Math.ceil(Math.log10(quantity + 1)), 1, 3) : 0;
    return Array.from({ length: formations }, (_, formation) => ({ type, formation, quantity, key: `${defense.key}:${formation}` }));
  });
  return <>{batteries.map((battery) => <DefenseBattery key={battery.key} type={battery.type} formation={battery.formation} quantity={battery.quantity} powered={powered} />)}</>;
}

function SurfaceActivityMarker({ index, label, color }: { index: number; label: string; color: string }) {
  const ring = useRef<THREE.Mesh>(null!);
  const beam = useRef<THREE.MeshBasicMaterial>(null!);
  const [latitude, longitude] = FACILITY_SPOTS[index] ?? FACILITY_SPOTS[0];
  const normal = useMemo(() => new THREE.Vector3(
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.cos(longitude),
  ).normalize(), [latitude, longitude]);
  const orientation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal), [normal]);
  const surfacePosition = useMemo(() => normal.clone().multiplyScalar(terrainRadius(normal) + .12), [normal]);
  useFrame(({ clock }, delta) => {
    if (ring.current) ring.current.rotation.z += delta * .28;
    if (beam.current) beam.current.opacity = .075 + Math.sin(clock.getElapsedTime() * 2.1 + index) * .025;
  });
  return <group position={surfacePosition} quaternion={orientation}>
    <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]} position={[0, .03, 0]} renderOrder={6}><ringGeometry args={[.82, .86, 64, 1, .18, Math.PI * 1.55]} /><meshBasicMaterial color={color} transparent opacity={.56} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    <mesh position={[0, .72, 0]} renderOrder={5}><cylinderGeometry args={[.03, .22, 1.42, 18, 1, true]} /><meshBasicMaterial ref={beam} color={color} transparent opacity={.08} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
    <pointLight position={[0, .34, 0]} color={color} intensity={.75} distance={2.1} />
    <Billboard position={[0, 1.62, 0]} follow><Text fontSize={.11} color={color} outlineWidth={.008} outlineColor="#020711" anchorX="center" anchorY="middle">{label}</Text></Billboard>
  </group>;
}

function SurfaceActivity({ state }: { state: PlayerState }) {
  const markers = useMemo(() => {
    const byFacility = new Map<number, { index: number; label: string; color: string }>();
    if (state.planet.buildQueueItem !== 255 && state.planet.buildFinishTs > 0) {
      const index = THREE.MathUtils.clamp(state.planet.buildQueueItem, 0, BUILDINGS.length - 1);
      byFacility.set(index, { index, label: "CONSTRUCTION ACTIVE", color: "#ffbd64" });
    }
    if (state.research.queueItem !== 255 && state.research.researchFinishTs > 0) byFacility.set(11, { index: 11, label: "RESEARCH ACTIVE", color: "#b996ff" });
    if (state.planet.shipBuildItem !== 255 && state.planet.shipBuildFinishTs > 0) byFacility.set(7, { index: 7, label: "SHIP ASSEMBLY", color: "#66e6ff" });
    if (state.planet.defenseBuildItem !== 255 && state.planet.defenseBuildFinishTs > 0) byFacility.set(7, { index: 7, label: "DEFENSE ASSEMBLY", color: "#ff7e94" });
    return [...byFacility.values()];
  }, [state.planet.buildFinishTs, state.planet.buildQueueItem, state.planet.defenseBuildFinishTs, state.planet.defenseBuildItem, state.planet.shipBuildFinishTs, state.planet.shipBuildItem, state.research.queueItem, state.research.researchFinishTs]);
  return <>{markers.map((marker) => <SurfaceActivityMarker key={`${marker.index}:${marker.label}`} {...marker} />)}</>;
}

function CloudShell({ enabled, style }: { enabled: boolean; style: PlanetSurfaceStyle }) {
  const ref = useRef<THREE.Mesh>(null!);
  const sourceTexture = useTexture(terranClouds);
  const biomeIndex = planetBiomeIndex(style);
  const variantSeed = style.variantSeed ?? biomeIndex;
  const texture = useMemo(() => {
    const clone = sourceTexture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(1 + (variantSeed % 5) * .11, 1 + ((variantSeed >>> 4) % 5) * .08);
    clone.offset.set((variantSeed % 997) / 997, ((variantSeed >>> 10) % 991) / 991);
    clone.needsUpdate = true;
    return clone;
  }, [sourceTexture, variantSeed]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((_, delta) => {
    if (ref.current && enabled) ref.current.rotation.y += delta * (.0028 + (variantSeed % 7) * .00045);
  });
  if (!enabled) return null;
  return <mesh ref={ref} scale={1.024} castShadow receiveShadow renderOrder={2}>
    <sphereGeometry args={[5.8, 64, 48]} />
    <meshPhysicalMaterial map={texture} alphaMap={texture} color={style.atmosphere} transparent opacity={.2 + (biomeIndex % 4) * .035} alphaTest={.025} roughness={.88} depthWrite={false} />
  </mesh>;
}

function CinematicPlanetEnvironment() {
  const shell = useRef<THREE.Mesh>(null!);
  const panorama = useTexture(cinematicNebulaPanorama);
  panorama.colorSpace = THREE.SRGBColorSpace;
  panorama.wrapS = THREE.RepeatWrapping;
  useFrame(({ clock }) => {
    if (shell.current) shell.current.rotation.y = clock.getElapsedTime() * .0009;
  });
  return <mesh ref={shell}>
    <sphereGeometry args={[72, 64, 32]} />
    <meshBasicMaterial map={panorama} color="#8799c2" transparent opacity={.42} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
  </mesh>;
}

function OrbitalLightSource({ color }: { color: string }) {
  const flare = useTexture(stellarFlare);
  flare.colorSpace = THREE.SRGBColorSpace;
  return <group position={[-24, 14, -18]}>
    <sprite scale={[8.5, 8.5, 1]} renderOrder={-1}><spriteMaterial map={flare} color="#dff4ff" transparent opacity={.28} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
    <sprite scale={[3.2, 3.2, 1]}><spriteMaterial map={flare} color={color} transparent opacity={.54} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
    <mesh><sphereGeometry args={[.42, 24, 24]} /><meshBasicMaterial color="#fff8e8" toneMapped={false} /></mesh>
  </group>;
}

function CinematicReflectionRig({ accent }: { accent: string }) {
  return <Environment resolution={128} frames={1} background={false}>
    <Lightformer form="rect" intensity={4.8} color="#d9f7ff" position={[-5, 7, 7]} rotation={[Math.PI / 2, 0, .48]} scale={[7, 3.2, 1]} />
    <Lightformer form="rect" intensity={2.4} color={accent} position={[7, 1, 3]} rotation={[0, -Math.PI / 2, 0]} scale={[5, 2.2, 1]} />
    <Lightformer form="circle" intensity={3.2} color="#fff1d2" position={[-4, -4, 5]} rotation={[0, .35, 0]} scale={[2.4, 2.4, 1]} />
    <Lightformer form="ring" intensity={1.9} color={accent} position={[0, 6, -8]} rotation={[0, 0, 0]} scale={[5.5, 5.5, 1]} />
    <Lightformer form="rect" intensity={1.25} color="#6f82b9" position={[0, -6, -4]} rotation={[-Math.PI / 2, 0, 0]} scale={[9, 4, 1]} />
  </Environment>;
}

function OrbitalVessel({ shipType, quantity, scale = 1, color }: { shipType: number; quantity: number; scale?: number; color: string }) {
  const capital = shipType >= 4 && shipType <= 8;
  const cargo = shipType <= 1;
  const fighter = shipType === 2 || shipType === 3;
  const escortLights = THREE.MathUtils.clamp(Math.floor(Math.log10(quantity + 1)), 0, 3);
  const hull = <meshStandardMaterial color={capital ? "#4d6470" : "#607783"} metalness={.9} roughness={.19} />;
  const armor = <meshStandardMaterial color="#1d323e" metalness={.86} roughness={.24} />;
  const glow = <meshBasicMaterial color={color} transparent opacity={.82} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />;
  return <group scale={scale} rotation={[0, 0, -Math.PI / 2]}>
    {cargo && <group>
      <mesh castShadow position={[0, .02, 0]}><boxGeometry args={[.28 + shipType * .11, .66 + shipType * .16, .25 + shipType * .06]} />{armor}</mesh>
      {[-.14, .14].map((x) => <mesh key={x} castShadow position={[x, .05, 0]}><boxGeometry args={[.11, .48 + shipType * .14, .27]} /><meshStandardMaterial color={shipType ? "#617884" : "#526a76"} metalness={.82} roughness={.28} /></mesh>)}
      <mesh position={[0, .39 + shipType * .08, 0]}><boxGeometry args={[.18, .05, .16]} />{glow}</mesh>
    </group>}
    {fighter && <group>
      <mesh castShadow><coneGeometry args={[.12 + shipType * .008, .72 + (shipType - 2) * .12, 5]} />{hull}</mesh>
      {[-1, 1].map((side) => <mesh key={side} castShadow position={[side * .25, -.12, 0]} rotation={[0, 0, side * .18]}><boxGeometry args={[.4, .25, .035]} />{armor}</mesh>)}
      <mesh position={[0, -.36 - (shipType - 2) * .05, 0]}><coneGeometry args={[.08, .24, 8]} />{glow}</mesh>
    </group>}
    {capital && <group>
      <mesh castShadow scale={[1 + (shipType - 4) * .11, 1.5 + (shipType - 4) * .16, .85 + (shipType - 4) * .04]}><octahedronGeometry args={[.24, 0]} />{hull}</mesh>
      <mesh castShadow position={[0, -.25, 0]}><boxGeometry args={[.42 + (shipType - 4) * .06, .55 + (shipType - 4) * .08, .16]} />{armor}</mesh>
      {[-1, 1].map((side) => <mesh key={side} castShadow position={[side * (.3 + (shipType - 4) * .025), -.08, 0]} rotation={[0, 0, side * .12]}><boxGeometry args={[.34, .12, .08]} />{hull}</mesh>)}
      {[-.1, .1].map((x) => <mesh key={x} position={[x, -.52 - (shipType - 4) * .045, 0]}><coneGeometry args={[.055, .26, 8]} />{glow}</mesh>)}
    </group>}
    {shipType === 9 && <group><mesh castShadow><icosahedronGeometry args={[.42, 2]} />{armor}</mesh><mesh scale={1.035}><icosahedronGeometry args={[.42, 1]} /><meshBasicMaterial color={color} wireframe transparent opacity={.2} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh><mesh position={[0, .22, .32]}><sphereGeometry args={[.08, 12, 10]} />{glow}</mesh></group>}
    {shipType === 10 && <group><mesh castShadow><cylinderGeometry args={[.13, .2, .62, 10]} />{armor}</mesh><mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.32, .055, 8, 28]} />{hull}</mesh>{[0, Math.PI / 2].map((angle) => <mesh key={angle} rotation={[0, angle, 0]}><boxGeometry args={[.06, .54, .06]} />{hull}</mesh>)}<mesh position={[0, -.35, 0]}><coneGeometry args={[.07, .22, 8]} />{glow}</mesh></group>}
    {shipType === 11 && <group><mesh castShadow><sphereGeometry args={[.15, 14, 10]} />{armor}</mesh><mesh position={[0, .18, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.18, .025, 8, 28]} />{hull}</mesh><mesh position={[0, .31, 0]}><sphereGeometry args={[.035, 8, 8]} />{glow}</mesh></group>}
    {shipType === 12 && <group><mesh castShadow><cylinderGeometry args={[.24, .34, .68, 12]} />{armor}</mesh><mesh position={[0, .05, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.38, .07, 8, 32]} />{hull}</mesh><mesh position={[0, .32, 0]}><sphereGeometry args={[.15, 14, 10]} /><meshStandardMaterial color="#6f91a0" emissive={color} emissiveIntensity={.22} metalness={.72} roughness={.2} /></mesh><mesh position={[0, -.39, 0]}><coneGeometry args={[.09, .28, 8]} />{glow}</mesh></group>}
    {Array.from({ length: escortLights }, (_, light) => <mesh key={light} position={[(light - (escortLights - 1) / 2) * .11, -.16, .18]}><sphereGeometry args={[.018, 6, 6]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>)}
  </group>;
}

type PlanetMission = PlayerState["fleet"]["missions"][number];

function MissionFlightFormation({ mission, slot }: { mission: PlanetMission; slot: number }) {
  const flight = useRef<THREE.Group>(null!);
  const vessel = useRef<THREE.Group>(null!);
  const trail = useRef<THREE.MeshBasicMaterial>(null!);
  const label = mission.missionType === 1 ? "ATTACK" : mission.missionType === 2 ? "TRANSPORT" : mission.missionType === 5 ? "COLONIZE" : mission.missionType === 6 ? "ESPIONAGE" : "MISSION";
  const color = mission.missionType === 1 ? "#ff6f72" : mission.missionType === 5 ? "#69efb0" : mission.missionType === 6 ? "#bd91ff" : "#69e8ff";
  const shipFields = ["sSmallCargo", "sLargeCargo", "sLightFighter", "sHeavyFighter", "sCruiser", "sBattleship", "sBattlecruiser", "sBomber", "sDestroyer", "sDeathstar", "sRecycler", "sEspionageProbe", "sColonyShip"] as const;
  const shipType = shipFields.reduce((selected, field, index) => mission[field] > 0 ? index : selected, 0);
  const quantity = shipFields.reduce((total, field) => total + mission[field], 0);
  const curve = useMemo(() => {
    const seed = mission.targetGalaxy * 73856093 ^ mission.targetSystem * 19349663 ^ mission.targetPosition * 83492791 ^ slot * 2654435761;
    const azimuth = ((seed >>> 0) % 10000) / 10000 * Math.PI * 2;
    const elevation = -.42 + (((seed >>> 8) >>> 0) % 1000) / 1000 * .84;
    const direction = new THREE.Vector3(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)).normalize();
    const side = new THREE.Vector3().crossVectors(direction, Math.abs(direction.y) > .82 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const start = direction.clone().multiplyScalar(7.15);
    const end = direction.clone().multiplyScalar(22);
    const middle = direction.clone().multiplyScalar(14).addScaledVector(side, 2.1 + slot * .28);
    return new THREE.CatmullRomCurve3([start, middle, end]);
  }, [mission.targetGalaxy, mission.targetPosition, mission.targetSystem, slot]);
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 52, .014, 5, false), [curve]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (!vessel.current) return;
    const now = Date.now() / 1000;
    const outboundDuration = Math.max(1, mission.arriveTs - mission.departTs);
    const legStart = mission.applied ? mission.returnTs - outboundDuration : mission.departTs;
    const legEnd = mission.applied ? mission.returnTs : mission.arriveTs;
    const progress = THREE.MathUtils.clamp((now - legStart) / Math.max(1, legEnd - legStart), 0, 1);
    if (flight.current) flight.current.visible = now < legEnd;
    const curveProgress = mission.applied ? 1 - progress : progress;
    vessel.current.position.copy(curve.getPointAt(curveProgress));
    const tangent = curve.getTangentAt(curveProgress).normalize().multiplyScalar(mission.applied ? -1 : 1);
    vessel.current.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent);
    if (trail.current) trail.current.opacity = .12 + Math.sin(clock.getElapsedTime() * 2 + slot) * .035;
  });
  const destination = `${mission.targetGalaxy}:${mission.targetSystem}:${mission.targetPosition}`;
  return <group ref={flight}>
    <mesh geometry={geometry} renderOrder={1}><meshBasicMaterial ref={trail} color={color} transparent opacity={.14} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    <group ref={vessel}>
      <OrbitalVessel shipType={shipType} quantity={Math.max(1, quantity)} scale={shipType === 9 ? .9 : shipType >= 4 && shipType <= 8 ? .7 : .55} color={color} />
      <pointLight color={color} intensity={1.3} distance={2.4} decay={2} />
      <Billboard position={[0, .7, 0]} follow><Text fontSize={.16} color={color} outlineWidth={.012} outlineColor="#01040a" anchorX="center" anchorY="middle">{`${mission.applied ? "RETURNING" : label}  ·  ${destination}`}</Text></Billboard>
    </group>
  </group>;
}

function OrbitalPresence({ state, style }: { state: PlayerState; style: PlanetSurfaceStyle }) {
  const fleetOrbit = useRef<THREE.Group>(null!);
  const utilityOrbit = useRef<THREE.Group>(null!);
  const fleetFormations = useMemo(() => SHIPS.slice(0, 13).flatMap((ship, shipType) => {
    const quantity = Number((state.fleet as unknown as Record<string, number>)[ship.key] ?? 0);
    const formationCount = quantity > 0 ? THREE.MathUtils.clamp(Math.ceil(Math.log10(quantity + 1)), 1, 2) : 0;
    return Array.from({ length: formationCount }, (_, formation) => ({ shipType, quantity, formation, key: `${ship.key}:${formation}` }));
  }).slice(0, 12), [state.fleet]);
  const satelliteCount = state.fleet.solarSatellite > 0 ? THREE.MathUtils.clamp(Math.ceil(Math.log2(state.fleet.solarSatellite + 1)), 1, 4) : 0;
  const shipyardLevel = Number(state.planet.shipyard ?? 0);
  const orbitRadius = style.rings ? 12.6 : 8.15;
  useFrame((_, delta) => {
    if (fleetOrbit.current) fleetOrbit.current.rotation.y += delta * .024;
    if (utilityOrbit.current) utilityOrbit.current.rotation.y -= delta * .012;
  });
  if (fleetFormations.length === 0 && satelliteCount === 0 && shipyardLevel === 0) return null;
  return <group>
    {state.fleet.missions.map((mission, slot) => mission.missionType === 0 ? null : <MissionFlightFormation key={`mission:${slot}:${mission.departTs}`} mission={mission} slot={slot} />)}
    <group ref={fleetOrbit} rotation={[.3, 0, -.12]}>
      {fleetFormations.map((formation, index) => {
        const angle = index / Math.max(1, fleetFormations.length) * Math.PI * 2 + .48;
        const radius = orbitRadius + (index % 3) * .38;
        const classScale = formation.shipType === 9 ? 1.12 : formation.shipType >= 4 && formation.shipType <= 8 ? .82 : formation.shipType === 12 ? .88 : .62;
        return <group key={formation.key} position={[Math.cos(angle) * radius, Math.sin(index * 1.7) * .42, Math.sin(angle) * radius]} rotation={[0, -angle, 0]}>
          <OrbitalVessel shipType={formation.shipType} quantity={formation.quantity} scale={classScale + formation.formation * .07} color={style.atmosphere} />
        </group>;
      })}
    </group>
    <group ref={utilityOrbit} rotation={[-.18, .4, .2]}>
      {Array.from({ length: satelliteCount }, (_, index) => {
        const angle = index / Math.max(1, satelliteCount) * Math.PI * 2 + 1.2;
        return <group key={`satellite-${index}`} position={[Math.cos(angle) * (orbitRadius + .72), Math.sin(index * 2.1) * .45, Math.sin(angle) * (orbitRadius + .72)]} rotation={[0, -angle, 0]}>
          <mesh castShadow><boxGeometry args={[.2, .12, .16]} /><meshStandardMaterial color="#526d78" metalness={.88} roughness={.2} /></mesh>
          {[-.31, .31].map((x) => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[.42, .018, .18]} /><meshPhysicalMaterial color="#226b9a" emissive="#0b466d" emissiveIntensity={.6} metalness={.4} roughness={.18} clearcoat={.44} /></mesh>)}
          <pointLight color={style.atmosphere} intensity={.28} distance={1.2} />
        </group>;
      })}
      {shipyardLevel > 0 && <group position={[orbitRadius + 1.15, .32, 0]} rotation={[0, 0, -.12]} scale={.72 + Math.min(12, shipyardLevel) * .025}>
        <mesh castShadow><cylinderGeometry args={[.34, .42, .72, 10]} /><meshStandardMaterial color="#203744" metalness={.88} roughness={.24} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.58, .055, 8, 36]} /><meshStandardMaterial color="#75909a" emissive={style.atmosphere} emissiveIntensity={.2} metalness={.82} roughness={.2} /></mesh>
        {[-.72, .72].map((x) => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[.72, .08, .22]} /><meshStandardMaterial color="#314d5b" metalness={.82} roughness={.22} /></mesh>)}
        <mesh position={[0, .44, 0]}><sphereGeometry args={[.07, 12, 12]} /><meshBasicMaterial color={style.atmosphere} toneMapped={false} /></mesh>
      </group>}
    </group>
  </group>;
}

function PlanetCameraRig({ selected, selectedLevel, resetCommand, inspectionActive }: { selected: number; selectedLevel: number; resetCommand: number; inspectionActive: boolean }) {
  const controls = useRef<any>(null);
  const { camera } = useThree();
  const mounted = useRef(false);
  const transition = useRef<{ startedAt: number; duration: number; fromPosition: THREE.Vector3; fromTarget: THREE.Vector3; toPosition: THREE.Vector3; toTarget: THREE.Vector3 } | null>(null);
  useCameraInputCancel(controls, transition);
  const beginTransition = (toPosition: THREE.Vector3, toTarget: THREE.Vector3, duration: number) => {
    const orbit = controls.current;
    if (!orbit) return;
    transition.current = {
      startedAt: performance.now(),
      duration: Math.max(1, motionDuration(duration)),
      fromPosition: camera.position.clone(),
      fromTarget: orbit.target.clone(),
      toPosition,
      toTarget,
    };
  };
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    if (!mounted.current) {
      mounted.current = true;
      camera.position.set(0, 3.2, 19.5);
      orbit.target.set(0, 0, 0);
      orbit.update();
      beginTransition(new THREE.Vector3(0, .9, 13.8), new THREE.Vector3(0, 0, 0), 850);
      return;
    }
    if (!inspectionActive) return;
    const [latitude, longitude] = FACILITY_SPOTS[selected] ?? FACILITY_SPOTS[0];
    const normal = new THREE.Vector3(
      Math.cos(latitude) * Math.sin(longitude),
      Math.sin(latitude),
      Math.cos(latitude) * Math.cos(longitude),
    ).normalize();
    const tangent = new THREE.Vector3(-normal.z, 0, normal.x).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    const stage = facilityStage(selectedLevel);
    const silhouetteHeight = .08 + stage * .075;
    const cameraDistance = 2.18 + stage * .34;
    const lateral = .82 + (selected % 4) * .13;
    const elevation = .38 + ((selected * 7) % 4) * .12 + stage * .055;
    const side = selected % 2 === 0 ? 1 : -1;
    const toTarget = normal.clone().multiplyScalar(5.98 + silhouetteHeight);
    const toPosition = toTarget.clone().addScaledVector(normal, cameraDistance).addScaledVector(tangent, lateral * side).addScaledVector(bitangent, elevation);
    beginTransition(toPosition, toTarget, 550 + stage * 60);
  }, [inspectionActive, selected, selectedLevel]);
  useEffect(() => {
    if (!resetCommand) return;
    beginTransition(new THREE.Vector3(0, .9, 13.8), new THREE.Vector3(0, 0, 0), 450);
  }, [resetCommand]);
  useFrame(() => {
    const active = transition.current;
    const orbit = controls.current;
    if (!active || !orbit) return;
    const progress = THREE.MathUtils.clamp((performance.now() - active.startedAt) / active.duration, 0, 1);
    const eased = easeSceneProgress(progress);
    camera.position.lerpVectors(active.fromPosition, active.toPosition, eased);
    orbit.target.lerpVectors(active.fromTarget, active.toTarget, eased);
    orbit.update();
    if (progress >= 1) transition.current = null;
  });
  return <ArcballControls ref={controls} enablePan enableZoom enableRotate dampingFactor={0.1} minDistance={1.25} maxDistance={36} />;
}

function SurfaceLink({ from, to, activity, powered }: { from: THREE.Vector3; to: THREE.Vector3; activity: number; powered: boolean }) {
  const traffic = useRef<THREE.Group>(null!);
  const curve = useMemo(() => {
    const points = Array.from({ length: 25 }, (_, index) => {
      const t = index / 24;
      return from.clone().lerp(to, t).normalize().multiplyScalar(5.835 + Math.sin(t * Math.PI) * .035);
    });
    return new THREE.CatmullRomCurve3(points);
  }, [from, to]);
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 28, .012 + Math.min(activity, 24) * .00035, 4, false), [activity, curve]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (!traffic.current) return;
    traffic.current.children.forEach((vehicle, index) => {
      const progress = (clock.getElapsedTime() * (.018 + Math.min(activity, 20) * .0006) * (powered ? 1 : .08) + index / traffic.current.children.length) % 1;
      vehicle.position.copy(curve.getPointAt(progress));
    });
  });
  const trafficCount = THREE.MathUtils.clamp(Math.ceil(activity / 5), 1, 4);
  return <group>
    <mesh geometry={geometry} renderOrder={1}><meshBasicMaterial color={powered ? "#33c8e8" : "#ff965d"} transparent opacity={powered ? .42 : .08} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    <group ref={traffic}>{Array.from({ length: trafficCount }, (_, vehicle) => <mesh key={vehicle} renderOrder={4}><sphereGeometry args={[.025 + Math.min(activity, 20) * .0005, 7, 7]} /><meshBasicMaterial color={vehicle % 2 ? "#ffd07a" : "#baf8ff"} toneMapped={false} /></mesh>)}</group>
  </group>;
}

function InfrastructureNetwork({ levels, powered }: { levels: number[]; powered: boolean }) {
  const activeSites = useMemo(() => levels
    .map((level, index) => ({ level, index }))
    .filter(({ level }) => level > 0)
    .map(({ index, level }) => {
      const [latitude, longitude] = FACILITY_SPOTS[index];
      return { point: new THREE.Vector3(Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude), Math.cos(latitude) * Math.cos(longitude)).normalize(), level };
    }), [levels]);
  if (activeSites.length < 2) return null;
  return <group>{activeSites.map((site, index) => { const next = activeSites[(index + 1) % activeSites.length]; return <SurfaceLink key={index} from={site.point} to={next.point} activity={site.level + next.level} powered={powered} />; })}</group>;
}

function CivilizationLights({ levels, powered }: { levels: number[]; powered: boolean }) {
  const { positions, colors } = useMemo(() => {
    const positionValues: number[] = [];
    const colorValues: number[] = [];
    const lightDirection = new THREE.Vector3(-10, 8, 14).normalize();
    const palette = ["#ffc36b", "#69e8ff", "#61efbd", "#ffe16e", "#b48cff", "#72dcff"];
    levels.forEach((level, facilityIndex) => {
      if (level <= 0) return;
      const [latitude, longitude] = FACILITY_SPOTS[facilityIndex] ?? FACILITY_SPOTS[0];
      const siteNormal = new THREE.Vector3(
        Math.cos(latitude) * Math.sin(longitude),
        Math.sin(latitude),
        Math.cos(latitude) * Math.cos(longitude),
      ).normalize();
      const tangent = new THREE.Vector3().crossVectors(Math.abs(siteNormal.y) > .92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0), siteNormal).normalize();
      const bitangent = new THREE.Vector3().crossVectors(siteNormal, tangent).normalize();
      const lightCount = Math.min(18, 4 + level * 2);
      const baseColor = new THREE.Color(palette[facilityIndex % palette.length]);
      const nightStrength = THREE.MathUtils.clamp(.34 - siteNormal.dot(lightDirection) * .76, .18, 1);
      for (let light = 0; light < lightCount; light += 1) {
        const angle = light * 2.399963 + facilityIndex * .71;
        const radial = .045 + Math.sqrt((light + 1) / lightCount) * (.16 + Math.min(level, 12) * .008);
        const normal = siteNormal.clone()
          .addScaledVector(tangent, Math.cos(angle) * radial)
          .addScaledVector(bitangent, Math.sin(angle) * radial)
          .normalize();
        const position = normal.multiplyScalar(terrainRadius(normal) + .035);
        positionValues.push(position.x, position.y, position.z);
        const variation = .72 + ((light * 37 + facilityIndex * 19) % 23) / 82;
        const powerStrength = powered ? 1 : .12;
        colorValues.push(baseColor.r * variation * nightStrength * powerStrength, baseColor.g * variation * nightStrength * powerStrength, baseColor.b * variation * nightStrength * powerStrength);
      }
    });
    return { positions: new Float32Array(positionValues), colors: new Float32Array(colorValues) };
  }, [levels, powered]);
  if (positions.length === 0) return null;
  return <group renderOrder={3}>
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /><bufferAttribute attach="attributes-color" args={[colors, 3]} /></bufferGeometry>
      <pointsMaterial vertexColors size={.065} sizeAttenuation transparent opacity={.96} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </points>
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /><bufferAttribute attach="attributes-color" args={[colors, 3]} /></bufferGeometry>
      <pointsMaterial vertexColors size={.18} sizeAttenuation transparent opacity={.14} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </points>
  </group>;
}

function BiomeAtmosphereEffects({ style }: { style: PlanetSurfaceStyle }) {
  const weather = useRef<THREE.Group>(null!);
  const glow = useRef<THREE.PointsMaterial>(null!);
  const biomeIndex = planetBiomeIndex(style);
  const variantSeed = style.variantSeed ?? biomeIndex;
  const config = useMemo(() => {
    if (style.className === "volcanic") return { count: 76, color: "#ff8a3d", size: .075, glowSize: .22, opacity: .82, speed: .0065 };
    if (style.className === "ice") return { count: 108, color: "#91f6ff", size: .068, glowSize: .2, opacity: .68, speed: .0032 };
    if (style.className === "gas") return { count: 118, color: style.atmosphere, size: .062, glowSize: .18, opacity: .5, speed: .0045 };
    if (style.className === "ocean") return { count: 84, color: "#b7f5ff", size: .06, glowSize: .19, opacity: .5, speed: .0024 };
    return { count: 64, color: style.atmosphere, size: .055, glowSize: .17, opacity: .4, speed: .0018 };
  }, [style.atmosphere, style.className]);
  const positions = useMemo(() => {
    let seed = (variantSeed + 1) * 2654435761;
    const random = () => {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822519);
      seed = Math.imul(seed ^ (seed >>> 13), 3266489917);
      return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
    };
    const values = new Float32Array(config.count * 3);
    for (let index = 0; index < config.count; index += 1) {
      const longitude = random() * Math.PI * 2;
      let latitude: number;
      let altitude: number;
      if (style.className === "ice") {
        const hemisphere = index % 2 === 0 ? 1 : -1;
        latitude = hemisphere * (.86 + random() * .48);
        altitude = .22 + random() * .38;
      } else if (style.className === "gas") {
        const band = [-.68, -.27, .18, .56][index % 4];
        latitude = band + (random() - .5) * .13;
        altitude = .16 + random() * .18;
      } else if (style.className === "volcanic") {
        latitude = (random() - .5) * 1.65;
        altitude = .08 + Math.pow(random(), .45) * .62;
      } else {
        latitude = (random() - .5) * (style.className === "ocean" ? 1.72 : 2.2);
        altitude = .16 + random() * (style.className === "ocean" ? .3 : .2);
      }
      const radius = 5.8 + altitude;
      const horizontal = Math.cos(latitude) * radius;
      values[index * 3] = Math.sin(longitude) * horizontal;
      values[index * 3 + 1] = Math.sin(latitude) * radius;
      values[index * 3 + 2] = Math.cos(longitude) * horizontal;
    }
    return values;
  }, [config.count, style.className, variantSeed]);
  useFrame(({ clock }, delta) => {
    if (weather.current) weather.current.rotation.y += delta * config.speed;
    if (glow.current) glow.current.opacity = config.opacity * (.1 + Math.sin(clock.getElapsedTime() * .32 + biomeIndex) * .018);
  });
  return <group ref={weather} rotation={[0, (variantSeed % 19) * .17, 0]} renderOrder={4}>
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color={config.color} size={config.size} sizeAttenuation transparent opacity={config.opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </points>
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial ref={glow} color={config.color} size={config.glowSize} sizeAttenuation transparent opacity={config.opacity * .1} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </points>
  </group>;
}

function BiomeSurfaceLandmarks({ style }: { style: PlanetSurfaceStyle }) {
  const landmarks = useRef<THREE.InstancedMesh>(null!);
  const biomeIndex = planetBiomeIndex(style);
  const variantSeed = style.variantSeed ?? biomeIndex;
  const count = style.className === "gas" ? 0 : style.className === "volcanic" ? 46 : style.className === "ice" ? 38 : 28;
  const transforms = useMemo(() => {
    let seed = (variantSeed + 17) * 2654435761;
    const random = () => {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822519);
      seed = Math.imul(seed ^ (seed >>> 13), 3266489917);
      return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
    };
    const values: Array<{ position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3; color: THREE.Color }> = [];
    let attempts = 0;
    while (values.length < count && attempts < count * 9) {
      attempts += 1;
      const longitude = random() * Math.PI * 2;
      const latitude = Math.asin(random() * 2 - 1) * .92;
      const normal = new THREE.Vector3(Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude), Math.cos(latitude) * Math.cos(longitude)).normalize();
      if (facilityLandInfluence(normal) > .12) continue;
      const height = style.className === "volcanic" ? .075 + random() * .18 : style.className === "ice" ? .055 + random() * .15 : .035 + random() * .095;
      const width = style.className === "ice" ? .035 + random() * .065 : .055 + random() * .09;
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(normal, random() * Math.PI * 2));
      values.push({
        position: normal.clone().multiplyScalar(terrainRadiusForStyle(normal, style) + height * .35),
        quaternion,
        scale: new THREE.Vector3(width, height, width * (.72 + random() * .5)),
        color: new THREE.Color(style.className === "volcanic" ? (random() > .72 ? "#bc4825" : "#281916") : style.className === "ice" ? (random() > .5 ? "#a9f5ff" : "#6caec7") : random() > .5 ? style.highland : style.coast),
      });
    }
    return values;
  }, [count, style.className, style.coast, style.highland, style, variantSeed]);
  useEffect(() => {
    if (!landmarks.current) return;
    const matrix = new THREE.Matrix4();
    transforms.forEach((item, index) => {
      matrix.compose(item.position, item.quaternion, item.scale);
      landmarks.current.setMatrixAt(index, matrix);
      landmarks.current.setColorAt(index, item.color);
    });
    landmarks.current.instanceMatrix.needsUpdate = true;
    if (landmarks.current.instanceColor) landmarks.current.instanceColor.needsUpdate = true;
  }, [transforms]);
  if (count === 0) return null;
  return <instancedMesh ref={landmarks} args={[undefined, undefined, transforms.length]} castShadow receiveShadow>
    {style.className === "ice" ? <octahedronGeometry args={[1, 0]} /> : style.className === "volcanic" ? <coneGeometry args={[1, 1, 7]} /> : <dodecahedronGeometry args={[1, 0]} />}
    <meshStandardMaterial vertexColors roughness={style.className === "ice" ? .28 : .9} metalness={style.className === "ice" ? .08 : .02} emissive={style.className === "volcanic" ? "#391006" : "#000000"} emissiveIntensity={style.className === "volcanic" ? .5 : 0} />
  </instancedMesh>;
}

function PlanetOceanShell({ style }: { style: PlanetSurfaceStyle }) {
  if (style.className !== "ocean" && style.className !== "terran") return null;
  return <mesh renderOrder={1} receiveShadow>
    <sphereGeometry args={[5.735, 96, 64]} />
    <meshPhysicalMaterial color={style.water} transparent opacity={style.className === "ocean" ? .34 : .22} roughness={.16} metalness={0} clearcoat={1} clearcoatRoughness={.12} depthWrite={false} />
  </mesh>;
}

function TerrainPlanet({ style }: { style: PlanetSurfaceStyle }) {
  const surfaceTexture = useProceduralPlanetTexture(style, 8, 640);
  const surfaceTint = useMemo(() => new THREE.Color("#ffffff").lerp(new THREE.Color(style.previewColor), .025), [style.previewColor]);
  const terrain = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(5.8, 5);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    for (let index = 0; index < positions.count; index += 1) {
      const vector = new THREE.Vector3().fromBufferAttribute(positions, index).normalize();
      const continent = seededTerrainSignal(vector, style);
      const radius = terrainRadiusForStyle(vector, style);
      positions.setXYZ(index, vector.x * radius, vector.y * radius, vector.z * radius);
      const facilityLand = facilityLandInfluence(vector);
      if (Math.abs(vector.y) > .82) color.set(style.polar);
      else if (facilityLand > .72 || continent > .78) color.set(style.highland);
      else if (facilityLand > .2 || continent > .42) color.set(style.land);
      else if (continent > .1) color.set(style.coast);
      else color.set(style.water);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }, [style]);
  return <>
    <mesh geometry={terrain} receiveShadow castShadow>
      <meshPhysicalMaterial map={surfaceTexture} bumpMap={surfaceTexture} bumpScale={style.className === "gas" ? .008 : .055} color={surfaceTint} roughness={style.roughness} metalness={style.metalness} clearcoat={style.className === "ocean" ? .34 : .08} clearcoatRoughness={.42} />
    </mesh>
    <PlanetOceanShell style={style} />
    <BiomeSurfaceLandmarks style={style} />
    {style.rings && <group rotation={[Math.PI / 2.35, .18, 0]}>
      <mesh><ringGeometry args={[7.65, 11.02, 160]} /><meshStandardMaterial color={style.atmosphere} roughness={.72} metalness={.08} transparent opacity={.38} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      <mesh><ringGeometry args={[8.7, 9.16, 160]} /><meshBasicMaterial color="#f4e8ce" transparent opacity={.32} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    </group>}
    <CloudShell enabled={style.className === "ocean" || style.className === "terran" || style.className === "ice"} style={style} />
    <AtmosphereShell color={style.atmosphere} />
  </>;
}

function WorldStructures({ state, selected, onSelect }: { state: PlayerState; selected: number; onSelect: (index: number) => void }) {
  const style = useMemo(() => planetSurfaceStyleForSystem(state.planet.position, state.planet.galaxy, state.planet.system), [state.planet.galaxy, state.planet.position, state.planet.system]);
  const buildings = useMemo(() => BUILDINGS.map((building, index) => ({
    ...building,
    index,
    level: Number((state.planet as unknown as Record<string, number>)[building.key] ?? 0),
  })), [state]);
  const buildingLevels = useMemo(() => buildings.map((building) => building.level), [buildings]);
  const activeConstructionIndex = state.planet.buildQueueItem !== 255 && state.planet.buildFinishTs > 0
    ? THREE.MathUtils.clamp(state.planet.buildQueueItem, 0, BUILDINGS.length - 1)
    : -1;
  const powered = state.resources.energyConsumption === 0n || state.resources.energyProduction >= state.resources.energyConsumption;
  const resourceFills = useMemo(() => {
    const fill = (value: bigint, cap: bigint) => cap <= 0n ? 0 : THREE.MathUtils.clamp(Number((value * 1000n) / cap) / 1000, 0, 1);
    const values = [
      fill(state.resources.metal, state.resources.metalCap),
      fill(state.resources.crystal, state.resources.crystalCap),
      fill(state.resources.deuterium, state.resources.deuteriumCap),
    ];
    return new Map<number, number>([[0, values[0]], [1, values[1]], [2, values[2]], [8, values[0]], [9, values[1]], [10, values[2]]]);
  }, [state.resources.crystal, state.resources.crystalCap, state.resources.deuterium, state.resources.deuteriumCap, state.resources.metal, state.resources.metalCap]);
  return <>
    <CinematicPlanetEnvironment />
    <OrbitalLightSource color={style.atmosphere} />
    <CinematicReflectionRig accent={style.atmosphere} />
    <ambientLight intensity={.13} />
    <hemisphereLight color="#8fcff0" groundColor="#02050b" intensity={.46} />
    <directionalLight position={[-10, 8, 14]} intensity={5.4} color="#d9f5ff" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-near={1} shadow-camera-far={42} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-bias={-.00025} />
    <pointLight position={[7, -4, 9]} intensity={42} color={style.atmosphere} distance={26} decay={2} />
    <TerrainPlanet style={style} />
    <BiomeAtmosphereEffects style={style} />
    <PlanetaryDefenseField smallDome={state.planet.smallShieldDome} largeDome={state.planet.largeShieldDome} color={style.atmosphere} />
    <PlanetaryDefenseNetwork state={state} powered={powered} />
    <SurfaceActivity state={state} />
    <OrbitalPresence state={state} style={style} />
    <InfrastructureNetwork levels={buildingLevels} powered={powered} />
    <CivilizationLights levels={buildingLevels} powered={powered} />
    {buildings.filter((building) => building.key !== "missileSilo").map((building) => {
      return <Facility key={building.key} index={building.index} level={building.level} name={building.name} selected={building.index === selected} constructing={building.index === activeConstructionIndex} powered={powered} resourceFill={resourceFills.get(building.index)} onSelect={() => onSelect(building.index)} />;
    })}
  </>;
}

function governanceActionLabel(action: number): string {
  return action === 0 ? "CLAIM SYSTEM" : action === 1 ? "FUND UPKEEP" : action === 2 ? "SET SPECIALIZATION" : "UNKNOWN ACTION";
}

function governanceSpecializationLabel(specialization: number): string {
  return ["NONE", "INDUSTRIAL", "RESEARCH", "MILITARY"][specialization] ?? "UNKNOWN";
}

function governanceMarketTime(closesAt: number, nowTs: number): string {
  const seconds = Math.max(0, closesAt - nowTs);
  if (seconds === 0) return "CLOSED";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days > 0 ? `${days}D ${hours}H` : hours > 0 ? `${hours}H ${minutes}M` : `${minutes}M`;
}

function GovernanceResourceCost({ icon, label, required, available }: { icon: "metal" | "crystal" | "deuterium"; label: string; required: bigint; available: bigint }) {
  const met = available >= required;
  return <span className={`pw-governance-resource ${icon} ${met ? "met" : "missing"}`}>
    {icon === "metal" ? <Pickaxe /> : icon === "crystal" ? <Gem /> : <FlaskConical />}
    <em>{label}</em>
    <b>{required.toLocaleString()}</b>
    <small>{available.toLocaleString()} available</small>
  </span>;
}

function AllianceDecisionMarketCard({ decision, dao, treasury, nowTs }: { decision: AllianceDecisionAccount; dao: string; treasury: AllianceTreasuryStateAccount | null; nowTs: number }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();
  const [market, setMarket] = useState<DecisionMarketSnapshot | null>(null);
  const [marketError, setMarketError] = useState("");
  const [tradeMode, setTradeMode] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("1");
  const [slippage, setSlippage] = useState("2");
  const [tradeBusy, setTradeBusy] = useState<DecisionMarketSide | null>(null);
  const [tradeStatus, setTradeStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchDecisionMarket(connection, dao, decision.externalProposal, publicKey);
        if (!cancelled) {
          setMarket(next);
          setMarketError("");
        }
      } catch (error) {
        if (!cancelled) {
          setMarket(null);
          setMarketError(error instanceof Error ? error.message : "Unable to read this market.");
        }
      }
    };
    void load();
    const timer = !decision.executed && decision.expiresAt > Math.floor(Date.now() / 1000)
      ? window.setInterval(() => {
          if (decision.expiresAt <= Math.floor(Date.now() / 1000)) {
            window.clearInterval(timer);
          }
          void load();
        }, 15_000)
      : 0;
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [connection, dao, decision.executed, decision.expiresAt, decision.externalProposal, publicKey?.toBase58()]);

  const slippageBps = Math.round(Number(slippage) * 100);
  const estimate = (side: DecisionMarketSide) => {
    if (!market || !Number.isFinite(slippageBps)) return null;
    try {
      return tradeMode === "BUY" ? estimateDecisionMarketBuyMinimum(market, side, amount, slippageBps) : estimateDecisionMarketSellMinimum(market, side, amount, slippageBps);
    } catch {
      return null;
    }
  };
  const passEstimate = estimate("PASS");
  const failEstimate = estimate("FAIL");
  const tradingOpen = market?.state === "PENDING" && market.closesAt > nowTs;
  const hasMarketPrices = Boolean(market && market.passBaseReserves > 0n && market.failBaseReserves > 0n);
  const displayState = decision.executed
    ? "EXECUTED"
    : market
      ? market.state === "PENDING" && market.closesAt <= nowTs ? "MARKET CLOSED" : market.state
      : marketError ? "READ FAILED" : "LOADING";
  const statusClass = decision.executed || market?.state === "PASSED" ? "executed" : market?.state === "FAILED" || displayState === "READ FAILED" ? "expired" : "pending";
  const cost = SYSTEM_SOVEREIGNTY_ACTION_COSTS[decision.action as 0 | 1 | 2];
  const trade = async (side: DecisionMarketSide) => {
    if (!anchorWallet || !market || !tradingOpen) return;
    setTradeBusy(side);
    setTradeStatus(`Preparing ${tradeMode.toLowerCase()} ${side.toLowerCase()} trade...`);
    try {
      const executeTrade = tradeMode === "BUY" ? buyDecisionMarketSide : sellDecisionMarketSide;
      const result = await executeTrade({
        connection,
        wallet: anchorWallet as any,
        sendTransaction,
        daoAddress: dao,
        proposalAddress: decision.externalProposal,
        side,
        amount,
        slippageBps,
      });
      setTradeStatus(`${tradeMode} ${side} confirmed · minimum ${result.minimumOutput.toFixed(4)} conditional ${tradeMode === "BUY" ? "AM" : "USDC"}`);
      setMarket(await fetchDecisionMarket(connection, dao, decision.externalProposal, publicKey));
    } catch (error) {
      setTradeStatus(error instanceof Error ? error.message : "Trade failed.");
    } finally {
      setTradeBusy(null);
    }
  };

  return <article className="pw-governance-market-card">
    <header>
      <div><span>#{decision.id.toString()} · {governanceActionLabel(decision.action)}</span><h4>G{decision.galaxy}:S{decision.system}{decision.action !== 1 ? ` · ${governanceSpecializationLabel(decision.specialization)}` : ""}</h4><p>Proposed by {`${decision.proposer.slice(0, 5)}...${decision.proposer.slice(-5)}`}</p></div>
      <div><b className={statusClass}>{displayState}</b>{market && <em>{governanceMarketTime(market.closesAt, nowTs)}</em>}</div>
    </header>
    {cost && <section className="pw-governance-costs" aria-label="Treasury cost if proposal passes">
      <div><span>EXECUTION COST</span><b>{treasury && treasury.metal >= cost.metal && treasury.crystal >= cost.crystal && treasury.deuterium >= cost.deuterium ? "TREASURY READY" : "RESOURCES REQUIRED"}</b></div>
      <div>
        <GovernanceResourceCost icon="metal" label="Metal" required={cost.metal} available={treasury?.metal ?? 0n} />
        <GovernanceResourceCost icon="crystal" label="Crystal" required={cost.crystal} available={treasury?.crystal ?? 0n} />
        <GovernanceResourceCost icon="deuterium" label="Deuterium" required={cost.deuterium} available={treasury?.deuterium ?? 0n} />
      </div>
    </section>}
    {market ? <section className="pw-governance-trade">
      {hasMarketPrices ? <div className="pw-governance-market-prices">
        <div className="pass"><span>PASS PRICE</span><b>${market.passPrice.toFixed(4)}</b></div>
        <div className="fail"><span>FAIL PRICE</span><b>${market.failPrice.toFixed(4)}</b></div>
        <div><span>TRADING WINDOW</span><b>{governanceMarketTime(market.closesAt, nowTs)}</b></div>
      </div> : <div className={`pw-governance-resolution ${market.state.toLowerCase()}`}><span>FINAL MARKET RESULT</span><b>{market.state}</b></div>}
      <div className="pw-governance-balances">
        <span><img src={usdcCoin} alt="" />{market.walletUsdc.toFixed(2)} USDC</span>
        <span><Zap />{market.walletAntimatter.toFixed(2)} AM</span>
        <span className="pass">PASS {market.walletPassAntimatter.toFixed(2)} AM · {market.walletPassUsdc.toFixed(2)} USDC</span>
        <span className="fail">FAIL {market.walletFailAntimatter.toFixed(2)} AM · {market.walletFailUsdc.toFixed(2)} USDC</span>
      </div>
      {tradingOpen ? anchorWallet ? <div className="pw-governance-order">
        <div className="pw-governance-trade-mode" role="group" aria-label="Trade direction"><button type="button" className={tradeMode === "BUY" ? "active" : ""} onClick={() => setTradeMode("BUY")} disabled={!!tradeBusy}>BUY</button><button type="button" className={tradeMode === "SELL" ? "active" : ""} onClick={() => setTradeMode("SELL")} disabled={!!tradeBusy}>SELL</button></div>
        <label><span>{tradeMode === "BUY" ? "SPEND DEVNET USDC" : "SELL CONDITIONAL AM"}</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!!tradeBusy} /></label>
        <label><span>MAX SLIPPAGE %</span><input type="number" min="0.1" max="10" step="0.1" inputMode="decimal" value={slippage} onChange={(event) => setSlippage(event.target.value)} disabled={!!tradeBusy} /></label>
        <div className="pw-governance-trade-actions">
          <button className="pass" disabled={!!tradeBusy || passEstimate === null} onClick={() => void trade("PASS")}><b>{tradeBusy === "PASS" ? "CONFIRMING..." : `${tradeMode} PASS`}</b><small>{passEstimate === null ? "CHECK AMOUNT" : `MIN ${passEstimate.toFixed(4)} ${tradeMode === "BUY" ? "AM" : "USDC"}`}</small></button>
          <button className="fail" disabled={!!tradeBusy || failEstimate === null} onClick={() => void trade("FAIL")}><b>{tradeBusy === "FAIL" ? "CONFIRMING..." : `${tradeMode} FAIL`}</b><small>{failEstimate === null ? "CHECK AMOUNT" : `MIN ${failEstimate.toFixed(4)} ${tradeMode === "BUY" ? "AM" : "USDC"}`}</small></button>
        </div>
      </div> : <div className="pw-governance-connect"><WalletConnectControl disconnectedLabel="ENTER WITH PASSKEY TO TRADE" /><small>Trading is permissionless. Alliance membership controls official game actions, not market access.</small></div> : <div className="pw-governance-closed">Trading is closed. The MetaDAO proposal must be finalized before a passed action can execute.</div>}
      {tradeStatus && <p className={`pw-governance-trade-status${tradeStatus.includes("confirmed") ? " success" : ""}`}>{tradeStatus}</p>}
    </section> : <section className="pw-governance-market-error"><b>{marketError ? "MARKET READ FAILED" : "READING LIVE MARKET"}</b>{marketError && <p>{marketError}</p>}</section>}
    <footer><p>PASS and FAIL positions can be bought or sold while trading is open. Sell proceeds remain conditional USDC until MetaDAO finalizes the proposal.</p><a href={`https://explorer.solana.com/address/${decision.externalProposal}?cluster=${EXPLORER_CLUSTER}`} target="_blank" rel="noreferrer">VERIFY ON-CHAIN</a></footer>
  </article>;
}

type PlanetWalletSummary = {
  label: string;
  worlds: number;
  shieldActive: boolean;
  vaultStatus: string;
  vaultSol: string;
  antimatter: string;
  usdc: string;
};

function compactHudResource(value: bigint | number): string {
  const numeric = typeof value === "bigint" ? Number(value) : value;
  const absolute = Math.abs(numeric);
  if (absolute >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (absolute >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (absolute >= 10_000) return `${(numeric / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return Math.trunc(numeric).toLocaleString();
}

export type PlanetWorldModal = "buildingSelect" | "building" | "research" | "ships" | "defense" | "missions" | "quests" | "store" | "alliance" | "market" | "activity";

export type PlanetWorldCommandRequest = {
  id: number;
  modal: PlanetWorldModal;
  mission?: {
    galaxy: number;
    system: number;
    position: number;
    missionType: 1 | 2 | 5 | 6;
  };
};

export default function PlanetWorld({ state, busy, run, onExit, onOpenWallet, wallet, game, market, worlds, ownedWorlds, activity, marketControls, vaultControls, allianceBalances, commandRequest, onSceneReady }: { state: PlayerState; busy: boolean; run: (label: string, action: (client: GameClient, entity: PublicKey) => Promise<unknown>) => Promise<void>; onExit: () => void; onOpenWallet?: () => void; wallet: PlanetWalletSummary | null; game: GameClient | null; market: MarketClient | null; worlds: Array<{ entity: string; name: string }>; ownedWorlds: PlayerState[]; activity: { battleReports: BattleResolvedEventRecord[]; spyReports: EspionageReportEventRecord[]; loading: boolean; refresh: () => Promise<void> }; marketControls: { onTxStart: (label: string) => void; onTxEnd: (error?: string) => void }; vaultControls: { depositAmount: string; withdrawAmount: string; onDepositAmountChange: (value: string) => void; onWithdrawAmountChange: (value: string) => void; onDeposit: () => Promise<void>; onWithdraw: () => Promise<void>; busy: boolean }; allianceBalances: { usdc: bigint; antimatter: bigint }; commandRequest?: PlanetWorldCommandRequest | null; onSceneReady?: () => void }) {
  const { publicKey: connectedPublicKey, connect, disconnect } = useWallet();
  const [selected, setSelected] = useState(0);
  const [cameraReset, setCameraReset] = useState(0);
  const [inspectionActive, setInspectionActive] = useState(false);
  const [modal, setModal] = useState<PlanetWorldModal | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [productionQuantityValid, setProductionQuantityValid] = useState(true);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const commandLock = useRef(false);
  const [commandError, setCommandError] = useState('');
  const trackCommand = async (key: string, action: () => Promise<void>) => {
    if (busy || commandLock.current) return;
    commandLock.current = true; setPendingCommand(key); setCommandError('');
    try { await action(); }
    catch { setCommandError('This workspace could not finish updating. Please retry.'); }
    finally { commandLock.current = false; setPendingCommand(null); }
  };
  const [missionType, setMissionType] = useState(2);
  const [missionTarget, setMissionTarget] = useState({ galaxy: state.planet.galaxy, system: state.planet.system, position: 1, speed: 100, colonyName: "Colony" });
  const [missionShips, setMissionShips] = useState<Record<string, number>>({});
  const [missionCargo, setMissionCargo] = useState({ metal: "", crystal: "", deuterium: "" });
  const [missionError, setMissionError] = useState("");
  const [missionChecking, setMissionChecking] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [operationMenuOpen, setOperationMenuOpen] = useState(false);
  const [advancedFacilitiesOpen, setAdvancedFacilitiesOpen] = useState(false);
  const [researchCatalogOpen, setResearchCatalogOpen] = useState(false);
  const [questState, setQuestState] = useState<QuestStateAccount | null>(null);
  const [questProgress, setQuestProgress] = useState<QuestProgressStateAccount | null>(null);
  const [questTargets, setQuestTargets] = useState<QuestRewardTargetStateAccount | null>(null);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [collapsedQuestGroups, setCollapsedQuestGroups] = useState<Record<QuestDefinition["group"], boolean>>({ Tutorial: true, Daily: true, Weekly: true, Monthly: true });
  const [storeConfig, setStoreConfig] = useState<StoreConfigState | null>(null);
  const [storePurchaseState, setStorePurchaseState] = useState<StorePurchaseStateAccount | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [reviewPack, setReviewPack] = useState<StorePack | null>(null);
  const storeReadRevision = useRef(0);
  const storeClient = useRef(game);
  storeClient.current = game;
  const [collapsedStoreGroups, setCollapsedStoreGroups] = useState<Record<"Daily" | "Weekly" | "Monthly", boolean>>({ Daily: false, Weekly: true, Monthly: true });
  const [alliance, setAlliance] = useState<AllianceStateAccount | null>(null);
  const [allianceMembership, setAllianceMembership] = useState<AllianceMembershipAccount | null>(null);
  const [allianceTreasury, setAllianceTreasury] = useState<AllianceTreasuryStateAccount | null>(null);
  const [allianceLoading, setAllianceLoading] = useState(false);
  const [allianceDirectory, setAllianceDirectory] = useState<AllianceStateAccount[]>([]);
  const [pendingAllianceDirectory, setPendingAllianceDirectory] = useState<AllianceStateAccount[]>([]);
  const [allianceJoinRequests, setAllianceJoinRequests] = useState<AllianceJoinRequestAccount[]>([]);
  const [allianceMembers, setAllianceMembers] = useState<AllianceMembershipAccount[]>([]);
  const [allianceGovernance, setAllianceGovernance] = useState<AllianceGovernanceConfigAccount | null>(null);
  const [gamesolGovernance, setGamesolGovernance] = useState<GamesolGovernanceConfigAccount | null>(null);
  const [allianceDecisions, setAllianceDecisions] = useState<AllianceDecisionAccount[]>([]);
  const [alliancePanel, setAlliancePanel] = useState<"overview" | "members" | "missions" | "governance">("overview");
  const [allianceOnboardingMode, setAllianceOnboardingMode] = useState<"discover" | "create">("discover");
  const [allianceConfirmation, setAllianceConfirmation] = useState<{
    title: string;
    detail: string;
    confirmLabel: string;
    operationLabel: string;
    action: (client: GameClient) => Promise<unknown>;
  } | null>(null);
  const [decisionProposal, setDecisionProposal] = useState("");
  const [decisionAction, setDecisionAction] = useState(0);
  const [decisionSpecialization, setDecisionSpecialization] = useState(1);
  const [decisionVulnerabilityHour, setDecisionVulnerabilityHour] = useState(12);
  const [decisionError, setDecisionError] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const modalPanelRef = useRef<HTMLElement>(null);
  const modalOpenerRef = useRef<HTMLElement | null>(null);
  const walletTriggerRef = useRef<HTMLButtonElement>(null);
  const walletCloseRef = useRef<HTMLButtonElement>(null);
  const walletPanelRef = useRef<HTMLElement>(null);
  const operationMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const operationMenuCloseRef = useRef<HTMLButtonElement>(null);
  const operationMenuPanelRef = useRef<HTMLElement>(null);
  const operationMenuLaunchingRef = useRef(false);
  const allianceConfirmationRef = useRef<HTMLElement>(null);
  const allianceConfirmationCancelRef = useRef<HTMLButtonElement>(null);
  const [allianceName, setAllianceName] = useState("");
  const [allianceTag, setAllianceTag] = useState("");
  const [allianceImageUrl, setAllianceImageUrl] = useState("");
  const [queueBaselines, setQueueBaselines] = useState<Record<string, number>>({});
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  const commandModalOpen = modal !== null;
  const allianceConfirmationOpen = allianceConfirmation !== null;
  const openPlanetCommand = (nextModal: PlanetWorldModal, opener: HTMLElement | null = null) => {
    if (nextModal === 'store' && game) setStoreLoading(true);
    modalOpenerRef.current = opener;
    setInspectionActive(false);
    setModal(nextModal);
  };
  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!commandRequest) return;
    modalOpenerRef.current = null;
    setModal(commandRequest.modal);
    if (!commandRequest.mission) return;
    setMissionType(commandRequest.mission.missionType);
    setMissionTarget((current) => ({
      ...current,
      galaxy: commandRequest.mission!.galaxy,
      system: commandRequest.mission!.system,
      position: commandRequest.mission!.position,
      colonyName: commandRequest.mission!.missionType === 5 ? `Colony ${commandRequest.mission!.position}` : current.colonyName,
    }));
    setMissionShips({});
    setMissionCargo({ metal: "", crystal: "", deuterium: "" });
    setMissionError("");
  }, [commandRequest?.id]);
  useEffect(() => {
    if (!commandModalOpen) return;
    const opener = modalOpenerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => modalCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector(".pw-confirm-dialog")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setModal(null);
        return;
      }
      if (event.key !== "Tab") return;
      const panel = modalPanelRef.current;
      if (!panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((control) => control.getClientRects().length > 0);
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      modalOpenerRef.current = null;
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, [commandModalOpen]);
  useEffect(() => {
    if (!operationMenuOpen) return;
    operationMenuLaunchingRef.current = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => operationMenuCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOperationMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const panel = operationMenuPanelRef.current;
      if (!panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (!operationMenuLaunchingRef.current) window.requestAnimationFrame(() => operationMenuTriggerRef.current?.focus());
    };
  }, [operationMenuOpen]);
  useEffect(() => {
    if (!allianceConfirmationOpen) return;
    const focusFrame = window.requestAnimationFrame(() => allianceConfirmationCancelRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAllianceConfirmation(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = allianceConfirmationRef.current;
      if (!dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => modalCloseRef.current?.focus());
    };
  }, [allianceConfirmationOpen]);
  useEffect(() => {
    if (!walletOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => walletCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setWalletOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const panel = walletPanelRef.current;
      if (!panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((control) => control.getClientRects().length > 0);
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => walletTriggerRef.current?.focus());
    };
  }, [walletOpen]);
  useEffect(() => {
    const activeQueues = [
      ["Construction", state.planet.buildQueueItem, state.planet.buildFinishTs],
      ["Research", state.research.queueItem, state.research.researchFinishTs],
      ["Shipyard", state.planet.shipBuildItem, state.planet.shipBuildFinishTs],
      ["Defense", state.planet.defenseBuildItem, state.planet.defenseBuildFinishTs],
    ] as const;
    setQueueBaselines((current) => {
      const next: Record<string, number> = {};
      for (const [label, item, finishAt] of activeQueues) {
        if (item === 255 || finishAt <= 0) continue;
        const key = `${label}:${finishAt}`;
        next[key] = current[key] ?? Math.max(1, finishAt - Math.floor(Date.now() / 1000));
      }
      return next;
    });
  }, [state.planet.buildQueueItem, state.planet.buildFinishTs, state.research.queueItem, state.research.researchFinishTs, state.planet.shipBuildItem, state.planet.shipBuildFinishTs, state.planet.defenseBuildItem, state.planet.defenseBuildFinishTs]);
  useEffect(() => {
    market?.setActivePlanet(new PublicKey(state.planetPda));
  }, [market, state.planetPda]);
  const refreshQuestLedger = async () => {
    if (!game) return;
    setQuestsLoading(true);
    try {
      const [nextState, nextProgress, nextTargets] = await Promise.all([
        game.getQuestState(),
        game.getQuestProgress(),
        game.getQuestRewardTargets(),
      ]);
      setQuestState(nextState);
      setQuestProgress(nextProgress);
      setQuestTargets(nextTargets);
    } finally {
      setQuestsLoading(false);
    }
  };
  useEffect(() => {
    if (modal === "quests") void refreshQuestLedger();
  }, [modal, game]);
  const refreshStore = async () => {
    if (!game) return;
    const request = ++storeReadRevision.current;
    setStoreLoading(true); setStoreError(''); setStoreConfig(null); setStorePurchaseState(null);
    try {
      const [nextConfig, nextPurchaseState] = await Promise.all([game.getStoreConfig(), game.getStorePurchaseState()]);
      if (request !== storeReadRevision.current || game !== storeClient.current) return;
      setStoreConfig(nextConfig);
      setStorePurchaseState(nextPurchaseState);
    } catch {
      if (request === storeReadRevision.current) setStoreError('The store could not be loaded. Please retry.');
    } finally {
      if (request === storeReadRevision.current) setStoreLoading(false);
    }
  };
  useEffect(() => {
    setReviewPack(null);
    if (modal === "store") void refreshStore();
    return () => { ++storeReadRevision.current; };
  }, [modal, game]);
  useEffect(() => { setReviewPack(null); }, [state.entityPda]);
  const refreshAlliance = async () => {
    if (!game) return;
    setAllianceLoading(true);
    try {
      const rootGovernance = await game.getGamesolGovernanceConfig();
      setGamesolGovernance(rootGovernance);
      const membership = await game.getAllianceMembership();
      setAllianceMembership(membership);
      if (!membership || membership.role === 0) {
        setAlliance(null);
        setAllianceTreasury(null);
        setAllianceJoinRequests([]);
        setAllianceMembers([]);
        setAllianceGovernance(null);
        setAllianceDecisions([]);
        const directory = await game.fetchAlliances();
        const requestStates = await Promise.all(directory.map(async (item) => ({
          item,
          request: await game.getAllianceJoinRequest(new PublicKey(item.publicKey)),
        })));
        setPendingAllianceDirectory(requestStates.filter(({ request }) => request !== null).map(({ item }) => item));
        setAllianceDirectory(requestStates.filter(({ request }) => request === null).map(({ item }) => item));
        return;
      }
      const loadedAlliance = await game.getAlliance(new PublicKey(membership.alliance));
      setAlliance(loadedAlliance);
      setAllianceDirectory([]);
      setPendingAllianceDirectory([]);
      if (!loadedAlliance) {
        setAllianceTreasury(null);
        setAllianceJoinRequests([]);
        setAllianceMembers([]);
        setAllianceGovernance(null);
        setAllianceDecisions([]);
        return;
      }
      const allianceKey = new PublicKey(loadedAlliance.publicKey);
      const [treasury, members, requests, governance, decisions] = await Promise.all([
        game.getAllianceTreasury(allianceKey),
        game.fetchAllianceMembers(allianceKey),
        membership.role === 2 ? game.fetchAllianceJoinRequests(allianceKey) : Promise.resolve([]),
        game.getAllianceGovernanceConfig(allianceKey),
        game.fetchAllianceDecisions(allianceKey),
      ]);
      setAllianceTreasury(treasury);
      setAllianceMembers(members);
      setAllianceJoinRequests(requests);
      setAllianceGovernance(governance);
      setAllianceDecisions(decisions);
    } finally {
      setAllianceLoading(false);
    }
  };
  useEffect(() => {
    if (modal === "alliance") void refreshAlliance();
  }, [modal, game]);
  const building = BUILDINGS[selected];
  const level = Number((state.planet as unknown as Record<string, number>)[building.key] ?? 0);
  const queueBusy = state.planet.buildQueueItem !== 255;
  const researchBusy = state.research.queueItem !== 255;
  const shipyardBusy = state.planet.shipBuildItem !== 255 || state.planet.defenseBuildItem !== 255;
  const resource = state.resources;
  const storageCap = building.key === "metalStorage"
    ? { label: "Metal", current: resource.metalCap }
    : building.key === "crystalStorage"
      ? { label: "Crystal", current: resource.crystalCap }
      : building.key === "deuteriumTank"
        ? { label: "Deuterium", current: resource.deuteriumCap }
        : null;
  const energyPercent = energyEfficiency(resource);
  const energyTone = energyPercent <= 25 ? "critical" : energyPercent < 100 ? "warning" : "good";
  const hasAllianceUsdc = allianceBalances.usdc >= ALLIANCE_CREATE_USDC_COST;
  const hasAllianceAntimatter = allianceBalances.antimatter >= ALLIANCE_CREATE_ANTIMATTER_COST;
  const normalizedAllianceTag = allianceTag.trim().toUpperCase();
  const canCreateAlliance = allianceName.trim().length >= 2 && normalizedAllianceTag.length === 3 && hasAllianceUsdc && hasAllianceAntimatter;
  const allianceGovernanceMatchesRoot = !GAMESOL_GOVERNANCE_ROOT_ENABLED || Boolean(
    gamesolGovernance?.enabled && allianceGovernance?.enabled &&
    gamesolGovernance.antimatterMint === allianceGovernance.antimatterMint &&
    gamesolGovernance.dao === allianceGovernance.dao &&
    gamesolGovernance.governanceExecutor === allianceGovernance.governanceExecutor
  );
  const selectedDecisionCost = SYSTEM_SOVEREIGNTY_ACTION_COSTS[decisionAction as 0 | 1 | 2];
  const selectedDecisionFunded = Boolean(
    allianceTreasury && selectedDecisionCost &&
    allianceTreasury.metal >= selectedDecisionCost.metal &&
    allianceTreasury.crystal >= selectedDecisionCost.crystal &&
    allianceTreasury.deuterium >= selectedDecisionCost.deuterium
  );
  const [metalCost, crystalCost, deuteriumCost] = upgradeCost(building.idx, level);
  const canAfford = (metal: number, crystal: number, deuterium: number) => resource.metal >= BigInt(metal) && resource.crystal >= BigInt(crystal) && resource.deuterium >= BigInt(deuterium);
  const requirementValue = (key: string) => Number((state.planet as any)[key] ?? (state.research as any)[key] ?? 0);
  const requirementRows = (requirements: Array<[string, string, number]>) => requirements.map(([label, key, required]) => ({ label, current: requirementValue(key), required }));
  const buildingRequirements = (key: string) => (BUILDING_REQUIREMENTS[key] ?? []).map((requirement) => ({ label: requirement.key.replace(/([A-Z])/g, " $1"), current: requirementValue(requirement.key), required: requirement.level }));
  const requirementsMet = (requirements: RequirementRow[]) => requirements.every((requirement) => requirement.current >= requirement.required);
  const missingRequirementLabel = (requirements: RequirementRow[]) => requirements.filter((requirement) => requirement.current < requirement.required).map((requirement) => `${requirement.label} ${requirement.current}/${requirement.required}`).join(" · ");
  const buildingRequirementsForSelected = buildingRequirements(building.key);
  const buildingAffordable = canAfford(metalCost, crystalCost, deuteriumCost);
  const buildingPrerequisitesReady = requirementsMet(buildingRequirementsForSelected);
  const buildingCommandReady = !queueBusy && buildingAffordable && buildingPrerequisitesReady;
  const [researchLabMetalCost, researchLabCrystalCost, researchLabDeuteriumCost] = upgradeCost(11, state.planet.researchLab);
  const [shipyardMetalCost, shipyardCrystalCost, shipyardDeuteriumCost] = upgradeCost(7, state.planet.shipyard);
  const researchLabAffordable = canAfford(researchLabMetalCost, researchLabCrystalCost, researchLabDeuteriumCost);
  const shipyardAffordable = canAfford(shipyardMetalCost, shipyardCrystalCost, shipyardDeuteriumCost);
  const shipyardRequirements = buildingRequirements("shipyard");
  const shipyardRequirementsMet = requirementsMet(shipyardRequirements);
  const shipyardUpgrading = state.planet.buildQueueItem === 7;
  const researchLabUpgrading = state.planet.buildQueueItem === 11;
  const shipyardUpgradeBlocked = shipyardBusy;
  const researchLabUpgradeBlocked = researchBusy;
  const researchRequirementKeys: Record<string, string> = { "Energy Technology": "energyTech", "Impulse Drive": "impulseDrive", "Computer Technology": "computerTech" };
  const researchOptions = RESEARCH.map((tech, index) => {
    const techLevel = Number((state.research as any)[tech.key] ?? 0);
    const multiplier = 2 ** techLevel;
    const cost = [tech.cost[0] * multiplier, tech.cost[1] * multiplier, tech.cost[2] * multiplier] as const;
    const requirements = (RESEARCH_LAB_REQUIREMENTS[tech.key] ?? []).map((requirement) => ({ ...requirement, current: requirement.label === "Research Lab" ? state.planet.researchLab : requirementValue(researchRequirementKeys[requirement.label] ?? tech.key) }));
    const prerequisitesReady = requirementsMet(requirements);
    const resourcesReady = canAfford(...cost);
    return { tech, index, techLevel, cost, requirements, prerequisitesReady, resourcesReady, ready: prerequisitesReady && resourcesReady };
  });
  const researchReadyCount = researchOptions.filter((option) => option.ready).length;
  const researchLockedCount = researchOptions.filter((option) => !option.prerequisitesReady).length;
  const researchCatalogVisible = state.planet.researchLab > 0 || researchReadyCount > 0 || researchCatalogOpen;
  const shipOptions = SHIPS.map((ship) => {
    const cost = [ship.cost.m * quantity, ship.cost.c * quantity, ship.cost.d * quantity] as const;
    const requirements = requirementRows(SHIP_REQUIREMENTS[ship.key] ?? []);
    const prerequisitesReady = requirementsMet(requirements);
    const resourcesReady = canAfford(...cost);
    return { ship, cost, requirements, prerequisitesReady, resourcesReady, ready: prerequisitesReady && resourcesReady };
  });
  const shipReadyCount = shipOptions.filter((option) => option.ready).length;
  const ownedVesselCount = SHIPS.reduce((total, ship) => total + Number((state.fleet as any)[ship.key] ?? 0), 0);
  const defenseOptions = DEFENSE.map((item, index) => {
    const cost = [item.cost[0] * quantity, item.cost[1] * quantity, item.cost[2] * quantity] as const;
    const requirements = requirementRows(DEFENSE_REQUIREMENTS[item.key] ?? []);
    const prerequisitesReady = requirementsMet(requirements);
    const resourcesReady = canAfford(...cost);
    const online = Number((state.planet as any)[item.key] ?? 0);
    const unique = item.key === "smallShieldDome" || item.key === "largeShieldDome";
    const uniqueAlreadyBuilt = unique && online > 0;
    return { item, index, cost, requirements, prerequisitesReady, resourcesReady, online, unique, uniqueAlreadyBuilt, ready: prerequisitesReady && resourcesReady && !uniqueAlreadyBuilt };
  });
  const defenseReadyCount = defenseOptions.filter((option) => option.ready).length;
  const defenseUnitCount = defenseOptions.reduce((total, option) => total + option.online, 0);
  const activeShieldCount = defenseOptions.filter((option) => option.uniqueAlreadyBuilt).length;
  const queues = [
    { label: "Construction", active: state.planet.buildQueueItem !== 255, item: BUILDINGS[state.planet.buildQueueItem]?.name ?? "Facility upgrade", artKey: BUILDINGS[state.planet.buildQueueItem]?.key, finishAt: state.planet.buildFinishTs, finish: (client: GameClient, entity: PublicKey) => client.finishBuild(entity), accelerate: (client: GameClient, entity: PublicKey) => client.accelerateBuildWithAntimatter(entity) },
    { label: "Research", active: state.research.queueItem !== 255, item: RESEARCH[state.research.queueItem]?.name ?? "Research project", artKey: RESEARCH[state.research.queueItem]?.key, finishAt: state.research.researchFinishTs, finish: (client: GameClient, entity: PublicKey) => client.finishResearch(entity), accelerate: (client: GameClient, entity: PublicKey) => client.accelerateResearchWithAntimatter(entity) },
    { label: "Shipyard", active: state.planet.shipBuildItem !== 255, item: `${SHIPS[state.planet.shipBuildItem]?.name ?? "Ship build"} x${state.planet.shipBuildQty}`, artKey: SHIPS[state.planet.shipBuildItem]?.key, finishAt: state.planet.shipBuildFinishTs, finish: (client: GameClient, entity: PublicKey) => client.finishShipBuild(entity), accelerate: (client: GameClient, entity: PublicKey) => client.accelerateShipBuildWithAntimatter(entity) },
    { label: "Defense", active: state.planet.defenseBuildItem !== 255, item: `${DEFENSE[state.planet.defenseBuildItem]?.name ?? "Defense build"} x${state.planet.defenseBuildQty}`, artKey: DEFENSE[state.planet.defenseBuildItem]?.key, finishAt: state.planet.defenseBuildFinishTs, finish: (client: GameClient, entity: PublicKey) => client.finishDefenseBuild(entity), accelerate: (client: GameClient, entity: PublicKey) => client.accelerateDefenseBuildWithAntimatter(entity) },
  ];
  const activeQueues = queues.filter((queue) => queue.active);
  const coreFacilityIndices = [0, 1, 2, 3];
  const extractionFacilityIndices = [0, 1, 2];
  const coreExtractionLevel = Math.min(state.planet.metalMine, state.planet.crystalMine, state.planet.deuteriumSynthesizer);
  const growthFacilityIndex = energyPercent < 100
    ? 3
    : coreExtractionLevel < 2
      ? extractionFacilityIndices.reduce((lowest, index) => {
          const lowestLevel = Number((state.planet as unknown as Record<string, number>)[BUILDINGS[lowest].key] ?? 0);
          const candidateLevel = Number((state.planet as unknown as Record<string, number>)[BUILDINGS[index].key] ?? 0);
          return candidateLevel < lowestLevel ? index : lowest;
        }, extractionFacilityIndices[0])
      : state.planet.shipyard < 1
        ? state.planet.roboticsFactory < 2 ? 5 : 7
        : coreFacilityIndices.reduce((lowest, index) => {
        const lowestLevel = Number((state.planet as unknown as Record<string, number>)[BUILDINGS[lowest].key] ?? 0);
        const candidateLevel = Number((state.planet as unknown as Record<string, number>)[BUILDINGS[index].key] ?? 0);
        return candidateLevel < lowestLevel ? index : lowest;
      }, coreFacilityIndices[0]);
  const growthFacility = BUILDINGS[growthFacilityIndex];
  const growthFacilityLevel = Number((state.planet as unknown as Record<string, number>)[growthFacility.key] ?? 0);
  const growthFacilityCost = upgradeCost(growthFacility.idx, growthFacilityLevel);
  const growthFacilityReady = canAfford(...growthFacilityCost) && requirementsMet(buildingRequirements(growthFacility.key));
  const growthBuildSeconds = buildTimeSecs(growthFacility.idx, growthFacilityLevel + 1, state.planet.roboticsFactory);
  const expansionMilestones = [
    { label: "POWER STABLE", complete: energyPercent >= 100 },
    { label: "EXTRACTION L2", complete: coreExtractionLevel >= 2 },
    { label: "SHIPYARD ONLINE", complete: state.planet.shipyard >= 1 },
  ];
  const completedExpansionMilestones = expansionMilestones.filter((milestone) => milestone.complete).length;
  const earlyWorldGuidance = completedExpansionMilestones < expansionMilestones.length;
  const showGrowthObjective = activeQueues.length === 0 && !inspectionActive && modal === null;
  const constructedFacilityIndices = BUILDINGS.flatMap((candidate, index) => candidate.key !== "missileSilo" && Number((state.planet as unknown as Record<string, number>)[candidate.key] ?? 0) > 0 ? [index] : []);
  const selectFacility = (index: number) => {
    setSelected(index);
    setInspectionActive(false);
    const target = BUILDINGS[index];
    setModal(target.key === "researchLab" ? "research" : target.key === "shipyard" ? "ships" : "building");
  };
  const inspectFacility = (index = selected) => {
    setSelected(index);
    setModal(null);
    setInspectionActive(true);
  };
  const returnToOrbit = () => {
    setInspectionActive(false);
    setCameraReset((value) => value + 1);
  };
  const cycleInspection = (direction: -1 | 1) => {
    if (constructedFacilityIndices.length === 0) return;
    const current = constructedFacilityIndices.indexOf(selected);
    const next = current < 0 ? 0 : (current + direction + constructedFacilityIndices.length) % constructedFacilityIndices.length;
    setSelected(constructedFacilityIndices[next]);
  };
  const openInspectionCommand = () => {
    const target = BUILDINGS[selected];
    setInspectionActive(false);
    setModal(target.key === "researchLab" ? "research" : target.key === "shipyard" ? "ships" : "building");
  };
  useEffect(() => {
    if (!inspectionActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") returnToOrbit();
      else if (event.key === "ArrowLeft") cycleInspection(-1);
      else if (event.key === "ArrowRight") cycleInspection(1);
      else if (event.key === "Enter") openInspectionCommand();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inspectionActive, selected, constructedFacilityIndices.join(":")]);
  const costs = (metal: number, crystal: number, deuterium: number) => <div className="pw-costs">
    {metal > 0 && <span className="metal"><Pickaxe />{metal.toLocaleString()}</span>}
    {crystal > 0 && <span className="crystal"><Gem />{crystal.toLocaleString()}</span>}
    {deuterium > 0 && <span className="deuterium"><FlaskConical />{deuterium.toLocaleString()}</span>}
  </div>;
  const resourceRequirementRows = (metal: number, crystal: number, deuterium: number): RequirementRow[] => [
    { label: "Metal", current: Number(resource.metal), required: metal },
    { label: "Crystal", current: Number(resource.crystal), required: crystal },
    { label: "Deuterium", current: Number(resource.deuterium), required: deuterium },
  ].filter((requirement) => requirement.required > 0);
  const requirementChecklist = (requirements: RequirementRow[], title = "Requirements") => <section className="pw-requirements">
    <header><span>{title}</span><b>{requirementsMet(requirements) ? "ALL MET" : `${requirements.filter((requirement) => requirement.current < requirement.required).length} MISSING`}</b></header>
    <div>{requirements.map((requirement) => { const met = requirement.current >= requirement.required; return <span key={`${title}:${requirement.label}`} className={met ? "met" : "missing"}><i>{met ? "OK" : "!"}</i><em>{requirement.label}</em><b>{requirement.current.toLocaleString()} / {requirement.required.toLocaleString()}</b></span>; })}</div>
  </section>;
  const queueTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m ${String(remainder).padStart(2, "0")}s`;
  };
  const missionName = (missionType: number) => missionType === 1 ? "ATTACK" : missionType === 2 ? "TRANSPORT" : missionType === 5 ? "COLONIZE" : missionType === 6 ? "ESPIONAGE" : "MISSION";
  const missionArtKey = (type: number) => type === 1 ? "battlecruiser" : type === 2 ? "largeCargo" : type === 5 ? "colonyShip" : type === 6 ? "espionageProbe" : "smallCargo";
  const selectedMissionShips = Object.values(missionShips).reduce((total, amount) => total + Math.max(0, amount), 0);
  const selectedProbeCount = Math.max(0, missionShips.espionageProbe ?? 0);
  const selectedColonyCount = Math.max(0, missionShips.colonyShip ?? 0);
  const selectedCargoCapacity = SHIPS.reduce((total, ship) => total + (missionShips[ship.key] ?? 0) * ship.cargo, 0);
  const missionCargoAmounts = [Number(missionCargo.metal || 0), Number(missionCargo.crystal || 0), Number(missionCargo.deuterium || 0)];
  const selectedCargoTotal = missionCargoAmounts.reduce((total, amount) => total + amount, 0);
  const missionCoordinatesValid = isWholeQuantity(missionTarget.galaxy, 1, 999) && isWholeQuantity(missionTarget.system, 1, 999) && isWholeQuantity(missionTarget.position, 1, 15);
  const missionSpeedValid = isWholeQuantity(missionTarget.speed, 10, 100);
  const missionFleetNumbersValid = Object.entries(missionShips).every(([key, amount]) => isWholeQuantity(amount, 0, Number((state.fleet as any)[key] ?? 0)));
  const missionFleetValid = missionFleetNumbersValid && selectedMissionShips > 0 && (missionType !== 6 || (selectedProbeCount > 0 && selectedMissionShips === selectedProbeCount)) && (missionType !== 5 || selectedColonyCount > 0);
  const missionCargoNumbersValid = Object.values(missionCargo).every((amount) => amount === '' || isWholeQuantity(amount, 0, Number.MAX_SAFE_INTEGER));
  const missionCargoValid = missionCargoNumbersValid && ((missionType === 5 || missionType === 6) || selectedCargoTotal <= selectedCargoCapacity);
  const usableMissionSlots = Math.min(4, 1 + Math.floor(state.research.computerTech / 5));
  const availableMissionSlots = state.fleet.missions.slice(0, usableMissionSlots).filter((mission) => mission.missionType === 0).length;
  const activeMissionCount = usableMissionSlots - availableMissionSlots;
  const readyMissionCount = state.fleet.missions.slice(0, usableMissionSlots).filter((mission) => mission.missionType !== 0 && nowTs >= (mission.applied ? mission.returnTs : mission.arriveTs)).length;
  const availableFleetUnits = SHIPS.filter((ship) => ship.key !== "solarSatellite").reduce((total, ship) => total + Number((state.fleet as any)[ship.key] ?? 0), 0);
  const availableFleetClasses = SHIPS.filter((ship) => ship.key !== "solarSatellite" && Number((state.fleet as any)[ship.key] ?? 0) > 0).length;
  const estimatedMissionFuel = missionFuelCost(missionShips, missionTarget.speed) * (missionType === 5 ? 1 : 2);
  const missionResourcesValid = missionFleetNumbersValid && missionCargoNumbersValid && resource.metal >= BigInt(missionCargoAmounts[0]) && resource.crystal >= BigInt(missionCargoAmounts[1]) && resource.deuterium >= BigInt(missionCargoAmounts[2] + estimatedMissionFuel);
  const canLaunchMission = missionCoordinatesValid && missionSpeedValid && missionFleetValid && missionCargoValid && availableMissionSlots > 0 && missionResourcesValid;
  useEffect(() => {
    if (!missionCoordinatesValid) { setMissionError("Use whole coordinates: Galaxy 1-999, System 1-999, Position 1-15."); return; }
    if (!missionSpeedValid) { setMissionError("Choose a whole fleet speed from 10% to 100%."); return; }
    if (!missionFleetNumbersValid) { setMissionError('Ship assignments must be whole numbers within the available fleet.'); return; }
    if (missionType === 6 && !missionFleetValid) { setMissionError("Espionage requires probes only."); return; }
    if (missionType === 5 && !missionFleetValid) { setMissionError("Colonization requires a Colony Ship."); return; }
    if (!missionFleetValid) { setMissionError("Select at least one ship."); return; }
    if (!missionCargoNumbersValid) { setMissionError("Cargo amounts must be whole numbers that are zero or greater."); return; }
    if (!missionCargoValid) { setMissionError("Cargo exceeds the selected fleet capacity."); return; }
    if (availableMissionSlots <= 0) { setMissionError("No mission slots are available. Resolve an existing mission first."); return; }
    if (!missionResourcesValid) { setMissionError("This world does not have enough cargo resources and deuterium fuel for the mission."); return; }
    setMissionError("");
  }, [availableMissionSlots, missionCargoValid, missionFleetValid, missionFleetNumbersValid, missionResourcesValid, missionSpeedValid, missionCoordinatesValid, missionType, selectedCargoCapacity, selectedCargoTotal, selectedMissionShips]);
  const launchMission = async () => {
    if (!canLaunchMission || !game || missionChecking || busy) return;
    setMissionChecking(true);
    setMissionError("");
    try {
      const usableSlots = Math.min(4, 1 + Math.floor(state.research.computerTech / 5));
      const freeSlots = state.fleet.missions.slice(0, usableSlots).filter((mission) => mission.missionType === 0).length;
      if (freeSlots <= 0) throw new Error("No mission slots available. Resolve an existing mission first.");
      const cargo = { metal: BigInt(missionCargo.metal || 0), crystal: BigInt(missionCargo.crystal || 0), deuterium: BigInt(missionCargo.deuterium || 0) };
      if (resource.metal < cargo.metal || resource.crystal < cargo.crystal) throw new Error("Not enough resources are available for this mission cargo.");
      const fuel = BigInt(missionFuelCost(missionShips, missionTarget.speed) * (missionType === 5 ? 1 : 2));
      if (resource.deuterium < cargo.deuterium + fuel) throw new Error(`Not enough deuterium. Mission cargo and fuel require ${(cargo.deuterium + fuel).toLocaleString()}.`);
      const targetFree = await game.isCoordFree(missionTarget.galaxy, missionTarget.system, missionTarget.position);
      if (missionType === 5 && !targetFree) throw new Error("That coordinate slot is already occupied.");
      if (missionType !== 5 && targetFree) throw new Error(`${missionName(missionType)} missions can only target occupied planets.`);
      if (missionType === 1) {
        const now = Math.floor(Date.now() / 1000);
        const sourceUnlockLeft = Math.max(0, state.planet.attackUnlockedAt - now);
        const launchCooldownLeft = state.planet.lastAttackLaunchTs > 0 ? Math.max(0, state.planet.lastAttackLaunchTs + ATTACK_LAUNCH_COOLDOWN_SECONDS - now) : 0;
        const combatPoints = Object.entries(missionShips).reduce((total, [key, quantity]) => total + (SHIP_COMBAT_POINTS[key] ?? 0) * Math.max(0, quantity), 0);
        if (sourceUnlockLeft > 0) throw new Error(`Attack launches unlock in ${queueTime(sourceUnlockLeft)}.`);
        if (launchCooldownLeft > 0) throw new Error(`Attack launch cooldown: ${queueTime(launchCooldownLeft)} remaining.`);
        if (combatPoints < MIN_ATTACK_COMBAT_POINTS) throw new Error(`Attack fleet too weak. Need ${MIN_ATTACK_COMBAT_POINTS.toLocaleString()} combat points.`);
        const targetInfo = await game.getPublicPlanetInfoByCoordinates(missionTarget.galaxy, missionTarget.system, missionTarget.position);
        if (targetInfo) {
          const protectionLeft = Math.max(0, targetInfo.protectionUntilTs - now);
          const targetCooldownLeft = targetInfo.lastAttackedTs > 0 ? Math.max(0, targetInfo.lastAttackedTs + TARGET_ATTACK_COOLDOWN_SECONDS - now) : 0;
          if (protectionLeft > 0) throw new Error(`Target is protected for ${queueTime(protectionLeft)}.`);
          if (targetCooldownLeft > 0) throw new Error(`Target cooldown: ${queueTime(targetCooldownLeft)} remaining.`);
        }
      }
      const ships = Object.entries(missionShips).reduce((result, [key, amount]) => {
        const mapped = FLEET_LAUNCH_KEY[key];
        if (mapped && amount > 0) result[mapped] = amount;
        return result;
      }, {} as Record<"sc" | "lc" | "lf" | "hf" | "cr" | "bs" | "bc" | "bm" | "ds" | "de" | "rec" | "ep" | "col", number>);
      await run(`Launch ${missionName(missionType).toLowerCase()}`, (client, entity) => client.launchFleet(entity, ships, cargo, missionType, missionTarget.speed, { galaxy: missionTarget.galaxy, system: missionTarget.system, position: missionTarget.position, colonyName: missionType === 5 ? missionTarget.colonyName : undefined }));
    } catch (error) {
      setMissionError(error instanceof Error ? error.message : "Mission preflight failed.");
    } finally {
      setMissionChecking(false);
    }
  };
  const resolveMission = async (mission: PlayerState["fleet"]["missions"][number], slot: number) => {
    const label = `Resolve ${missionName(mission.missionType).toLowerCase()}`;
    if (mission.missionType === 1) await run(label, (client, entity) => client.resolveAttack(entity, mission, slot));
    else if (mission.missionType === 2) await run(label, (client, entity) => client.resolveTransport(entity, mission, slot));
    else if (mission.missionType === 6) await run(label, (client, entity) => client.resolveEspionage(entity, mission, slot));
    else if (mission.missionType === 5) await run(label, async (client, entity) => { await client.resolveColonize(entity, mission, slot); return ""; });
    if (mission.missionType === 1 || mission.missionType === 6) await activity.refresh();
  };
  const queueCommand = (queue: typeof queues[number]) => {
    const relatedQueues = queue.label === "Research" || queue.label === "Shipyard" ? [queues[0], queue] : [queue];
    return <>{relatedQueues.map((activeQueue) => {
      if (!activeQueue.active) return null;
      const seconds = Math.max(0, activeQueue.finishAt - nowTs);
      const ready = seconds === 0;
      const baseline = queueBaselines[`${activeQueue.label}:${activeQueue.finishAt}`] ?? 0;
      const progress = ready ? 100 : baseline > 0 ? Math.min(99, Math.max(0, ((baseline - seconds) / baseline) * 100)) : 0;
      return <section key={`${activeQueue.label}:${activeQueue.finishAt}`} className="pw-inline-queue">
        <div><span>{activeQueue.label} queue</span><strong>{activeQueue.item}</strong><div role="progressbar" aria-label={`${activeQueue.label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-valuetext={ready ? "Ready to finish" : `${queueTime(seconds)} remaining`} className={`pw-inline-queue-progress${ready ? " ready" : ""}`}><i style={{ width: `${progress}%` }} /></div></div>
        <div className="pw-inline-queue-control"><div className="pw-inline-queue-meta"><b>{ready ? "READY" : queueTime(seconds)}</b><em>{Math.round(progress)}%</em></div><div className="pw-inline-queue-actions"><CommandActionButton icon={<Zap />} pending={pendingCommand === `queue:accelerate:${activeQueue.label}`} pendingLabel="Accelerating..." disabled={busy || pendingCommand !== null || ready} onClick={() => void trackCommand(`queue:accelerate:${activeQueue.label}`, () => run(`Accelerate ${activeQueue.label.toLowerCase()}`, activeQueue.accelerate))}>Finish with AM</CommandActionButton><CommandActionButton tone="primary" icon={<CheckCircle2 />} pending={pendingCommand === `queue:finish:${activeQueue.label}`} pendingLabel="Finishing..." disabled={busy || pendingCommand !== null || !ready} onClick={() => void trackCommand(`queue:finish:${activeQueue.label}`, () => run(`Finish ${activeQueue.label.toLowerCase()}`, activeQueue.finish))}>Finish</CommandActionButton></div></div>
      </section>;
    })}</>;
  };
  const questDefinitions = activeQuestDefinitions(nowTs, questProgress);
  const questsHideTutorial = tutorialQuestsComplete(questState);
  const questGroups: QuestDefinition["group"][] = questsHideTutorial ? ["Daily", "Weekly", "Monthly"] : ["Tutorial", "Daily", "Weekly", "Monthly"];
  const questWorldNames = new Map(worlds.map((world) => [world.entity, world.name]));
  const dailyCheckInClaimed = questState?.dailyCheckinDay === Math.floor(nowTs / 86_400) || hasQuestBit(questClaimedMask(1, questState, nowTs), 0);
  const questCards = questDefinitions.map((quest) => {
    const statuses = quest.requirements.map((requirement) => ({ ...requirement, current: requirement.current(state) }));
    const complete = statuses.every((requirement) => requirement.current >= requirement.required);
    const claimed = quest.checkIn ? dailyCheckInClaimed : hasQuestBit(questClaimedMask(quest.period, questState, nowTs), quest.id);
    const target = quest.period === 0 || quest.checkIn ? null : questRewardTargetForRequirement(quest.period as 1 | 2 | 3, quest.requirements[0]?.label ?? "", questTargets);
    const targetKey = target?.toBase58() ?? null;
    const wrongPlanet = !!targetKey && targetKey !== state.entityPda && targetKey !== state.planetPda;
    const targetName = targetKey ? (questWorldNames.get(targetKey) ?? "recorded world") : null;
    const progress = claimed || complete ? 100 : statuses.length === 0 ? 0 : Math.round(statuses.reduce((sum, requirement) => sum + Math.min(1, requirement.current / Math.max(1, requirement.required)), 0) / statuses.length * 100);
    return { quest, statuses, complete, claimed, wrongPlanet, targetName, progress };
  });
  const questReadyCount = questCards.filter((card) => card.complete && !card.claimed && !card.wrongPlanet).length;
  const questClaimedCount = questCards.filter((card) => card.claimed).length;
  const questInProgressCount = questCards.length - questClaimedCount - questReadyCount;
  const priorityQuestCards = (questReadyCount > 0 ? questCards.filter((card) => card.complete && !card.claimed && !card.wrongPlanet) : questCards.filter((card) => !card.claimed && !card.wrongPlanet).sort((a, b) => b.progress - a.progress)).slice(0, 3);
  const storePackCards = STORE_PACKS.map((pack) => ({ pack, purchased: hasQuestBit(storePurchasedMask(pack.period, storePurchaseState, nowTs), pack.id) }));
  const storePurchasedCount = storePackCards.filter((card) => card.purchased).length;
  const storeAvailableCount = storePackCards.length - storePurchasedCount;
  const claimQuest = async (quest: QuestDefinition) => {
    await run(quest.checkIn ? "Daily check-in" : `Claim ${quest.title}`, (client, entity) => quest.checkIn ? client.dailyCheckIn(entity) : client.claimQuest(entity, quest.period, quest.id));
    await refreshQuestLedger();
  };
  const renderQuestCard = ({ quest, statuses, complete, claimed, wrongPlanet, targetName, progress }: (typeof questCards)[number]) => <article key={`${quest.period}:${quest.id}`} className={claimed ? "claimed" : wrongPlanet ? "wrong-world" : complete ? "ready" : "in-progress"}><div className="pw-quest-title"><div><span>{claimed ? "COMPLETED" : wrongPlanet ? "OTHER WORLD" : complete ? "REWARD READY" : `${progress}% COMPLETE`}</span><h3>{quest.title}</h3><p>{quest.hint}</p></div><b>{claimed ? "CLAIMED" : complete ? "READY" : quest.group.toUpperCase()}</b></div><div className={`pw-quest-progress${complete ? " ready" : ""}`}><i style={{ width: `${progress}%` }} /></div>{statuses.length > 0 && <div className="pw-quest-requirements">{statuses.map((requirement) => <span key={requirement.label} className={requirement.current >= requirement.required ? "met" : ""}><em>{requirement.current >= requirement.required ? "✓" : "•"}</em>{requirement.label}<b>{requirement.current.toLocaleString()} / {requirement.required.toLocaleString()}</b></span>)}</div>}<div className="pw-quest-reward"><span>REWARD</span><b className="metal"><Pickaxe />{quest.reward.metal.toLocaleString()}</b><b className="crystal"><Gem />{quest.reward.crystal.toLocaleString()}</b><b className="deuterium"><FlaskConical />{quest.reward.deuterium.toLocaleString()}</b></div><button disabled={busy || claimed || !complete || wrongPlanet} onClick={() => void claimQuest(quest)}>{claimed ? "REWARD CLAIMED" : wrongPlanet ? `CONTINUE ON ${targetName}` : complete ? "CLAIM REWARD" : "IN PROGRESS"}</button></article>;
  const purchaseStorePack = async (period: number, packId: number, title: string) => {
    const pack = storePackCards.find((card) => card.pack.period === period && card.pack.id === packId);
    if (!pack || !storePurchaseEligibility({ enabled: Boolean(storeConfig?.enabled) && !storeLoading && !storeError, purchased: pack.purchased, balance: allianceBalances.usdc, price: pack.pack.priceUsdc }).allowed) return;
    await run(`Purchase ${title}`, (client, entity) => client.purchaseStorePack(entity, period, packId));
    await refreshStore();
  };
  const depositAllianceMission = async (mission: typeof ALLIANCE_DEPOSIT_DEFINITIONS[number]) => {
    await run(`Deposit for ${mission.title}`, (client, entity) => client.depositAllianceResources(entity, mission.period, mission.id, {
      metal: mission.metal,
      crystal: mission.crystal,
      deuterium: mission.deuterium,
      antimatter: mission.antimatter,
    }));
    await refreshAlliance();
  };
  const createAlliance = async () => {
    if (!canCreateAlliance) return;
    await run(`Create ${allianceName.trim()}`, (client) => client.createAlliance(allianceName.trim(), normalizedAllianceTag, allianceImageUrl.trim()));
    await refreshAlliance();
  };
  const runAllianceAction = async (label: string, action: (client: GameClient) => Promise<unknown>) => {
    await run(label, (client) => action(client));
    await refreshAlliance();
  };
  const confirmAllianceAction = async () => {
    if (!allianceConfirmation) return;
    const pending = allianceConfirmation;
    setAllianceConfirmation(null);
    await runAllianceAction(pending.operationLabel, pending.action);
  };
  const enrollAllianceGovernance = async () => {
    await runAllianceAction("Join GAMESOL governance", (client) => client.enrollAllianceInGamesolGovernance());
  };
  const syncAllianceGovernance = async () => {
    await runAllianceAction("Sync GAMESOL governance", (client) => client.syncAllianceGamesolGovernance());
  };
  const submitAllianceDecision = async () => {
    if (!game || !allianceGovernance || !allianceMembership) return;
    setDecisionError("");
    setDecisionSubmitting(true);
    try {
      const externalProposal = new PublicKey(decisionProposal.trim());
      if (allianceDecisions.some((decision) => decision.externalProposal === externalProposal.toBase58())) {
        throw new Error("This Futarchy proposal is already bound to an alliance action.");
      }
      const marketSnapshot = await fetchDecisionMarket(
        game.getConnection(),
        allianceGovernance.dao,
        externalProposal.toBase58(),
        connectedPublicKey,
      );
      if (marketSnapshot.state !== "PENDING") throw new Error("Only a live PENDING decision market can be registered.");
      const now = Math.floor(Date.now() / 1000);
      if (marketSnapshot.closesAt <= now) throw new Error("This decision market has already closed.");
      if (marketSnapshot.closesAt > now + 30 * 86_400) throw new Error("The market window exceeds the game adapter's 30-day maximum.");
      const actionSpecialization = decisionAction === 1 ? 0 : decisionSpecialization;
      const vulnerabilityHourUtc = decisionAction === 0 ? decisionVulnerabilityHour : 0;
      await runAllianceAction("Register alliance governance action", (client) => client.createAllianceDecision({
        externalProposal,
        action: decisionAction,
        targetPlanet: new PublicKey(state.planetPda),
        galaxy: state.planet.galaxy,
        system: state.planet.system,
        specialization: actionSpecialization,
        vulnerabilityHourUtc,
        expiresAt: marketSnapshot.closesAt,
      }));
      const registered = (await game.fetchAllianceDecisions(new PublicKey(allianceGovernance.alliance)))
        .some((decision) => decision.externalProposal === externalProposal.toBase58());
      if (registered) setDecisionProposal("");
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "Unable to register this governance action.");
    } finally {
      setDecisionSubmitting(false);
    }
  };
  const shortAddress = (address: string) => `${address.slice(0, 5)}...${address.slice(-5)}`;
  const activityAmount = (value: bigint) => value.toLocaleString();
  const activityTime = (timestamp: number) => new Date(timestamp * 1000).toLocaleString();
  const reportTotal = activity.battleReports.length + activity.spyReports.length;
  const latestReportAt = Math.max(0, ...activity.battleReports.map(({ event }) => event.resolvedAt), ...activity.spyReports.map(({ event }) => event.resolvedAt));
  const modalTitle: Record<PlanetWorldModal, string> = {
    buildingSelect: "PLANETARY FACILITIES",
    building: building.name.toUpperCase(),
    research: "RESEARCH LABORATORY",
    ships: "SHIPYARD",
    defense: "DEFENSE GRID",
    missions: "MISSION CONTROL",
    quests: "QUEST COMMAND",
    store: "COMMAND STORE",
    alliance: "ALLIANCE COMMAND",
    market: "INTERPLANETARY MARKET",
    activity: "COMMAND INTELLIGENCE",
  };
  const modalIcon: Record<PlanetWorldModal, typeof Building2> = {
    buildingSelect: Building2,
    building: Building2,
    research: FlaskConical,
    ships: Rocket,
    defense: Shield,
    missions: Crosshair,
    quests: Trophy,
    store: ShoppingCart,
    alliance: Users,
    market: Scale,
    activity: Activity,
  };
  const ActiveModalIcon = modal ? modalIcon[modal] : Building2;
  return <main className="planet-world">
    {reviewPack && <StorePurchaseReview pack={reviewPack} worldName={state.planet.name} balance={allianceBalances.usdc} disabled={busy || pendingCommand !== null || storeLoading || !storeConfig?.enabled || storePackCards.some((card) => card.pack.period === reviewPack.period && card.pack.id === reviewPack.id && card.purchased)} onClose={() => setReviewPack(null)} onConfirm={() => {
      const pack = reviewPack; setReviewPack(null);
      void trackCommand(`store:${pack.period}:${pack.id}`, () => purchaseStorePack(pack.period, pack.id, pack.title));
    }} />}
    <section className="planet-world-scene">
      <Canvas shadows camera={{ position: [0, .9, 13.8], fov: 40 }} dpr={[1, 1.45]} gl={{ antialias: true, powerPreference: "high-performance" }} onCreated={({ gl }) => { gl.setClearColor("#01030a"); gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.04; }}>
        <color attach="background" args={["#01030a"]} />
        <Stars radius={68} depth={34} count={1050} factor={2.25} saturation={.5} fade speed={0} />
        <Suspense fallback={null}><WorldStructures state={state} selected={selected} onSelect={selectFacility} /><SceneReady sceneKey={state.entityPda} onReady={onSceneReady} /></Suspense>
        <PlanetCameraRig selected={selected} selectedLevel={Number((state.planet as unknown as Record<string, number>)[BUILDINGS[selected].key] ?? 0)} resetCommand={cameraReset} inspectionActive={inspectionActive} />
      </Canvas>
      <div className={`pw-scene-readout${inspectionActive ? " is-inspecting" : ""}`}>
        <span>{inspectionActive ? "FACILITY INSPECTION" : "PLANETARY ORBIT"}</span>
        <b>{inspectionActive ? BUILDINGS[selected].name.toUpperCase() : `${planetSurfaceStyleForSystem(state.planet.position, state.planet.galaxy, state.planet.system).name.toUpperCase()} WORLD`}</b>
        <small>{inspectionActive ? `LEVEL ${Number((state.planet as unknown as Record<string, number>)[BUILDINGS[selected].key] ?? 0)} · STAGE ${facilityStage(Number((state.planet as unknown as Record<string, number>)[BUILDINGS[selected].key] ?? 0))} ARCHITECTURE · ← → SWITCH · ENTER COMMAND` : `${SHIPS.filter((ship) => ship.key !== "solarSatellite").reduce((total, ship) => total + Number((state.fleet as unknown as Record<string, number>)[ship.key] ?? 0), 0).toLocaleString()} VESSELS · ${state.fleet.solarSatellite.toLocaleString()} SOLAR SATELLITES · SHIPYARD L${state.planet.shipyard}`}</small>
        {inspectionActive ? <div className="pw-inspection-controls">
          <GameIconButton label="Previous constructed facility" onClick={() => cycleInspection(-1)}><ChevronLeft aria-hidden="true" /></GameIconButton>
          <GameButton className="primary" onClick={openInspectionCommand}><Building2 aria-hidden="true" /> Open command</GameButton>
          <GameIconButton label="Next constructed facility" onClick={() => cycleInspection(1)}><ChevronRight aria-hidden="true" /></GameIconButton>
          <GameButton className="orbit" onClick={returnToOrbit}><RotateCcw aria-hidden="true" /> Return to orbit</GameButton>
        </div> : <GameIconButton label="Reset orbit" onClick={returnToOrbit}><RotateCcw aria-hidden="true" /></GameIconButton>}
      </div>
      <div className="pw-scene-vignette" aria-hidden="true" />
    </section>
    <a className="pw-brand" href="/" aria-label="GAMESOL home"><img src={gamesolMark} alt="GAMESOL" /></a>
    <button ref={walletTriggerRef} className="pw-wallet-trigger" aria-haspopup={wallet ? "dialog" : undefined} aria-controls={wallet && !onOpenWallet ? "pw-wallet-menu" : undefined} aria-expanded={wallet ? walletOpen : undefined} onClick={() => wallet ? onOpenWallet ? onOpenWallet() : setWalletOpen(true) : void connect()}>
      {wallet && <CommanderAvatar fallback={wallet.label.slice(0, 2)} />}<span>{wallet?.label ?? "ENTER WITH PASSKEY"}</span>
    </button>
    {wallet && !onOpenWallet && walletOpen && <div className="pw-wallet-backdrop" onMouseDown={() => setWalletOpen(false)}><section ref={walletPanelRef} id="pw-wallet-menu" className="pw-wallet-menu" role="dialog" aria-modal="true" aria-labelledby="pw-wallet-menu-title" onMouseDown={(event) => event.stopPropagation()}><header><span id="pw-wallet-menu-title">PASSKEY WALLET</span><button ref={walletCloseRef} type="button" aria-label="Close passkey wallet menu" title="Close (Esc)" onClick={() => setWalletOpen(false)}><X aria-hidden="true" /></button></header><div><span>Network</span><b>{NETWORK_LABEL}</b></div><div><span>Lazor address</span><b>{wallet.label}</b></div><div><span>Command worlds</span><b>{wallet.worlds}</b></div><div><span>Shield</span><b className={wallet.shieldActive ? "good" : ""}>{wallet.shieldActive ? "ACTIVE" : "OFF"}</b></div><div><span>Game profile</span><b className={wallet.vaultStatus === "ready" ? "good" : ""}>{wallet.vaultStatus.replace(/_/g, " ")}</b></div><div><span>SOL</span><b>{wallet.vaultSol} SOL</b></div><div><span>Antimatter</span><b>{wallet.antimatter} AM</b></div><div><span>USDC</span><b>{wallet.usdc} USDC</b></div><small className="pw-passkey-funding-note">Fund this LazorKit address directly. There is no separate browser vault.</small><footer><button type="button" className="wallet-adapter-button" onClick={() => { setWalletOpen(false); void disconnect(); }}>DISCONNECT PASSKEY</button></footer></section></div>}
    <header className="pw-top"><button onClick={onExit} aria-label="Return to active planet system"><ChevronLeft /> SYSTEM</button><div className="pw-world-identity"><span>COMMAND WORLD</span><strong>{state.planet.name}</strong><small>G {state.planet.galaxy} · S {state.planet.system} · P {state.planet.position}</small></div><div className="pw-resources"><b className="metal" aria-label={`Metal ${resource.metal.toLocaleString()}`} title={`Metal · ${resource.metal.toLocaleString()}`}><Pickaxe /><span>METAL</span><strong className="pw-resource-exact">{resource.metal.toLocaleString()}</strong><strong className="pw-resource-compact">{compactHudResource(resource.metal)}</strong></b><b className="crystal" aria-label={`Crystal ${resource.crystal.toLocaleString()}`} title={`Crystal · ${resource.crystal.toLocaleString()}`}><Gem /><span>CRYSTAL</span><strong className="pw-resource-exact">{resource.crystal.toLocaleString()}</strong><strong className="pw-resource-compact">{compactHudResource(resource.crystal)}</strong></b><b className="deuterium" aria-label={`Deuterium ${resource.deuterium.toLocaleString()}`} title={`Deuterium · ${resource.deuterium.toLocaleString()}`}><FlaskConical /><span>DEUTERIUM</span><strong className="pw-resource-exact">{resource.deuterium.toLocaleString()}</strong><strong className="pw-resource-compact">{compactHudResource(resource.deuterium)}</strong></b><b className={`energy ${energyTone}`} aria-label={`Energy ${resource.energyProduction.toLocaleString()} produced, ${resource.energyConsumption.toLocaleString()} consumed, ${energyPercent} percent available`} title={`Energy · ${resource.energyProduction.toLocaleString()} / ${resource.energyConsumption.toLocaleString()} · ${energyPercent}%`}><Zap /><span>ENERGY</span><strong className="pw-resource-exact">{resource.energyProduction.toLocaleString()} / {resource.energyConsumption.toLocaleString()}</strong><strong className="pw-resource-compact">{compactHudResource(resource.energyProduction)} / {compactHudResource(resource.energyConsumption)}</strong><em>{energyPercent}%</em></b></div></header>
    {activeQueues.length > 0 && <section className="pw-queues" aria-label="Active planet work" aria-live="polite">{activeQueues.map((queue) => { const seconds = Math.max(0, queue.finishAt - nowTs); const ready = seconds === 0; const baseline = queueBaselines[`${queue.label}:${queue.finishAt}`] ?? 0; const progress = ready ? 100 : baseline > 0 ? Math.min(99, Math.max(0, ((baseline - seconds) / baseline) * 100)) : 0; const queueArt = queue.artKey ? resolveGameArtUrl(queue.artKey) : null; return <article key={queue.label} className={`active${ready ? " is-ready" : ""}`}><div className="pw-queue-card-main">{queueArt && <span className="pw-queue-art"><img src={queueArt} alt="" /></span>}<div className="pw-queue-details"><div className="pw-queue-title"><span>{queue.label}</span><b>{ready ? "READY" : queueTime(seconds)}</b></div><strong>{queue.item}</strong><div className={`pw-queue-progress${ready ? " ready" : ""}`}><i style={{ width: `${progress}%` }} /></div></div></div><div className="pw-queue-actions">{ready ? <button disabled={busy} onClick={() => run(`Finish ${queue.label.toLowerCase()}`, queue.finish)}>FINISH</button> : <button className="accelerate" disabled={busy} onClick={() => run(`Accelerate ${queue.label.toLowerCase()}`, queue.accelerate)}>FINISH WITH ANTIMATTER</button>}</div></article>; })}</section>}
    {showGrowthObjective && <aside className="pw-command-objective" aria-label="Recommended next planet objective">
      <div className="pw-command-objective-signal"><span>{earlyWorldGuidance ? "EMPIRE EXPANSION" : "NEXT OBJECTIVE"}</span><b>{earlyWorldGuidance ? `${completedExpansionMilestones} / ${expansionMilestones.length}` : "LIVE"}</b><i /></div>
      {earlyWorldGuidance && <div className="pw-expansion-path" aria-label={`${completedExpansionMilestones} of ${expansionMilestones.length} early expansion milestones complete`}>{expansionMilestones.map((milestone, index) => <span key={milestone.label} className={milestone.complete ? "complete" : index === completedExpansionMilestones ? "current" : ""}><i>{milestone.complete ? "✓" : index + 1}</i><em>{milestone.label}</em></span>)}</div>}
      <strong>UPGRADE {growthFacility.name.toUpperCase()}</strong>
      <p>{energyPercent < 100 ? "Restore full production efficiency before expanding the colony." : `Advance to level ${growthFacilityLevel + 1}. ${NEXT_BUILDING_EFFECT[growthFacility.key]}`}</p>
      <div className="pw-objective-facts"><span>{growthFacilityCost[0].toLocaleString()} M</span><span>{growthFacilityCost[1].toLocaleString()} C</span>{growthFacilityCost[2] > 0 && <span>{growthFacilityCost[2].toLocaleString()} D</span>}<span>{queueTime(growthBuildSeconds)}</span></div>
      <div className="pw-objective-action"><span className={growthFacilityReady ? "ready" : "gathering"}>{growthFacilityReady ? "READY TO BUILD" : "GATHER RESOURCES"}</span><button type="button" onClick={() => selectFacility(growthFacilityIndex)}>OPEN COMMAND <ChevronRight /></button></div>
    </aside>}
    <nav className={`pw-operations${earlyWorldGuidance ? " is-guided" : ""}`} aria-label="Planet operations">
      <button className={`${modal === "buildingSelect" || modal === "building" ? "active" : ""}${showGrowthObjective ? " is-recommended" : ""}`} aria-label={showGrowthObjective ? "Buildings, recommended next objective" : "Buildings"} title={showGrowthObjective ? `Next objective: upgrade ${growthFacility.name}` : "Buildings"} aria-haspopup="dialog" aria-expanded={modal === "buildingSelect" || modal === "building"} onClick={(event) => openPlanetCommand("buildingSelect", event.currentTarget)}><Building2 /><span>BUILD</span></button>
      <button className={modal === "research" ? "active" : ""} aria-label="Research" title="Research" aria-haspopup="dialog" aria-expanded={modal === "research"} onClick={(event) => openPlanetCommand("research", event.currentTarget)}><FlaskConical /><span>RESEARCH</span></button>
      <button className={modal === "ships" ? "active" : ""} aria-label="Shipyard" title="Shipyard" aria-haspopup="dialog" aria-expanded={modal === "ships"} onClick={(event) => openPlanetCommand("ships", event.currentTarget)}><Rocket /><span>SHIPYARD</span></button>
      <button className={`pw-operation-advanced${modal === "defense" ? " active" : ""}`} aria-label="Defenses" title="Defenses" aria-haspopup="dialog" aria-expanded={modal === "defense"} onClick={(event) => openPlanetCommand("defense", event.currentTarget)}><Shield /><span>DEFENSE</span></button>
      <button className={modal === "missions" ? "active" : ""} aria-label="Missions" title="Missions" aria-haspopup="dialog" aria-expanded={modal === "missions"} onClick={(event) => openPlanetCommand("missions", event.currentTarget)}><Crosshair /><span>MISSIONS</span></button>
      <button className={`pw-operation-secondary${modal === "activity" ? " active" : ""}`} aria-label="Activity reports" title="Activity reports" aria-haspopup="dialog" aria-expanded={modal === "activity"} onClick={(event) => openPlanetCommand("activity", event.currentTarget)}><Activity /><span>REPORTS</span></button>
      <button className={`pw-operation-secondary${modal === "market" ? " active" : ""}`} aria-label="Market" title="Market" aria-haspopup="dialog" aria-expanded={modal === "market"} onClick={(event) => openPlanetCommand("market", event.currentTarget)}><Scale /><span>MARKET</span></button>
      <button className={`pw-operation-secondary${modal === "quests" ? " active" : ""}`} aria-label="Quests" title="Quests" aria-haspopup="dialog" aria-expanded={modal === "quests"} onClick={(event) => openPlanetCommand("quests", event.currentTarget)}><Trophy /><span>QUESTS</span></button>
      <button className={`pw-operation-secondary${modal === "alliance" ? " active" : ""}`} aria-label="Alliance" title="Alliance" aria-haspopup="dialog" aria-expanded={modal === "alliance"} onClick={(event) => { setAlliancePanel("overview"); setAllianceOnboardingMode("discover"); openPlanetCommand("alliance", event.currentTarget); }}><Users /><span>ALLIANCE</span></button>
      <button className={`pw-operation-secondary${modal === "store" ? " active" : ""}`} aria-label="Store" title="Store" aria-haspopup="dialog" aria-expanded={modal === "store"} onClick={(event) => openPlanetCommand("store", event.currentTarget)}><ShoppingCart /><span>STORE</span></button>
      <button ref={operationMenuTriggerRef} className="pw-operation-more" aria-label="More planet operations" title="More planet operations" aria-haspopup="dialog" aria-expanded={operationMenuOpen} onClick={() => setOperationMenuOpen(true)}><Menu /><span>MORE</span></button>
    </nav>
    {operationMenuOpen && <div className="pw-operation-menu-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOperationMenuOpen(false); }}><section ref={operationMenuPanelRef} className="pw-operation-menu" role="dialog" aria-modal="true" aria-labelledby="pw-operation-menu-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>PLANET COMMAND</small><h2 id="pw-operation-menu-title">More operations</h2><p>Intelligence, economy, progression, and alliance systems.</p></div><button ref={operationMenuCloseRef} type="button" aria-label="Close more planet operations" onClick={() => setOperationMenuOpen(false)}><X /></button></header>
      <div>
        {earlyWorldGuidance && <button onClick={(event) => { operationMenuLaunchingRef.current = true; setOperationMenuOpen(false); openPlanetCommand("defense", event.currentTarget); }}><Shield /><span><b>Defenses</b><small>Protect this world with planetary fortifications</small></span><em>{defenseUnitCount > 0 ? `${defenseUnitCount} ONLINE` : "BUILD"}</em><ChevronRight /></button>}
        <button onClick={(event) => { operationMenuLaunchingRef.current = true; setOperationMenuOpen(false); openPlanetCommand("activity", event.currentTarget); }}><Activity /><span><b>Reports</b><small>Battle and espionage intelligence</small></span><em className={reportTotal > 0 ? "has-update" : ""}>{activity.loading ? "SYNCING" : `${reportTotal} VERIFIED`}</em><ChevronRight /></button>
        <button onClick={(event) => { operationMenuLaunchingRef.current = true; setOperationMenuOpen(false); openPlanetCommand("market", event.currentTarget); }}><Scale /><span><b>Market</b><small>Trade resources across the universe</small></span><em>LIVE DEVNET</em><ChevronRight /></button>
        <button onClick={(event) => { operationMenuLaunchingRef.current = true; setOperationMenuOpen(false); openPlanetCommand("quests", event.currentTarget); }}><Trophy /><span><b>Quests</b><small>Objectives, rewards, and progression</small></span><em className={questReadyCount > 0 ? "needs-action" : ""}>{questReadyCount > 0 ? `${questReadyCount} READY` : `${questInProgressCount} ACTIVE`}</em><ChevronRight /></button>
        <button onClick={(event) => { operationMenuLaunchingRef.current = true; setAlliancePanel("overview"); setAllianceOnboardingMode("discover"); setOperationMenuOpen(false); openPlanetCommand("alliance", event.currentTarget); }}><Users /><span><b>Alliance</b><small>Members, sovereignty, and governance</small></span><em className={allianceJoinRequests.length > 0 ? "needs-action" : ""}>{allianceJoinRequests.length > 0 ? `${allianceJoinRequests.length} REQUESTS` : alliance?.tag ? alliance.tag : "DISCOVER"}</em><ChevronRight /></button>
        <button onClick={(event) => { operationMenuLaunchingRef.current = true; setOperationMenuOpen(false); openPlanetCommand("store", event.currentTarget); }}><ShoppingCart /><span><b>Store</b><small>Commander supplies and resource packs</small></span><em>{storeAvailableCount} AVAILABLE</em><ChevronRight /></button>
      </div>
    </section></div>}
    {modal && <div className="pw-modal-backdrop" onMouseDown={() => setModal(null)}><section ref={modalPanelRef} className={`pw-command-modal pw-command-kind-${modal}${modal === "market" ? " pw-market-modal" : ""}${modal === "alliance" ? ` pw-alliance-view-${alliancePanel}` : ""}`} role="dialog" aria-modal="true" aria-labelledby="pw-command-modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="pw-modal-toolbar"><div className="pw-modal-title-group"><span className="pw-modal-command-mark" aria-hidden="true"><ActiveModalIcon /></span><div className="pw-modal-context"><span>PLANET COMMAND</span><strong id="pw-command-modal-title">{modalTitle[modal]}</strong><small>{state.planet.name} · G {state.planet.galaxy} · S {state.planet.system} · P {state.planet.position}</small></div></div><div className="pw-modal-toolbar-actions"><span className="pw-modal-network"><i />LIVE DEVNET</span><button ref={modalCloseRef} className="pw-modal-close" aria-label={`Close ${modalTitle[modal]}`} title="Close (Esc)" onClick={() => setModal(null)}><span>CLOSE</span><X /></button></div></header>
      {modal === "alliance" && !allianceLoading && alliance && allianceMembership && <nav className="pw-alliance-tabs" aria-label="Alliance command sections">{([['overview','COMMAND'],['members',`MEMBERS ${allianceMembers.length}`],['missions','CONTRIBUTE'],['governance',`GOVERNANCE ${allianceDecisions.length}`]] as const).map(([panel,label]) => <button key={panel} className={alliancePanel === panel ? "active" : ""} onClick={() => setAlliancePanel(panel)}>{label}{panel === "members" && allianceJoinRequests.length > 0 && <b>{allianceJoinRequests.length}</b>}</button>)}</nav>}
      <div className="pw-modal-content">
      {commandError && <div className="command-workspace-error" role="alert"><CircleAlert aria-hidden="true" /><p>{commandError}</p><GameIconButton label="Dismiss workspace error" onClick={() => setCommandError('')}><X aria-hidden="true" /></GameIconButton></div>}
      {busy && <PlanetCommandState kind="loading" compact title="Command in progress" description="Your approved action is being processed on Solana devnet. Keep this workspace open until confirmation." />}
      {modal === "buildingSelect" && <>
        <div className="pw-command-head"><span>PLANETARY FACILITIES</span><h2>Strengthen your world</h2><p>Start with production and energy. Advanced infrastructure stays available when you are ready to expand.</p></div>
        <div className="pw-facility-section-title"><div><span>{advancedFacilitiesOpen ? "ALL FACILITIES" : "CORE ECONOMY"}</span><b>{advancedFacilitiesOpen ? "12 CONSTRUCTION PATHS" : "4 ESSENTIAL FACILITIES"}</b></div><small>{advancedFacilitiesOpen ? "Production, storage and advanced infrastructure." : "Increase resources and keep your power grid balanced."}</small></div>
        <div className="pw-facility-grid">{BUILDINGS.filter((item) => item.key !== "missileSilo" && (advancedFacilitiesOpen || item.idx <= 3)).map((item) => {
          const index = item.idx;
          const currentLevel = Number((state.planet as any)[item.key] ?? 0);
          const upgrading = state.planet.buildQueueItem === index;
          const nextCost = upgradeCost(index, currentLevel);
          const prerequisitesReady = requirementsMet(buildingRequirements(item.key));
          const affordable = canAfford(...nextCost);
          const ready = !queueBusy && prerequisitesReady && affordable;
          const availability = upgrading ? "UPGRADING" : queueBusy ? "QUEUE OCCUPIED" : !prerequisitesReady ? "PREREQUISITES" : !affordable ? "NEEDS RESOURCES" : "READY TO UPGRADE";
          return <button key={item.key} className={`${upgrading ? "is-upgrading " : ""}${ready ? "is-ready" : "is-blocked"}`} aria-label={`${item.name}, level ${currentLevel}, ${availability.toLowerCase()}`} onClick={() => selectFacility(index)}>
            <span className="pw-facility-thumb">{resolveGameArtUrl(item.key) && <img src={resolveGameArtUrl(item.key)!} alt="" />}</span>
            <div className="pw-facility-card-copy"><em>{availability}</em><b>{item.name}</b><small>LEVEL {currentLevel} <i>→</i> {currentLevel + 1}</small><span className="pw-facility-card-cost"><span className={canAfford(nextCost[0], 0, 0) ? "has" : "missing"}><Pickaxe />{nextCost[0].toLocaleString()}</span><span className={canAfford(0, nextCost[1], 0) ? "has" : "missing"}><Gem />{nextCost[1].toLocaleString()}</span>{nextCost[2] > 0 && <span className={canAfford(0, 0, nextCost[2]) ? "has" : "missing"}><FlaskConical />{nextCost[2].toLocaleString()}</span>}</span></div>
            <ChevronRight className="pw-facility-open" />
          </button>;
        })}</div>
        <section className={`pw-facility-advanced-toggle${advancedFacilitiesOpen ? " is-open" : ""}`}><div><span>ADVANCED INFRASTRUCTURE</span><b>{advancedFacilitiesOpen ? "Robotics, storage, shipyard and research are visible." : "Unlock deeper construction paths when you need them."}</b></div><button type="button" aria-expanded={advancedFacilitiesOpen} onClick={() => setAdvancedFacilitiesOpen((open) => !open)}>{advancedFacilitiesOpen ? "SHOW CORE ONLY" : "SHOW 8 ADVANCED FACILITIES"}</button></section>
      </>}
      {modal === "building" && <section className="pw-building-command">
        <CommandActionButton className="pw-command-back" type="button" icon={<ChevronLeft />} onClick={() => setModal("buildingSelect")}>All facilities</CommandActionButton>
        <div className="pw-command-art" style={{ backgroundImage: resolveGameArt(building.key, "none") }} />
        <div className="pw-command-head"><span>PLANETARY FACILITY</span><h2>{building.name}</h2><p>{NEXT_BUILDING_EFFECT[building.key]}</p></div>
        <section className="pw-upgrade-brief" aria-label={`${building.name} upgrade brief`}>
          <div><span>Upgrade cost</span>{costs(metalCost, crystalCost, deuteriumCost)}</div>
          <div><span>Build time</span><b>{queueTime(buildTimeSecs(building.idx, level + 1, state.planet.roboticsFactory))}</b></div>
        </section>
        <div className={`pw-facility-status${buildingCommandReady ? " is-ready" : queueBusy ? " is-busy" : " is-blocked"}`} aria-live="polite">
          <div><span>{buildingCommandReady ? "UPGRADE READY" : queueBusy ? "CONSTRUCTION SLOT OCCUPIED" : !buildingPrerequisitesReady ? "PREREQUISITES REQUIRED" : "RESOURCES REQUIRED"}</span><b>LEVEL {level} <i>→</i> {level + 1}</b></div>
          {!buildingCommandReady && <small>{queueBusy ? "Finish the active construction first." : !buildingPrerequisitesReady ? "Missing facility requirements." : "Insufficient resources."}</small>}
        </div>
        <CommandActionButton tone="primary" className="pw-primary-action" icon={<Hammer />} pending={pendingCommand === `building:${building.key}`} pendingLabel="Starting upgrade..." disabled={busy || pendingCommand !== null || !buildingCommandReady} onClick={() => void trackCommand(`building:${building.key}`, () => run(`Upgrade ${building.name}`, (client, entity) => client.startBuild(entity, selected)))}>{queueBusy ? "Construction active" : !buildingPrerequisitesReady ? "Requirements not met" : !buildingAffordable ? "Insufficient resources" : "Upgrade to level " + (level + 1)}</CommandActionButton>
        <CommandActionButton className="pw-inspect-action" type="button" icon={<Crosshair />} onClick={() => inspectFacility()}>Inspect facility</CommandActionButton>
        {queueCommand(queues[0])}
        {storageCap && <section className="pw-storage-cap"><div><span>Current {storageCap.label} cap</span><b>{storageCap.current.toLocaleString()}</b></div><i>→</i><div><span>Next cap · Level {level + 1}</span><b>{storageCapacityAtLevel(level + 1).toLocaleString()}</b></div></section>}
        {(!buildingPrerequisitesReady || !buildingAffordable) && requirementChecklist([...buildingRequirementsForSelected, ...resourceRequirementRows(metalCost, crystalCost, deuteriumCost)], "Upgrade requirements")}
      </section>}
      {modal === "research" && <section className="pw-research-command">
        <div className="pw-command-head"><span>RESEARCH LABORATORY</span><h2>Technology command</h2><p>Advance one technology at a time. Every status below reflects this world's live laboratory, resources, and research queue.</p></div>
        <section className="pw-research-overview" aria-label="Research command overview"><div><span>LABORATORY</span><b>LEVEL {state.planet.researchLab}</b></div><div className="ready"><span>READY NOW</span><b>{researchReadyCount}</b></div><div><span>LOCKED</span><b>{researchLockedCount}</b></div><div className={researchBusy ? "busy" : "idle"}><span>RESEARCH QUEUE</span><b>{researchBusy ? "ACTIVE" : "AVAILABLE"}</b></div></section>
        {queueCommand(queues[1])}
        <section className={`pw-facility-upgrade pw-research-lab${!queueBusy && !researchBusy && researchLabAffordable ? " is-ready" : ""}`}><div><span>LABORATORY INFRASTRUCTURE</span><b>Research Lab · Level {state.planet.researchLab} → {state.planet.researchLab + 1}</b><small>Upgrade the laboratory to unlock deeper technologies.</small>{costs(researchLabMetalCost, researchLabCrystalCost, researchLabDeuteriumCost)}</div><div className="pw-research-lab-actions"><button className="pw-inspect-action" type="button" onClick={() => inspectFacility(11)}><Crosshair /> INSPECT IN 3D</button><CommandActionButton tone="primary" icon={<Hammer />} pending={pendingCommand === 'building:researchLab'} pendingLabel="Starting upgrade..." disabled={busy || pendingCommand !== null || queueBusy || researchLabUpgradeBlocked || !researchLabAffordable} onClick={() => void trackCommand('building:researchLab', () => run("Upgrade Research Lab", (client, entity) => client.startBuild(entity, 11)))}>{queueBusy ? "Construction active" : researchLabUpgradeBlocked ? "Research active" : !researchLabAffordable ? "Needs resources" : `Upgrade to level ${state.planet.researchLab + 1}`}</CommandActionButton></div></section>
        {state.planet.researchLab === 0 && researchReadyCount === 0 && <section className={`pw-facility-advanced-toggle pw-research-catalog-toggle${researchCatalogOpen ? " is-open" : ""}`}><div><span>FUTURE TECHNOLOGIES</span><b>{researchCatalogOpen ? "The complete research tree is visible below." : "Build the laboratory first, or preview what it will unlock."}</b></div><button type="button" aria-expanded={researchCatalogOpen} onClick={() => setResearchCatalogOpen((open) => !open)}>{researchCatalogOpen ? "HIDE TECHNOLOGY PREVIEW" : `PREVIEW ${researchOptions.length} TECHNOLOGIES`}</button></section>}
        {researchCatalogVisible && <><div className="pw-command-section-title"><div><span>TECHNOLOGY PROGRAMS</span><b>{researchOptions.length} RESEARCH PATHS</b></div><small>Select one program to inspect its next level and requirements.</small></div>
        <div className="pw-command-list pw-research-list">{researchOptions.map(({ tech, index, techLevel, cost, requirements, prerequisitesReady, resourcesReady, ready }) => <article key={tech.key} className={ready ? "is-ready" : "is-locked"}><div className="pw-row-art" style={{ backgroundImage: resolveGameArt(tech.key, "none") }} /><div><span className={`pw-card-readiness ${ready ? "ready" : "locked"}`}>{researchBusy ? "QUEUE OCCUPIED" : researchLabUpgrading ? "LAB UPGRADING" : ready ? "READY TO RESEARCH" : !prerequisitesReady ? "PREREQUISITES" : "NEEDS RESOURCES"}</span><h3>{tech.name}</h3><p>Level {techLevel} → {techLevel + 1}. {tech.desc}</p>{costs(...cost)}{!prerequisitesReady && <p className="pw-command-warning">Requires {missingRequirementLabel(requirements)}</p>}{!resourcesReady && <p className="pw-command-warning">Insufficient resources.</p>}</div><CommandActionButton tone="primary" icon={<Zap />} pending={pendingCommand === `research:${tech.key}`} pendingLabel="Starting research..." disabled={busy || pendingCommand !== null || researchBusy || researchLabUpgrading || !ready} onClick={() => void trackCommand(`research:${tech.key}`, () => run(`Research ${tech.name}`, (client, entity) => client.startResearch(entity, index)))}>{researchBusy ? "Research active" : researchLabUpgrading ? "Lab upgrading" : !prerequisitesReady ? "Locked" : !resourcesReady ? "Needs resources" : `Research level ${techLevel + 1}`}</CommandActionButton></article>)}</div></>}
      </section>}
      {modal === "ships" && <section className="pw-shipyard-command">
        <div className="pw-command-head"><span>SHIPYARD</span><h2>Fleet construction</h2><p>Choose a production quantity, confirm the live cost, then commission one available hull. Fleet and defense production share the same queue.</p></div>
        <section className="pw-shipyard-overview" aria-label="Shipyard command overview"><div><span>SHIPYARD</span><b>LEVEL {state.planet.shipyard}</b></div><div><span>FLEET INVENTORY</span><b>{ownedVesselCount.toLocaleString()}</b></div><div className="ready"><span>HULLS READY</span><b>{shipReadyCount}</b></div><div className={shipyardBusy ? "busy" : "idle"}><span>PRODUCTION QUEUE</span><b>{shipyardBusy ? "ACTIVE" : "AVAILABLE"}</b></div></section>
        {queueCommand(queues[2])}{queueCommand(queues[3])}
        <section className={`pw-facility-upgrade pw-shipyard-facility${!queueBusy && !shipyardBusy && shipyardAffordable && shipyardRequirementsMet ? " is-ready" : ""}`}><div><span>ORBITAL INFRASTRUCTURE</span><b>Shipyard · Level {state.planet.shipyard} → {state.planet.shipyard + 1}</b><small>Upgrade the orbital yard to unlock more fleet and defense blueprints.</small>{costs(shipyardMetalCost, shipyardCrystalCost, shipyardDeuteriumCost)}{!shipyardRequirementsMet && <p className="pw-command-warning">Requires {missingRequirementLabel(shipyardRequirements)}</p>}{!shipyardAffordable && <p className="pw-command-warning">Insufficient resources.</p>}</div><div className="pw-shipyard-facility-actions"><CommandActionButton className="pw-inspect-action" type="button" icon={<Crosshair />} onClick={() => inspectFacility(7)}>Inspect shipyard</CommandActionButton><CommandActionButton tone="primary" icon={<Hammer />} pending={pendingCommand === 'building:shipyard'} pendingLabel="Starting upgrade..." disabled={busy || pendingCommand !== null || queueBusy || shipyardUpgradeBlocked || !shipyardAffordable || !shipyardRequirementsMet} onClick={() => void trackCommand('building:shipyard', () => run("Upgrade Shipyard", (client, entity) => client.startBuild(entity, 7)))}>{queueBusy ? "Construction active" : shipyardUpgradeBlocked ? "Production active" : !shipyardRequirementsMet ? "Shipyard locked" : !shipyardAffordable ? "Needs resources" : `Upgrade to level ${state.planet.shipyard + 1}`}</CommandActionButton></div></section>
        <section className="pw-production-control" aria-label="Fleet production quantity"><div><span>PRODUCTION ORDER</span><b>Quantity</b></div><CommandQuantity label="Fleet production quantity" value={quantity} onChange={setQuantity} onValidityChange={setProductionQuantityValid} disabled={busy || pendingCommand !== null} /></section>
        <div className="pw-command-section-title"><div><span>FLEET BLUEPRINTS</span><b>{shipOptions.length} HULL CLASSES</b></div><small>{shipReadyCount} can be produced with the selected quantity.</small></div>
        <div className="pw-command-list pw-ship-list">{shipOptions.map(({ ship, cost, requirements, prerequisitesReady, resourcesReady, ready }) => <article key={ship.key} className={ready ? "is-ready" : "is-locked"}><div className="pw-row-art" style={{ backgroundImage: resolveGameArt(ship.key, "none") }} /><div><span className={`pw-card-readiness ${ready ? "ready" : "locked"}`}>{shipyardBusy ? "QUEUE OCCUPIED" : shipyardUpgrading ? "SHIPYARD UPGRADING" : ready ? `READY · BUILD ${quantity}` : !prerequisitesReady ? "BLUEPRINT LOCKED" : "NEEDS RESOURCES"}</span><h3>{ship.name}</h3><p>{Number((state.fleet as any)[ship.key] ?? 0).toLocaleString()} owned · {ship.cargo.toLocaleString()} cargo · {ship.atk.toLocaleString()} attack</p>{costs(...cost)}{!prerequisitesReady && <p className="pw-command-warning">Requires {missingRequirementLabel(requirements)}</p>}{!resourcesReady && <p className="pw-command-warning">Insufficient resources for {quantity}.</p>}</div><CommandActionButton tone="primary" icon={<Hammer />} pending={pendingCommand === `ship:${ship.key}`} pendingLabel="Commissioning..." disabled={busy || pendingCommand !== null || !productionQuantityValid || shipyardBusy || shipyardUpgrading || !ready} onClick={() => void trackCommand(`ship:${ship.key}`, () => run(`Build ${ship.name}`, (client, entity) => client.buildShip(entity, SHIP_TYPE_IDX[ship.key], quantity)))}>{!productionQuantityValid ? "Invalid quantity" : shipyardBusy ? "Queue active" : shipyardUpgrading ? "Shipyard upgrading" : !prerequisitesReady ? "Locked" : !resourcesReady ? "Needs resources" : `Build ${quantity}`}</CommandActionButton></article>)}</div>
      </section>}
      {modal === "defense" && <section className="pw-defense-command">
        <div className="pw-command-head"><span>DEFENSE GRID</span><h2>Planetary defense</h2><p>Review this world's defensive posture, set a production quantity, then commission one available installation through the shared shipyard queue.</p></div>
        <section className="pw-defense-overview" aria-label="Planetary defense overview"><div><span>GRID STATUS</span><b>{defenseUnitCount > 0 ? "FORTIFIED" : "UNFORTIFIED"}</b></div><div><span>UNITS ONLINE</span><b>{defenseUnitCount.toLocaleString()}</b></div><div className="ready"><span>BLUEPRINTS READY</span><b>{defenseReadyCount}</b></div><div className={shipyardBusy ? "busy" : "idle"}><span>PRODUCTION QUEUE</span><b>{shipyardBusy ? "ACTIVE" : "AVAILABLE"}</b></div></section>
        {queueCommand(queues[2])}{queueCommand(queues[3])}
        <section className="pw-defense-posture"><div><span>PLANETARY COVERAGE</span><b>{activeShieldCount > 0 ? `${activeShieldCount} SHIELD ${activeShieldCount === 1 ? "FIELD" : "FIELDS"} ONLINE` : "NO SHIELD FIELD"}</b><small>{activeShieldCount > 0 ? "Unique planetary shield infrastructure is active." : "Shield domes unlock after the required shipyard and shielding technology levels."}</small></div><div><span>SHIPYARD LINK</span><b>LEVEL {state.planet.shipyard}</b><small>Fleet and defense orders cannot run at the same time.</small></div></section>
        <section className="pw-production-control" aria-label="Defense production quantity"><div><span>PRODUCTION ORDER</span><b>Quantity</b></div><CommandQuantity label="Defense production quantity" value={quantity} onChange={setQuantity} onValidityChange={setProductionQuantityValid} disabled={busy || pendingCommand !== null} /></section>
        <div className="pw-command-section-title"><div><span>DEFENSE BLUEPRINTS</span><b>{defenseOptions.length} INSTALLATIONS</b></div><small>{defenseReadyCount} can be produced with the selected quantity.</small></div>
        <div className="pw-command-list pw-defense-list">{defenseOptions.map(({ item, index, cost, requirements, prerequisitesReady, resourcesReady, online, unique, uniqueAlreadyBuilt, ready }) => <article key={item.key} className={ready ? "is-ready" : uniqueAlreadyBuilt ? "is-online" : "is-locked"}><div className="pw-row-art" style={{ backgroundImage: resolveGameArt(item.key, "none") }} /><div><span className={`pw-card-readiness ${ready ? "ready" : uniqueAlreadyBuilt ? "online" : "locked"}`}>{shipyardBusy ? "QUEUE OCCUPIED" : shipyardUpgrading ? "SHIPYARD UPGRADING" : ready ? `READY · BUILD ${quantity}` : uniqueAlreadyBuilt ? "UNIQUE FIELD ONLINE" : !prerequisitesReady ? "BLUEPRINT LOCKED" : "NEEDS RESOURCES"}</span><h3>{item.name}</h3><p>{item.role} · {online.toLocaleString()} online{unique ? " · UNIQUE" : ""}</p><small className="pw-defense-description">{item.desc}</small>{costs(...cost)}{!prerequisitesReady && <p className="pw-command-warning">Requires {missingRequirementLabel(requirements)}</p>}{uniqueAlreadyBuilt && <p className="pw-command-success">Maximum planetary deployment reached.</p>}{!resourcesReady && !uniqueAlreadyBuilt && <p className="pw-command-warning">Insufficient resources for {quantity}.</p>}</div><CommandActionButton tone="primary" icon={<Shield />} pending={pendingCommand === `defense:${item.key}`} pendingLabel="Commissioning..." disabled={busy || pendingCommand !== null || !productionQuantityValid || shipyardBusy || shipyardUpgrading || !ready} onClick={() => void trackCommand(`defense:${item.key}`, () => run(`Build ${item.name}`, (client, entity) => client.buildDefense(entity, index, quantity)))}>{!productionQuantityValid ? "Invalid quantity" : shipyardBusy ? "Queue active" : shipyardUpgrading ? "Shipyard upgrading" : uniqueAlreadyBuilt ? "Field online" : !prerequisitesReady ? "Locked" : !resourcesReady ? "Needs resources" : `Build ${quantity}`}</CommandActionButton></article>)}</div>
      </section>}
      {modal === "quests" && <section className="pw-quest-command">
        <div className="pw-command-head"><span>QUEST COMMAND</span><h2>Commander progression</h2><p>Claim completed objectives first, then open a campaign to inspect its next milestones and live UTC reset.</p></div>
        {questsLoading ? <section className="pw-quest-loading"><Trophy /><div><b>Loading progression ledger</b><p>Checking this commander's current objectives and on-chain reward state.</p></div><i /></section> : <>
          <section className="pw-quest-overview" aria-label="Commander quest overview"><div><span>OBJECTIVES</span><b>{questCards.length}</b></div><div className={questReadyCount > 0 ? "ready" : "idle"}><span>READY TO CLAIM</span><b>{questReadyCount}</b></div><div><span>COMPLETED</span><b>{questClaimedCount}</b></div><div><span>IN PROGRESS</span><b>{questInProgressCount}</b></div></section>
          {priorityQuestCards.length > 0 && <section className="pw-quest-priority"><header><div><span>{questReadyCount > 0 ? "REWARDS AVAILABLE" : "NEXT OBJECTIVES"}</span><b>{questReadyCount > 0 ? "Claim before continuing" : "Closest to completion"}</b></div><em>{priorityQuestCards.length} PRIORITY</em></header><div className="pw-quest-grid">{priorityQuestCards.map(renderQuestCard)}</div></section>}
          <div className="pw-quest-groups pw-quest-campaigns">{questGroups.map((group) => { const reset = questGroupResetSeconds(group, nowTs); const collapsed = collapsedQuestGroups[group]; const groupCards = questCards.filter((card) => card.quest.group === group); const groupReady = groupCards.filter((card) => card.complete && !card.claimed && !card.wrongPlanet).length; const groupClaimed = groupCards.filter((card) => card.claimed).length; return <section key={group} className={collapsed ? "is-collapsed" : "is-open"}><header><div><span>{group}</span><small>{groupCards.length} OBJECTIVES · {groupClaimed} COMPLETED{groupReady > 0 ? ` · ${groupReady} READY` : ""}</small>{reset !== null && <b>RESET {queueTime(reset)}</b>}</div><button aria-expanded={!collapsed} onClick={() => setCollapsedQuestGroups((current) => ({ ...current, [group]: !current[group] }))}>{collapsed ? "VIEW CAMPAIGN" : "HIDE CAMPAIGN"}</button></header>{!collapsed && <div className="pw-quest-grid">{groupCards.map(renderQuestCard)}</div>}</section>; })}</div>
        </>}
      </section>}
      {modal === "alliance" && <><div className="pw-command-head"><span>ALLIANCE COMMAND</span><h2>{alliance?.name ?? "Find your alliance"}</h2><p>{alliance ? `${alliance.memberCount} members. Shared infrastructure benefits every member.` : "Discover a live command network, request membership, or establish your own alliance when you are ready to lead."}</p></div>{allianceLoading ? <section className="pw-alliance-loading"><Users /><div><b>Scanning alliance registry</b><p>Checking live memberships, applications, and available command networks.</p></div><i /></section> : !alliance || !allianceMembership ? <>
        <section className="pw-alliance-recruitment-status" aria-label="Alliance recruitment overview"><div><span>AVAILABLE ALLIANCES</span><b>{allianceDirectory.length}</b></div><div className={pendingAllianceDirectory.length > 0 ? "pending" : "clear"}><span>YOUR REQUESTS</span><b>{pendingAllianceDirectory.length}</b></div><div><span>CREATION COST</span><b>{(Number(ALLIANCE_CREATE_USDC_COST) / 1_000_000).toLocaleString()} USDC</b></div><div><span>ANTIMATTER REQUIRED</span><b>{(Number(ALLIANCE_CREATE_ANTIMATTER_COST) / 1_000_000).toLocaleString()} AM</b></div></section>
        <nav className="pw-alliance-onboarding-tabs" aria-label="Alliance onboarding choices"><button className={allianceOnboardingMode === "discover" ? "active" : ""} onClick={() => setAllianceOnboardingMode("discover")}><Users /><span><b>DISCOVER ALLIANCES</b><small>Browse networks and request membership</small></span></button><button className={allianceOnboardingMode === "create" ? "active" : ""} onClick={() => setAllianceOnboardingMode("create")}><Shield /><span><b>CREATE AN ALLIANCE</b><small>Establish and lead a new network</small></span></button></nav>
      </> : <><section className="pw-alliance-treasury"><div className="metal"><span><Pickaxe />Metal</span><b>{allianceTreasury?.metal.toLocaleString() ?? "0"}</b></div><div className="crystal"><span><Gem />Crystal</span><b>{allianceTreasury?.crystal.toLocaleString() ?? "0"}</b></div><div className="deuterium"><span><FlaskConical />Deuterium</span><b>{allianceTreasury?.deuterium.toLocaleString() ?? "0"}</b></div><div className="antimatter"><span><Zap />Antimatter</span><b>{allianceTreasury ? (Number(allianceTreasury.antimatter) / 1_000_000).toLocaleString() : "0"}</b></div></section><div className="pw-alliance-buildings">{ALLIANCE_BUILDINGS.map((building) => { const currentLevel = Number((allianceTreasury as any)?.[building.key] ?? 0); const cost = allianceBuildingCost(building.id, currentLevel + 1); const leader = allianceMembership.role === 2; return <article key={building.key}><div><h3>{building.title} Lv {currentLevel}</h3><p>{building.hint}</p><span>{cost.metal.toLocaleString()} M · {cost.crystal.toLocaleString()} C · {cost.deuterium.toLocaleString()} D · {(Number(cost.antimatter) / 1_000_000).toLocaleString()} AM</span></div><button disabled={busy || !leader} onClick={() => void runAllianceAction(`Upgrade ${building.title}`, (client) => client.upgradeAllianceBuilding(building.id))}>{leader ? "UPGRADE" : "LEADER ONLY"}</button></article>; })}</div><section className="pw-alliance-roster"><header><span>MEMBERS</span><b>{allianceMembers.length}</b></header><div>{allianceMembers.map((member) => { const leader = member.role === 2; const self = member.authority === allianceMembership.authority; return <article key={member.authority}><div><h3>{shortAddress(member.authority)}</h3><p>{leader ? "Alliance leader" : "Alliance member"}</p></div>{allianceMembership.role === 2 && !leader && <div><button disabled={busy} onClick={() => setAllianceConfirmation({ title: "Transfer alliance leadership?", detail: `${shortAddress(member.authority)} will gain full control of alliance membership and infrastructure. You will become a regular member.`, confirmLabel: "TRANSFER LEADERSHIP", operationLabel: "Transfer alliance leadership", action: (client) => client.transferAllianceLeadership(new PublicKey(member.authority)) })}>MAKE LEADER</button>{!self && <button className="danger" disabled={busy} onClick={() => setAllianceConfirmation({ title: "Remove this member?", detail: `${shortAddress(member.authority)} will immediately lose alliance access and member-only governance privileges.`, confirmLabel: "REMOVE MEMBER", operationLabel: "Expel alliance member", action: (client) => client.expelAllianceMember(new PublicKey(member.authority)) })}>EXPEL</button>}</div>}</article>; })}</div>{allianceMembership.role !== 2 && <button className="pw-alliance-leave" disabled={busy} onClick={() => setAllianceConfirmation({ title: "Leave this alliance?", detail: "You will lose member access to this alliance and its member-only governance actions. Your planets and personal assets remain yours.", confirmLabel: "LEAVE ALLIANCE", operationLabel: "Leave alliance", action: (client) => client.leaveAlliance() })}>LEAVE ALLIANCE</button>}</section>{allianceMembership.role === 2 && <section className="pw-alliance-requests"><header><span>JOIN REQUESTS</span><b>{allianceJoinRequests.length}</b></header>{allianceJoinRequests.map((request) => <article key={request.publicKey}><span>{shortAddress(request.applicant)}</span><div><button disabled={busy} onClick={() => void runAllianceAction("Approve alliance request", (client) => client.approveJoinRequest(new PublicKey(request.applicant)))}>APPROVE</button><button className="danger" disabled={busy} onClick={() => void runAllianceAction("Reject alliance request", (client) => client.rejectJoinRequest(new PublicKey(request.applicant)))}>REJECT</button></div></article>)}{allianceJoinRequests.length === 0 && <p>No pending applications.</p>}</section>}<div className="pw-alliance-missions">{(["Daily", "Weekly", "Monthly"] as const).map((group) => <section key={group}><header><span>{group} deposits</span><b>Alliance XP</b></header><div>{ALLIANCE_DEPOSIT_DEFINITIONS.filter((mission) => mission.group === group).map((mission) => <article key={`${mission.period}:${mission.id}`}><div><h3>{mission.title}</h3><p>{mission.metal > 0n && `${mission.metal.toLocaleString()} M `}{mission.crystal > 0n && `${mission.crystal.toLocaleString()} C `}{mission.deuterium > 0n && `${mission.deuterium.toLocaleString()} D `}{mission.antimatter > 0n && `${(Number(mission.antimatter) / 1_000_000).toLocaleString()} AM`}</p></div><b>+{mission.xp} XP</b><button disabled={busy} onClick={() => void depositAllianceMission(mission)}>DEPOSIT</button></article>)}</div></section>)}</div></>}</>}
{modal === "store" && <section className="pw-store-command">
        <div className="pw-command-head"><h2>Supply</h2><p>Delivery to {state.planet.name}</p></div>
        {storeLoading ? <PlanetCommandState kind="loading" title="Loading store" description="Checking packs and purchase limits." />
          : storeError ? <div className="command-workspace-error" role="alert"><CircleAlert aria-hidden="true" /><div><strong>Store connection unavailable</strong><p>{storeError}</p></div><CommandActionButton icon={<RotateCcw />} onClick={() => void refreshStore()}>Retry</CommandActionButton></div>
          : !storeConfig || !storeConfig.enabled ? <PlanetCommandState kind="unavailable" title="Store not enabled" description="Purchases are unavailable on devnet." />
          : <>
            <div className="command-store-balance"><span>Your USDC</span><strong><img src={usdcCoin} alt="USDC" />{formatUsdc(allianceBalances.usdc)}</strong></div>
            <div className="command-store-catalog">{(["Daily", "Weekly", "Monthly"] as const).map((group) => {
              const reset = questGroupResetSeconds(group, nowTs);
              const collapsed = collapsedStoreGroups[group];
              const groupCards = storePackCards.filter(({ pack }) => pack.group === group);
              const purchasedInGroup = groupCards.filter((card) => card.purchased).length;
              const resetLabel = reset === null ? 'at reset' : `in ${queueTime(reset)}`;
              const groupId = `store-packs-${group.toLowerCase()}`;
              return <section key={group}>
                <header><div><h3>{group}</h3><small>{groupCards.length} packs / {purchasedInGroup} purchased</small></div><div><b>Resets {resetLabel}</b><GameIconButton label={`${collapsed ? 'Show' : 'Hide'} ${group.toLowerCase()} packs`} aria-expanded={!collapsed} aria-controls={groupId} onClick={() => setCollapsedStoreGroups((current) => ({ ...current, [group]: !current[group] }))}>{collapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}</GameIconButton></div></header>
                {!collapsed && <div id={groupId}>{groupCards.map(({ pack, purchased }) => <StorePackCard key={`${pack.period}:${pack.id}`} pack={pack} purchased={purchased} balance={allianceBalances.usdc} worldName={state.planet.name} resetLabel={resetLabel} pending={pendingCommand === `store:${pack.period}:${pack.id}`} disabled={busy || pendingCommand !== null || !game} onReview={setReviewPack} />)}</div>}
              </section>;
            })}</div>
          </>}
      </section>}
      {modal === "activity" && <section className="pw-intelligence-command">
        <div className="pw-command-head"><span>COMMAND INTELLIGENCE</span><h2>Battle and espionage reports</h2><p>Review verified outcomes and reconnaissance recovered from this commander's on-chain operations.</p></div>
        <section className="pw-intelligence-overview" aria-label="Command intelligence overview"><div><span>ALL REPORTS</span><b>{reportTotal}</b></div><div><span>BATTLE REPORTS</span><b>{activity.battleReports.length}</b></div><div><span>ESPIONAGE REPORTS</span><b>{activity.spyReports.length}</b></div><div className={activity.loading ? "scanning" : "ready"}><span>LAST ACTIVITY</span><b>{activity.loading ? "SCANNING" : latestReportAt > 0 ? new Date(latestReportAt * 1000).toLocaleDateString() : "NO HISTORY"}</b></div></section>
        <div className="pw-activity-toolbar"><div><span>DEVNET INTELLIGENCE LEDGER</span><small>{activity.loading ? "Checking confirmed mission events..." : `${reportTotal} confirmed ${reportTotal === 1 ? "record" : "records"} loaded`}</small></div><button disabled={activity.loading} onClick={() => void activity.refresh()}>{activity.loading ? "SCANNING..." : "UPDATE REPORTS"}</button></div>
        {activity.loading && reportTotal === 0 ? <section className="pw-intelligence-loading"><Activity /><div><b>Scanning mission history</b><p>Checking confirmed battle and espionage events for your owned worlds.</p></div><i /></section> : reportTotal === 0 ? <section className="pw-intelligence-empty"><div className="pw-intelligence-empty-signal"><Activity /></div><div><span>NO REPORTS RECORDED</span><h3>Intelligence begins with a mission</h3><p>Battle reports appear after attacks resolve. Espionage reports appear after probe missions complete. Every result remains verifiable through Solana Explorer.</p></div><button type="button" onClick={() => setModal("missions")}>OPEN MISSION CONTROL</button></section> : <div className="pw-report-groups">
          {activity.spyReports.length > 0 && <section className="pw-report-group"><header><div><span>RECONNAISSANCE</span><b>Espionage intelligence</b></div><em>{activity.spyReports.length} REPORTS</em></header><div className="pw-activity-grid">{activity.spyReports.map(({ signature, event }) => { const resourcesVisible = event.revealLevel >= 1; const buildingsVisible = event.revealLevel >= 2; const militaryVisible = event.revealLevel >= 3; const techVisible = event.revealLevel >= 4; return <article key={`spy:${signature}`} className="spy"><header><div><span>SPY REPORT · LEVEL {event.revealLevel}</span><h3>{event.sourceGalaxy}:{event.sourceSystem}:{event.sourcePosition} → {event.targetGalaxy}:{event.targetSystem}:{event.targetPosition}</h3></div><b className={event.probesSurvived > 0 ? "good" : "danger"}>{event.probesSurvived > 0 ? "PROBES RETURNING" : "PROBES LOST"}</b></header><section><div><span>Signal / counter</span><b>{activityAmount(event.sensorScore)} / {activityAmount(event.counterScore)}</b></div><div><span>Resources</span><b>{resourcesVisible ? `${activityAmount(event.reportedMetal)} M · ${activityAmount(event.reportedCrystal)} C · ${activityAmount(event.reportedDeuterium)} D` : "HIDDEN"}</b></div><div><span>Building score</span><b>{buildingsVisible ? activityAmount(event.reportedBuildingScore) : "HIDDEN"}</b></div><div><span>Fleet / defense</span><b>{militaryVisible ? `${activityAmount(event.reportedFleetPoints)} / ${activityAmount(event.reportedDefensePoints)}` : "HIDDEN"}</b></div><div><span>Combat technology</span><b>{techVisible ? `W${event.reportedWeaponsTechnology} · S${event.reportedShieldingTechnology} · A${event.reportedArmorTechnology}` : "HIDDEN"}</b></div></section><footer><span>Probes {event.probesSurvived}/{event.probesSent}</span><span>{activityTime(event.resolvedAt)}</span><a href={`https://explorer.solana.com/tx/${signature}?cluster=${EXPLORER_CLUSTER}`} target="_blank" rel="noreferrer">VERIFY ON SOLANA</a></footer></article>; })}</div></section>}
          {activity.battleReports.length > 0 && <section className="pw-report-group"><header><div><span>COMBAT ARCHIVE</span><b>Resolved engagements</b></div><em>{activity.battleReports.length} REPORTS</em></header><div className="pw-activity-grid">{activity.battleReports.map(({ signature, event }) => { const loot = event.lootMetal + event.lootCrystal + event.lootDeuterium; const debris = event.debrisMetal + event.debrisCrystal; const recycled = event.recycledMetal + event.recycledCrystal; return <article key={`battle:${signature}`} className="battle"><header><div><span>ATTACK REPORT · ROUND {event.combatRounds}</span><h3>{event.sourceGalaxy}:{event.sourceSystem}:{event.sourcePosition} → {event.targetGalaxy}:{event.targetSystem}:{event.targetPosition}</h3></div><b className={event.attackerWon ? "good" : "danger"}>{event.attackerWon ? "ATTACKER WON" : "ATTACKER REPELLED"}</b></header><section><div><span>Loot recovered</span><b>{activityAmount(loot)}</b></div><div><span>Generated debris</span><b>{activityAmount(debris)}</b></div><div><span>Recycled</span><b>{activityAmount(recycled)}</b></div><div><span>Attacker fleet</span><b>{event.attackerDestroyed ? "DESTROYED" : "RETURNING"}</b></div><div><span>Defender</span><b>{event.defenderSurvived ? "SURVIVED" : "DESTROYED"}</b></div></section><footer><span>{activityTime(event.resolvedAt)}</span><a href={`https://explorer.solana.com/tx/${signature}?cluster=${EXPLORER_CLUSTER}`} target="_blank" rel="noreferrer">VERIFY ON SOLANA</a></footer></article>; })}</div></section>}
        </div>}
      </section>}
      {modal === "market" && <><div className="pw-command-head"><span>INTERPLANETARY MARKET</span><h2>Exchange resources and colonies</h2><p>Browse live devnet listings, sell production for ANTIMATTER, or manage your active offers from one command desk.</p></div><MarketTab client={market} state={state} ownedPlanets={ownedWorlds} liveRes={state.resources} antimatterBalance={allianceBalances.antimatter} onTxStart={marketControls.onTxStart} onTxEnd={marketControls.onTxEnd} txBusy={busy} sectionMode="both" canTransact={Boolean(game && market)} /></>}
      {modal === "missions" && <section className="pw-mission-command">
        <div className="pw-command-head"><span>MISSION CONTROL</span><h2>Fleet operations</h2><p>Track active movements, resolve arrivals, and dispatch the next order from {state.planet.name}.</p></div>
        <section className="pw-mission-overview" aria-label="Fleet mission overview"><div><span>ACTIVE ORDERS</span><b>{activeMissionCount}</b></div><div className={readyMissionCount > 0 ? "ready" : "idle"}><span>ARRIVALS READY</span><b>{readyMissionCount}</b></div><div><span>MISSION SLOTS</span><b>{availableMissionSlots}/{usableMissionSlots} FREE</b></div><div><span>AVAILABLE FLEET</span><b>{availableFleetUnits.toLocaleString()} UNITS</b></div></section>
        {activeMissionCount > 0 ? <div className="pw-command-list pw-active-missions">{state.fleet.missions.map((mission, slot) => { if (mission.missionType === 0) return null; const resolveAt = mission.applied ? mission.returnTs : mission.arriveTs; const ready = nowTs >= resolveAt; const missionArt = resolveGameArtUrl(missionArtKey(mission.missionType)); return <article key={slot} className={ready ? "is-ready" : "is-in-flight"}><div className="pw-mission-badge">{missionArt ? <img src={missionArt} alt="" /> : <Crosshair />}</div><div><span className={`pw-card-readiness ${ready ? "ready" : "in-flight"}`}>{ready ? "ARRIVAL READY" : mission.applied ? "RETURNING" : "IN FLIGHT"}</span><h3>{missionName(mission.missionType)} · {mission.targetGalaxy}:{mission.targetSystem}:{mission.targetPosition}</h3><p>Mission slot {slot + 1} · {mission.applied ? "Return leg" : "Outbound leg"} · {ready ? "Resolve the arrival now" : `${queueTime(Math.max(0, resolveAt - nowTs))} remaining`}</p></div>{ready ? <CommandActionButton tone="primary" icon={<CheckCircle2 />} pending={pendingCommand === `resolve:${slot}`} pendingLabel="Resolving..." disabled={busy || pendingCommand !== null} onClick={() => void trackCommand(`resolve:${slot}`, () => resolveMission(mission, slot))}>Resolve arrival</CommandActionButton> : <CommandActionButton icon={<Zap />} pending={pendingCommand === `accelerate:${slot}`} pendingLabel="Accelerating..." disabled={busy || pendingCommand !== null} onClick={() => void trackCommand(`accelerate:${slot}`, () => run("Accelerate mission", (client, entity) => client.accelerateMissionWithAntimatter(entity, slot, mission.applied ? 1 : 0)))}>Finish with AM</CommandActionButton>}</article>; })}</div> : <section className="pw-mission-idle"><Crosshair /><div><span>FLIGHT CONTROL CLEAR</span><b>No active operations</b><p>All usable mission slots are available for a new order.</p></div></section>}
        {availableFleetUnits === 0 ? <section className="pw-mission-empty"><div className="pw-mission-empty-orbit"><Rocket /></div><div><span>FLEET REQUIRED</span><h3>Build your first mission-capable ship</h3><p>This world has no deployable ships. Open the Shipyard, unlock a blueprint, and commission a vessel before configuring coordinates or cargo.</p><ol><li><b>1</b>Upgrade the Shipyard</li><li><b>2</b>Build an available ship</li><li><b>3</b>Return here to launch</li></ol></div><button type="button" onClick={() => setModal("ships")}>OPEN SHIPYARD</button></section> : <section className="pw-launch">
          <header className="pw-launch-head"><div><span>NEW FLEET ORDER</span><h3>Configure mission</h3><p>Select one objective and complete its live preflight.</p></div><b>{availableFleetClasses} FLEET CLASSES READY</b></header>
          <nav className="pw-launch-progress" aria-label="Mission configuration steps"><span className="active"><b>01</b>OBJECTIVE</span><span><b>02</b>DESTINATION</span><span><b>03</b>FLEET</span><span><b>04</b>{missionType === 5 || missionType === 6 ? "REVIEW" : "CARGO"}</span></nav>
          <fieldset className="command-launch-fields" disabled={busy || pendingCommand !== null || missionChecking}>
          <div className="pw-launch-types">{([[2,"Transport","Move resources","largeCargo"],[1,"Attack","Engage a world","battlecruiser"],[6,"Espionage","Gather intelligence","espionageProbe"],[5,"Colonize","Establish a world","colonyShip"]] as const).map(([type, label, description, artKey]) => { const art = resolveGameArtUrl(artKey); return <button key={type} className={missionType === type ? "active" : ""} aria-pressed={missionType === type} onClick={() => { setMissionType(Number(type)); setMissionError(""); }}>{art && <span className="pw-launch-type-art"><img src={art} alt="" /></span>}<span className="pw-launch-type-copy"><b>{label}</b><small>{description}</small></span><i>{missionType === type ? "SELECTED" : "SELECT"}</i></button>; })}</div>
          <div className="pw-launch-section-head"><h4>Destination and speed</h4><span>G:S:P coordinates</span></div><div className="pw-launch-grid pw-destination-grid">{(["galaxy", "system", "position", "speed"] as const).map((field) => <label key={field}><span>{field}</span><input inputMode="numeric" type="number" min={field === "speed" ? 10 : 1} max={field === "galaxy" || field === "system" ? 999 : field === "position" ? 15 : 100} value={missionTarget[field]} onChange={(event) => setMissionTarget((current) => ({ ...current, [field]: Math.max(field === "speed" ? 10 : 1, Number(event.target.value) || 1) }))} /><small>{field === "speed" ? "10–100%" : field === "position" ? "1–15" : "1–999"}</small></label>)}</div>
          {missionType === 5 && <label className="pw-colony-name"><span>Colony name</span><input value={missionTarget.colonyName} maxLength={32} onChange={(event) => setMissionTarget((current) => ({ ...current, colonyName: event.target.value }))} /><small>{missionTarget.colonyName.length}/32</small></label>}
          <div className="pw-launch-section-head"><h4>Assign fleet</h4><span>{selectedMissionShips.toLocaleString()} selected</span></div><div className="pw-fleet-grid">{SHIPS.filter((ship) => ship.key !== "solarSatellite" && Number((state.fleet as any)[ship.key] ?? 0) > 0).map((ship) => { const available = Number((state.fleet as any)[ship.key] ?? 0); const assigned = missionShips[ship.key] ?? 0; return <label key={ship.key} className={assigned > 0 ? "is-selected" : ""}><span>{ship.name}<b>{available.toLocaleString()} available</b></span><input aria-label={`${ship.name} assignment`} inputMode="numeric" type="number" min="0" max={available} value={assigned || ""} placeholder="0" onChange={(event) => setMissionShips((current) => ({ ...current, [ship.key]: Math.min(available, Math.max(0, Number(event.target.value) || 0)) }))} /></label>; })}</div>
          {missionType !== 5 && missionType !== 6 && <><div className="pw-launch-section-head"><h4>Load cargo</h4><span>{selectedCargoTotal.toLocaleString()} / {selectedCargoCapacity.toLocaleString()} capacity</span></div><div className="pw-launch-grid pw-cargo-grid">{(["metal", "crystal", "deuterium"] as const).map((field) => <label key={field}><span>{field}</span><input inputMode="numeric" type="number" min="0" max={Number((state.resources as any)[field] ?? 0)} value={missionCargo[field]} placeholder="0" onChange={(event) => setMissionCargo((current) => ({ ...current, [field]: event.target.value }))} /><small>{Number((state.resources as any)[field] ?? 0).toLocaleString()} available</small></label>)}</div></>}
          </fieldset>
          <section className={`pw-mission-preflight${canLaunchMission && !missionError ? " is-ready" : " is-blocked"}`} aria-live="polite"><header><div><span>MISSION PREFLIGHT</span><strong>{canLaunchMission && !missionError ? "READY TO LAUNCH" : "ACTION REQUIRED"}</strong></div><b>{availableMissionSlots}/{usableMissionSlots} SLOTS FREE</b></header><div className="pw-mission-preflight-grid"><span><small>ORDER</small><b>{missionName(missionType)}</b></span><span><small>DESTINATION</small><b>{missionTarget.galaxy}:{missionTarget.system}:{missionTarget.position}</b></span><span><small>FLEET</small><b>{selectedMissionShips.toLocaleString()} SHIPS</b></span><span><small>CARGO</small><b>{selectedCargoTotal.toLocaleString()} / {selectedCargoCapacity.toLocaleString()}</b></span><span><small>FUEL</small><b>{estimatedMissionFuel.toLocaleString()} D</b></span><span><small>SPEED</small><b>{missionTarget.speed}%</b></span></div><p className={missionError ? "command-preflight-error" : undefined} role={missionError ? "alert" : undefined}>{missionError || (canLaunchMission ? "Preflight checks passed. Final target checks run before signing." : "Complete the mission requirements above.")}</p></section>
          <CommandActionButton tone="primary" className="pw-launch-action" icon={<Rocket />} pending={pendingCommand === 'launch'} pendingLabel={busy ? 'Launching...' : 'Checking target...'} disabled={busy || pendingCommand !== null || missionChecking || !canLaunchMission} onClick={() => void trackCommand('launch', launchMission)}>{canLaunchMission ? `Launch ${missionName(missionType).toLowerCase()}` : 'Complete preflight'}</CommandActionButton>
        </section>}
      </section>}
    {modal === "alliance" && !allianceLoading && !alliance && allianceOnboardingMode === "discover" && <section className="pw-alliance-discovery">
      {pendingAllianceDirectory.length > 0 && <section className="pw-alliance-directory pw-alliance-pending"><header><span>YOUR APPLICATIONS</span><b>AWAITING APPROVAL</b></header><div>{pendingAllianceDirectory.map((item) => <article key={item.publicKey}><div><h3>{item.name} {item.tag ? `[${item.tag}]` : ""}</h3><p>Your verified request is waiting for an alliance leader.</p></div><strong>PENDING</strong></article>)}</div></section>}
      {allianceDirectory.length > 0 ? <section className="pw-alliance-directory"><header><span>RECRUITING ALLIANCES</span><b>{allianceDirectory.length} AVAILABLE</b></header><div>{allianceDirectory.map((item) => <article key={item.publicKey}><div className="pw-alliance-emblem">{item.tag?.slice(0, 2) || item.name.slice(0, 2)}</div><div><h3>{item.name} {item.tag ? `[${item.tag}]` : ""}</h3><p>Level {item.level} · {item.memberCount} {item.memberCount === 1 ? "member" : "members"} · Live on devnet</p></div><button disabled={busy} onClick={() => void runAllianceAction(`Request to join ${item.name}`, (client) => client.requestJoinAlliance(new PublicKey(item.publicKey)))}>REQUEST MEMBERSHIP</button></article>)}</div></section> : pendingAllianceDirectory.length === 0 && <section className="pw-alliance-empty"><Users /><div><span>NO ALLIANCES RECRUITING</span><h3>Establish the first command network</h3><p>No open alliance is currently available. Create one when your wallet meets the live USDC and ANTIMATTER requirements.</p></div><button type="button" onClick={() => setAllianceOnboardingMode("create")}>REVIEW CREATION REQUIREMENTS</button></section>}
    </section>}
    {modal === "alliance" && !allianceLoading && !alliance && allianceOnboardingMode === "create" && <section className="pw-alliance-onboarding"><header><span>FOUNDING PROTOCOL</span><b>LEADER PATH</b></header><section className="pw-alliance-intro"><h3>Establish a shared command network</h3><p>You become the first leader. Members can contribute resources and ANTIMATTER while shared infrastructure and governance remain verifiable on devnet.</p></section><section className="pw-alliance-create"><div><b>CREATION REQUIREMENTS</b><span>{(Number(ALLIANCE_CREATE_USDC_COST) / 1_000_000).toLocaleString()} USDC + {(Number(ALLIANCE_CREATE_ANTIMATTER_COST) / 1_000_000).toLocaleString()} ANTIMATTER</span></div><div className="pw-alliance-balance"><span className={hasAllianceUsdc ? "met" : "missing"}><img src={usdcCoin} alt="" />{(Number(allianceBalances.usdc) / 1_000_000).toLocaleString()} / {(Number(ALLIANCE_CREATE_USDC_COST) / 1_000_000).toLocaleString()} USDC</span><span className={hasAllianceAntimatter ? "met" : "missing"}>{(Number(allianceBalances.antimatter) / 1_000_000).toLocaleString()} / {(Number(ALLIANCE_CREATE_ANTIMATTER_COST) / 1_000_000).toLocaleString()} AM</span></div><div className="pw-alliance-inputs"><label><span>ALLIANCE NAME</span><input placeholder="Name your alliance" maxLength={32} value={allianceName} onChange={(event) => setAllianceName(event.target.value)} /></label><label><span>COMMAND TAG</span><input placeholder="3 letters" maxLength={3} value={allianceTag} onChange={(event) => setAllianceTag(event.target.value.toUpperCase())} /></label><label><span>EMBLEM IMAGE <small>OPTIONAL</small></span><input placeholder="https://..." maxLength={160} value={allianceImageUrl} onChange={(event) => setAllianceImageUrl(event.target.value)} /></label></div><button disabled={busy || !canCreateAlliance} onClick={() => void createAlliance()}>{!hasAllianceUsdc || !hasAllianceAntimatter ? "FUND REQUIREMENTS TO CONTINUE" : "ESTABLISH ALLIANCE"}</button></section></section>}
      {modal === "alliance" && !allianceLoading && alliance && allianceMembership && <section className="pw-alliance-governance">
        <header><div><span>ANTIMATTER GOVERNANCE</span><h3>Alliance decision console</h3></div><b className={allianceGovernanceMatchesRoot ? "live" : ""}>{allianceGovernanceMatchesRoot && allianceGovernance?.enabled ? "GAMESOL DAO" : "ACTION REQUIRED"}</b></header>
        {!allianceGovernance ? <div className="pw-governance-empty"><p>This alliance is not enrolled in the shared GAMESOL governance system yet. It will use the same ANTIMATTER mint, MetaDAO DAO and Squads executor as every enrolled alliance.</p>{GAMESOL_GOVERNANCE_ROOT_ENABLED && allianceMembership.role === 2 && gamesolGovernance?.enabled && <button disabled={busy} onClick={() => void enrollAllianceGovernance()}>JOIN GAMESOL GOVERNANCE</button>}{GAMESOL_GOVERNANCE_ROOT_ENABLED && allianceMembership.role !== 2 && <p>The alliance leader must complete enrollment.</p>}{!GAMESOL_GOVERNANCE_ROOT_ENABLED && <p>The staged root-governance upgrade has not been activated on this devnet build.</p>}</div> : <>
          {!allianceGovernanceMatchesRoot && <div className="pw-governance-empty"><p>This alliance governance account does not match the GAMESOL DAO root. New proposals are locked until it is synchronized.</p>{allianceMembership.role === 2 ? <button disabled={busy} onClick={() => void syncAllianceGovernance()}>SYNC WITH GAMESOL DAO</button> : <p>The alliance leader must synchronize it.</p>}</div>}
          <div className="pw-governance-identities"><div><span>GAMESOL Futarchy DAO</span><b>{shortAddress(allianceGovernance.dao)}</b></div><div><span>Shared executor</span><b>{shortAddress(allianceGovernance.governanceExecutor)}</b></div><div><span>Registered actions</span><b>{allianceDecisions.length}</b></div></div>
          <div className="pw-governance-form">
            <div className="pw-governance-form-head"><div><b>REGISTER A MARKET-BACKED ACTION</b><p>Bind a live MetaDAO market to one exact, fail-closed game action.</p></div><span>ALLIANCE MEMBERS MAY PROPOSE</span></div>
            <div className="pw-governance-fields">
              <label><span>Action</span><select value={decisionAction} onChange={(event) => setDecisionAction(Number(event.target.value))}><option value={0}>Claim this system</option><option value={1}>Fund this system upkeep</option><option value={2}>Set system specialization</option></select></label>
              {decisionAction !== 1 && <label><span>Specialization</span><select value={decisionSpecialization} onChange={(event) => setDecisionSpecialization(Number(event.target.value))}><option value={0}>None</option><option value={1}>Industrial</option><option value={2}>Research</option><option value={3}>Military</option></select></label>}
              {decisionAction === 0 && <label><span>Vulnerability hour UTC</span><input type="number" min={0} max={23} value={decisionVulnerabilityHour} onChange={(event) => setDecisionVulnerabilityHour(Number(event.target.value))} /></label>}
              <label className="proposal"><span>MetaDAO proposal address</span><input placeholder="Real PENDING Futarchy proposal" value={decisionProposal} onChange={(event) => setDecisionProposal(event.target.value)} /></label>
            </div>
            <div className="pw-governance-target"><span>BOUND TARGET</span><b>G{state.planet.galaxy}:S{state.planet.system} · {state.planet.name}</b><em>The proposal, target, action, parameters and market expiry are permanently recorded on-chain.</em></div>
            {selectedDecisionCost && <section className="pw-governance-cost-preview"><header><span>IF PASSED, ALLIANCE TREASURY SPENDS</span><b className={selectedDecisionFunded ? "funded" : "unfunded"}>{selectedDecisionFunded ? "FUNDED" : "NEEDS RESOURCES"}</b></header><div><GovernanceResourceCost icon="metal" label="Metal" required={selectedDecisionCost.metal} available={allianceTreasury?.metal ?? 0n} /><GovernanceResourceCost icon="crystal" label="Crystal" required={selectedDecisionCost.crystal} available={allianceTreasury?.crystal ?? 0n} /><GovernanceResourceCost icon="deuterium" label="Deuterium" required={selectedDecisionCost.deuterium} available={allianceTreasury?.deuterium ?? 0n} /></div></section>}
            {decisionError && <p className="pw-governance-error">{decisionError}</p>}
            <button disabled={busy || decisionSubmitting || !decisionProposal.trim() || !allianceGovernanceMatchesRoot} onClick={() => void submitAllianceDecision()}>{decisionSubmitting ? "VERIFYING MARKET..." : "VERIFY AND REGISTER ACTION"}</button>
          </div>
          <div className="pw-governance-actions"><header><span>LIVE MARKETS & ACTION LEDGER</span><b>{allianceDecisions.length}</b></header>{allianceDecisions.length === 0 ? <p>No market-backed actions have been registered for this alliance.</p> : allianceDecisions.map((decision) => <AllianceDecisionMarketCard key={decision.publicKey} decision={decision} dao={allianceGovernance.dao} treasury={allianceTreasury} nowTs={nowTs} />)}</div>
          <p className="pw-governance-boundary"><b>WHO CAN DO WHAT</b> Anyone may trade PASS or FAIL. Active alliance members may register official actions. Only the shared GAMESOL Squads executor can execute the recorded action after MetaDAO finalizes it as passed.</p>
        </>}
      </section>}
      </div>
    </section></div>}
    {allianceConfirmation && <div className="pw-confirm-backdrop" onMouseDown={() => setAllianceConfirmation(null)}>
      <section ref={allianceConfirmationRef} className="pw-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="pw-confirm-title" aria-describedby="pw-confirm-detail" onMouseDown={(event) => event.stopPropagation()}>
        <span className="pw-confirm-kicker">ALLIANCE SECURITY CHECK</span>
        <h2 id="pw-confirm-title">{allianceConfirmation.title}</h2>
        <p id="pw-confirm-detail">{allianceConfirmation.detail}</p>
        <div>
          <button ref={allianceConfirmationCancelRef} type="button" onClick={() => setAllianceConfirmation(null)}>KEEP CURRENT ACCESS</button>
          <button type="button" className="danger" disabled={busy} onClick={() => void confirmAllianceAction()}>{allianceConfirmation.confirmLabel}</button>
        </div>
      </section>
    </div>}
  </main>;
}
