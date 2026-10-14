import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { Buffer } from "buffer";
import { accountRentTotal } from './account-rent';

type PrivateSnapshot = {
  resources: unknown;
  buildings: unknown;
  research: unknown;
  fleet: unknown;
  defense: unknown;
};

const nodeEnv = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env ?? {};
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? nodeEnv;
export const SOLANA_CLUSTER = (env.VITE_SOLANA_CLUSTER?.trim() || "devnet").toLowerCase();
export const IS_DEVNET = SOLANA_CLUSTER !== "mainnet" && SOLANA_CLUSTER !== "mainnet-beta";
export const IS_MAINNET = !IS_DEVNET;
export const NETWORK_LABEL = IS_MAINNET ? "MAINNET" : "DEVNET";
export const EXPLORER_CLUSTER = IS_MAINNET ? "mainnet-beta" : "devnet";
const DEFAULT_RPC_ENDPOINT =
  SOLANA_CLUSTER === "mainnet" || SOLANA_CLUSTER === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";

function envPublicKey(name: string, fallback: string): PublicKey {
  const configured = env[name]?.trim();
  if (!configured && (SOLANA_CLUSTER === "mainnet" || SOLANA_CLUSTER === "mainnet-beta")) {
    throw new Error(`${name} is required when VITE_SOLANA_CLUSTER=mainnet.`);
  }
  const value = configured || fallback;
  return new PublicKey(value);
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const GAME_STATE_PROGRAM_ID = envPublicKey(
  "VITE_GAME_STATE_PROGRAM_ID",
  "J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq",
);

export const MARKET_PROGRAM_ID = envPublicKey(
  "VITE_MARKET_PROGRAM_ID",
  "6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA",
);
const CONFIGURED_RPC_ENDPOINT = env.VITE_SOLANA_RPC_ENDPOINT?.trim() || DEFAULT_RPC_ENDPOINT;
// Solana web3 and LazorKit both require an absolute URL. Resolve the local
// same-origin proxy path without exposing its server-side provider target.
export const RPC_ENDPOINT = CONFIGURED_RPC_ENDPOINT.startsWith("/") && typeof window !== "undefined"
  ? new URL(CONFIGURED_RPC_ENDPOINT, window.location.origin).toString()
  : CONFIGURED_RPC_ENDPOINT;
export const IS_SHARED_PUBLIC_RPC = env.VITE_RPC_SHARED_PUBLIC === "true"
  || /api\.devnet\.solana\.com/i.test(RPC_ENDPOINT);
const CONFIGURED_WS_ENDPOINT = env.VITE_SOLANA_WS_ENDPOINT?.trim();
export const WS_ENDPOINT = CONFIGURED_WS_ENDPOINT?.startsWith("/") && typeof window !== "undefined"
  ? new URL(CONFIGURED_WS_ENDPOINT, window.location.origin).toString().replace(/^http:/, "ws:").replace(/^https:/, "wss:")
  : CONFIGURED_WS_ENDPOINT;
// Sovereignty writes stay fail-closed until the experimental game-state binary
// has been deployed and the preview environment explicitly opts in.
export const SOVEREIGNTY_WRITES_ENABLED = env.VITE_SOVEREIGNTY_WRITES_ENABLED === "true";
// Enabled only after the game-state binary containing the shared GAMESOL
// governance root has been deployed. Keeping this separate preserves the
// currently deployed devnet instruction layouts during staged rollout.
export const GAMESOL_GOVERNANCE_ROOT_ENABLED = env.VITE_GAMESOL_GOVERNANCE_ROOT_ENABLED === "true";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
// Isolated sovereignty devnet economics; the production build keeps its
// original alliance-creation threshold.
export const ALLIANCE_CREATE_USDC_COST = 100_000_000n;
export const ALLIANCE_CREATE_ANTIMATTER_COST = 5_000_000_000n;
export const ALLIANCE_CREATE_ANTIMATTER_BURN = 2_500_000_000n;
export const ALLIANCE_CREATE_ANTIMATTER_TREASURY = 2_500_000_000n;
export const SYSTEM_SOVEREIGNTY_ACTION_COSTS = [
  { metal: 100n, crystal: 50n, deuterium: 25n },
  { metal: 25n, crystal: 15n, deuterium: 10n },
  { metal: 20n, crystal: 20n, deuterium: 10n },
] as const;

// The vault pays rent for the player profile, homeworld, coordinate and quest
// accounts. A 0.02 SOL float can be exhausted during first-world creation.
const VAULT_MIN_BALANCE_LAMPORTS = 50_000_000;
const VAULT_TARGET_BALANCE_LAMPORTS = 100_000_000;
const DEFAULT_TX_COMPUTE_UNITS = 250_000;
const DEFAULT_PRIORITY_FEE_MICROLAMPORTS = 0;
const RPC_ACCOUNT_BATCH_SIZE = 100;
const VAULT_BACKUP_VERSION = 1;
const PASSKEY_VAULT_BACKUP_VERSION = 2;
const VAULT_RECOVERY_MESSAGE_PREFIX = "GAMESOL vault recovery v1";
const ACCOUNT_SPACE = {
  lazorPlayer: 67,
  playerProfile: 45,
  authorizedVault: 82,
  planetState: 1_002,
  planetCoords: 94,
  planetOwnerIndex: 78,
  planetOwnershipRegistry: 105,
  questState: 119,
  questProgress: 157,
  questRewardTargets: 649,
  tutorialQuestRewardTargets: 721,
  storePurchaseState: 97,
  allianceState: 103,
  allianceMetadata: 204,
  allianceTreasury: 109,
  allianceMembership: 130,
  allianceJoinRequest: 81,
  systemSovereignty: 104,
  allianceGovernanceConfig: 147,
  allianceDecision: 178,
} as const;

// Max attempts for homeworld random coord selection before giving up
const HOMEWORLD_MAX_COORD_ATTEMPTS = 20;

// ─── Discriminators ───────────────────────────────────────────────────────────
const PLAYER_PROFILE_DISCRIMINATOR = Buffer.from([82, 226, 99, 87, 164, 130, 181, 80]);
const LAZOR_PLAYER_PROFILE_DISCRIMINATOR = Buffer.from([90, 113, 232, 180, 120, 31, 20, 37]);
const PLANET_STATE_DISCRIMINATOR   = Buffer.from([1, 25, 230, 69, 194, 252, 152, 240]);
const PLANET_COORDS_DISCRIMINATOR  = Buffer.from([227, 189, 46, 7, 82, 27, 239, 25]);
const PLANET_OWNER_INDEX_DISCRIMINATOR = Buffer.from([103, 123, 167, 42, 197, 211, 167, 19]);
const PUBLIC_PLANET_STATE_DISCRIMINATOR = Buffer.from([61, 168, 213, 170, 12, 18, 66, 158]);
const AUTHORIZED_VAULT_DISCRIMINATOR = Buffer.from([224, 162, 234, 3, 170, 103, 243, 244]);
const VAULT_BACKUP_DISCRIMINATOR     = Buffer.from([167, 172, 2, 221, 196, 20, 199, 27]);
const GAME_CONFIG_DISCRIMINATOR      = Buffer.from([45, 146, 146, 33, 170, 69, 96, 133]);
const QUEST_STATE_DISCRIMINATOR      = Buffer.from([91, 149, 47, 55, 121, 144, 93, 66]);
const QUEST_PROGRESS_STATE_DISCRIMINATOR = Buffer.from([171, 27, 80, 9, 167, 242, 144, 222]);
const QUEST_REWARD_TARGET_STATE_DISCRIMINATOR = Buffer.from([102, 104, 150, 163, 193, 213, 114, 73]);
const STORE_CONFIG_DISCRIMINATOR     = Buffer.from([108, 23, 66, 65, 67, 124, 167, 135]);
const STORE_PURCHASE_STATE_DISCRIMINATOR = Buffer.from([98, 26, 131, 62, 86, 147, 141, 175]);
const ALLIANCE_STATE_DISCRIMINATOR = Buffer.from([177, 12, 51, 254, 131, 106, 170, 219]);
const ALLIANCE_METADATA_DISCRIMINATOR = Buffer.from([72, 120, 236, 103, 72, 139, 9, 252]);
const ALLIANCE_TREASURY_STATE_DISCRIMINATOR = Buffer.from([147, 99, 224, 142, 178, 22, 232, 94]);
const ALLIANCE_MEMBERSHIP_DISCRIMINATOR = Buffer.from([126, 58, 186, 213, 41, 116, 92, 8]);
const ALLIANCE_JOIN_REQUEST_DISCRIMINATOR = Buffer.from([63, 14, 157, 153, 45, 39, 160, 253]);
const SYSTEM_SOVEREIGNTY_DISCRIMINATOR = Buffer.from([215, 236, 143, 227, 48, 124, 215, 73]);
const ALLIANCE_GOVERNANCE_CONFIG_DISCRIMINATOR = Buffer.from([157, 79, 189, 209, 176, 183, 145, 232]);
const GAMESOL_GOVERNANCE_CONFIG_DISCRIMINATOR = Buffer.from([94, 94, 109, 157, 51, 156, 231, 97]);
const ALLIANCE_DECISION_DISCRIMINATOR = Buffer.from([173, 215, 229, 54, 8, 55, 214, 37]);
const BATTLE_RESOLVED_EVENT_DISCRIMINATOR = Buffer.from([205, 161, 192, 151, 125, 116, 201, 210]);
const ESPIONAGE_REPORT_EVENT_DISCRIMINATOR = Buffer.from([232, 103, 204, 173, 23, 198, 156, 251]);

function storePackPriceUsdc(period: number, packId: number): bigint {
  if (period === 1 && packId === 0) return 1_000_000n;
  if (period === 1 && packId === 1) return 1_000_000n;
  if (period === 1 && packId === 2) return 1_000_000n;
  if (period === 1 && packId === 3) return 3_000_000n;
  if (period === 1 && packId === 4) return 5_000_000n;
  if (period === 1 && packId === 5) return 7_500_000n;
  if (period === 1 && packId === 16) return 1_000_000n;
  if (period === 2 && packId === 0) return 5_000_000n;
  if (period === 2 && packId === 1) return 5_000_000n;
  if (period === 2 && packId === 2) return 5_000_000n;
  if (period === 2 && packId === 3) return 15_000_000n;
  if (period === 2 && packId === 4) return 30_000_000n;
  if (period === 2 && packId === 5) return 45_000_000n;
  if (period === 2 && packId === 16) return 5_000_000n;
  if (period === 3 && packId === 0) return 20_000_000n;
  if (period === 3 && packId === 1) return 20_000_000n;
  if (period === 3 && packId === 2) return 20_000_000n;
  if (period === 3 && packId === 3) return 60_000_000n;
  if (period === 3 && packId === 4) return 100_000_000n;
  if (period === 3 && packId === 5) return 150_000_000n;
  if (period === 3 && packId === 6) return 200_000_000n;
  if (period === 3 && packId === 7) return 250_000_000n;
  if (period === 3 && packId === 8) return 300_000_000n;
  if (period === 3 && packId === 9) return 400_000_000n;
  if (period === 3 && packId === 16) return 12_500_000n;
  throw new Error("Unsupported store pack.");
}

// ─── Instruction Discriminators ───────────────────────────────────────────────
// NOTE: These must be updated after `anchor build` generates the new IDL.
// Run: cat target/idl/game_state.json | jq '.instructions[] | {name, discriminator}'
const IX = {
  initializeLazorPlayer:  Buffer.from([189, 138, 205, 113, 18, 169, 30, 95]),
  sponsorAccountRent:     Buffer.from([87, 113, 100, 97, 218, 156, 201, 21]),
  initializePlayer:       Buffer.from([79, 249, 88, 177, 220, 62, 56, 128]),
  initializeVaultForExistingPlayer: Buffer.from([46, 80, 37, 158, 31, 200, 162, 11]),
  rotateVault:            Buffer.from([192, 205, 175, 133, 189, 211, 141, 109]),
  revokeVault:            Buffer.from([199, 172, 226, 172, 196, 244, 179, 103]),
  extendVault:            Buffer.from([176, 167, 130, 249, 196, 63, 158, 200]),
  initializeHomeworld:    Buffer.from([124, 7, 81, 167, 80, 191, 227, 173]),
  initializeColony:       Buffer.from([91, 184, 105, 243, 90, 175, 137, 217]),
  syncPlanetOwnerIndexVault: Buffer.from([92, 123, 38, 77, 103, 248, 235, 73]),
  initializeQuestState:   Buffer.from([228, 241, 34, 120, 153, 28, 158, 130]),
  initializeQuestProgress: Buffer.from([180, 174, 237, 53, 63, 6, 200, 222]),
  initializeQuestRewardTargets: Buffer.from([248, 232, 250, 30, 79, 249, 214, 115]),
  dailyCheckIn:           Buffer.from([98, 111, 198, 206, 70, 84, 67, 98]),
  dailyCheckInVault:      Buffer.from([19, 45, 28, 31, 198, 108, 54, 148]),
  claimQuest:             Buffer.from([38, 197, 33, 123, 0, 108, 206, 161]),
  claimQuestVault:        Buffer.from([107, 32, 162, 80, 40, 247, 200, 122]),
  createAlliance:         Buffer.from([201, 92, 183, 64, 131, 82, 174, 203]),
  joinAlliance:           Buffer.from([237, 35, 212, 158, 181, 98, 153, 166]),
  requestJoinAlliance:    Buffer.from([120, 1, 199, 157, 103, 240, 194, 241]),
  requestJoinAllianceVault: Buffer.from([194, 192, 5, 193, 32, 45, 240, 140]),
  approveJoinRequest:     Buffer.from([155, 51, 199, 71, 35, 84, 237, 59]),
  rejectJoinRequest:      Buffer.from([82, 16, 45, 213, 231, 147, 56, 127]),
  expelAllianceMember:    Buffer.from([169, 245, 62, 100, 232, 190, 127, 220]),
  transferAllianceLeadership: Buffer.from([189, 125, 244, 81, 135, 19, 204, 2]),
  leaveAlliance:          Buffer.from([224, 61, 93, 128, 148, 155, 98, 231]),
  initializeAllianceTreasury: Buffer.from([60, 88, 8, 162, 213, 206, 46, 178]),
  initializeAllianceTreasuryVault: Buffer.from([47, 188, 187, 250, 22, 115, 107, 127]),
  depositAllianceResources: Buffer.from([64, 70, 103, 74, 35, 162, 164, 162]),
  depositAllianceResourcesVault: Buffer.from([239, 141, 68, 29, 218, 136, 41, 7]),
  upgradeAllianceBuilding: Buffer.from([41, 29, 72, 215, 26, 86, 132, 34]),
  claimSystemSovereignty: Buffer.from([213, 200, 82, 25, 118, 156, 175, 121]),
  fundSystemSovereignty: Buffer.from([21, 251, 12, 12, 181, 217, 230, 134]),
  setSystemSovereigntySpecialization: Buffer.from([182, 18, 209, 245, 111, 99, 24, 19]),
  createAllianceDecision: Buffer.from([2, 217, 240, 33, 148, 170, 13, 111]),
  executeAllianceDecision: Buffer.from([141, 188, 88, 64, 234, 213, 2, 166]),
  enrollAllianceInGamesolGovernance: Buffer.from([46, 144, 196, 52, 81, 71, 246, 16]),
  syncAllianceGamesolGovernance: Buffer.from([227, 29, 80, 74, 132, 181, 233, 51]),

  produce:                Buffer.from([240, 243, 185, 55, 195, 151, 136, 205]),
  produceVault:           Buffer.from([228, 109, 51, 38, 151, 15, 255, 118]),

  startBuild:             Buffer.from([243, 32, 82, 71, 153, 119, 168, 6]),
  startBuildVault:        Buffer.from([140, 114, 250, 69, 2, 108, 3, 53]),

  finishBuild:            Buffer.from([67, 114, 22, 130, 241, 73, 183, 140]),
  finishBuildVault:       Buffer.from([89, 229, 199, 13, 162, 120, 161, 12]),

  startResearch:          Buffer.from([175, 179, 153, 18, 254, 39, 12, 126]),
  startResearchVault:     Buffer.from([239, 63, 88, 186, 249, 81, 76, 47]),

  finishResearch:         Buffer.from([213, 3, 235, 30, 13, 68, 227, 86]),
  finishResearchVault:    Buffer.from([172, 70, 116, 130, 96, 39, 20, 130]),

  buildShip:              Buffer.from([213, 16, 198, 123, 106, 214, 120, 157]),
  buildShipVault:         Buffer.from([76, 50, 77, 203, 109, 0, 245, 222]),

  finishShipBuild:        Buffer.from([95, 62, 255, 233, 232, 122, 224, 23]),
  finishShipBuildVault:   Buffer.from([191, 208, 60, 173, 69, 244, 125, 195]),

  buildDefense:           Buffer.from([187, 0, 140, 48, 98, 96, 110, 21]),
  buildDefenseVault:      Buffer.from([250, 214, 5, 208, 91, 68, 81, 34]),
  finishDefenseBuild:     Buffer.from([31, 32, 15, 101, 243, 146, 238, 193]),
  finishDefenseBuildVault: Buffer.from([172, 250, 106, 201, 205, 8, 82, 167]),

  launchFleet:            Buffer.from([54, 168, 21, 184, 175, 6, 32, 5]),
  launchFleetVault:       Buffer.from([11, 245, 64, 137, 202, 190, 124, 7]),

  resolveTransport:       Buffer.from([123, 85, 232, 96, 135, 53, 52, 32]),
  resolveTransportVault:  Buffer.from([168, 164, 6, 82, 122, 24, 118, 35]),
  resolveTransportEmpty:  Buffer.from([11, 148, 12, 64, 192, 185, 94, 126]),
  resolveTransportEmptyVault: Buffer.from([122, 88, 238, 190, 70, 125, 222, 175]),

  resolveAttack:          Buffer.from([77, 153, 65, 199, 69, 106, 169, 209]),
  resolveAttackVault:     Buffer.from([98, 245, 31, 242, 130, 131, 221, 205]),
  resolveEspionage:       Buffer.from([116, 130, 201, 146, 84, 49, 161, 144]),
  resolveEspionageVault:  Buffer.from([175, 197, 212, 44, 75, 2, 44, 66]),

  resolveColonize:        Buffer.from([229, 191, 212, 205, 242, 178, 50, 79]),
  resolveColonizeVault:   Buffer.from([144, 28, 197, 235, 65, 250, 241, 88]),

  // NOTE: update after anchor build
  transferPlanet:         Buffer.from([232, 252, 120, 248, 25, 87, 134, 149]),
  initializeGameConfig:   Buffer.from([45, 61, 80, 55, 152, 63, 158, 47]),
  updateAntimatterMint:   Buffer.from([109, 33, 55, 58, 48, 116, 144, 219]),
  accelerateBuildWithAntimatter: Buffer.from([214, 108, 93, 196, 157, 250, 5, 38]),
  accelerateResearchWithAntimatter: Buffer.from([3, 138, 193, 93, 109, 41, 36, 73]),
  accelerateShipBuildWithAntimatter: Buffer.from([144, 20, 132, 188, 15, 71, 35, 74]),
  accelerateDefenseBuildWithAntimatter: Buffer.from([106, 220, 109, 50, 191, 203, 96, 78]),
  accelerateMissionWithAntimatter: Buffer.from([35, 144, 155, 162, 180, 188, 237, 220]),
  initializeStoreConfig: Buffer.from([231, 234, 72, 35, 116, 218, 119, 251]),
  updateStoreConfig: Buffer.from([207, 88, 146, 207, 46, 108, 147, 209]),
  purchaseStorePack: Buffer.from([112, 75, 157, 242, 238, 109, 2, 252]),
} as const;

// ─── Layout constants ─────────────────────────────────────────────────────────
const MAX_MISSIONS = 4;
const MAX_PLANET_NAME_LEN = 32;
const MAX_MISSION_COLONY_NAME_LEN = 32;
const MAX_ALLIANCE_NAME_LEN = 32;
const MAX_ALLIANCE_TAG_LEN = 3;
const MAX_ALLIANCE_IMAGE_URL_LEN = 160;

// ─── Public interfaces ────────────────────────────────────────────────────────
export interface Mission {
  missionType: number;
  destination: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  colonyName: string;
  departTs: number;
  arriveTs: number;
  returnTs: number;
  sSmallCargo: number;
  sLargeCargo: number;
  sLightFighter: number;
  sHeavyFighter: number;
  sCruiser: number;
  sBattleship: number;
  sBattlecruiser: number;
  sBomber: number;
  sDestroyer: number;
  sDeathstar: number;
  sRecycler: number;
  sEspionageProbe: number;
  sColonyShip: number;
  cargoMetal: bigint;
  cargoCrystal: bigint;
  cargoDeuterium: bigint;
  applied: boolean;
  speedFactor: number;
  combatRounds: number;
  attackerWon: boolean;
}

export interface BattleResolvedEvent {
  sourcePlanet: string;
  destinationPlanet: string;
  attacker: string;
  defender: string;
  sourceGalaxy: number;
  sourceSystem: number;
  sourcePosition: number;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  resolvedAt: number;
  missionSlot: number;
  combatRounds: number;
  attackerWon: boolean;
  attackerDestroyed: boolean;
  defenderSurvived: boolean;
  lootMetal: bigint;
  lootCrystal: bigint;
  lootDeuterium: bigint;
  debrisMetal: bigint;
  debrisCrystal: bigint;
  recycledMetal: bigint;
  recycledCrystal: bigint;
  attackerSmallCargo: number;
  attackerLargeCargo: number;
  attackerLightFighter: number;
  attackerHeavyFighter: number;
  attackerCruiser: number;
  attackerBattleship: number;
  attackerBattlecruiser: number;
  attackerBomber: number;
  attackerDestroyer: number;
  attackerDeathstar: number;
  attackerRecycler: number;
  attackerEspionageProbe: number;
  attackerColonyShip: number;
}

export interface BattleResolvedEventRecord {
  signature: string;
  slot: number;
  blockTime: number | null;
  event: BattleResolvedEvent;
}

export interface EspionageReportEvent {
  sourcePlanet: string;
  destinationPlanet: string;
  attacker: string;
  defender: string;
  sourceGalaxy: number;
  sourceSystem: number;
  sourcePosition: number;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  resolvedAt: number;
  missionSlot: number;
  revealLevel: number;
  probesSent: number;
  probesSurvived: number;
  probesLost: number;
  sensorScore: bigint;
  counterScore: bigint;
  reportedMetal: bigint;
  reportedCrystal: bigint;
  reportedDeuterium: bigint;
  reportedBuildingScore: bigint;
  reportedFleetPoints: bigint;
  reportedDefensePoints: bigint;
  reportedWeaponsTechnology: number;
  reportedShieldingTechnology: number;
  reportedArmorTechnology: number;
}

export interface EspionageReportEventRecord {
  signature: string;
  slot: number;
  blockTime: number | null;
  event: EspionageReportEvent;
}

export interface Planet {
  creator: string;
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
  usedFields: number;
  createdAt: number;
  protectionUntilTs: number;
  marketUnlockedAt: number;
  attackUnlockedAt: number;
  lastAttackLaunchTs: number;
  lastAttackedTs: number;
  metalMine: number;
  crystalMine: number;
  deuteriumSynthesizer: number;
  solarPlant: number;
  fusionReactor: number;
  roboticsFactory: number;
  naniteFactory: number;
  shipyard: number;
  metalStorage: number;
  crystalStorage: number;
  deuteriumTank: number;
  researchLab: number;
  missileSilo: number;
  weaponsTechnology: number;
  shieldingTechnology: number;
  armorTechnology: number;
  buildQueueItem: number;
  buildQueueTarget: number;
  buildFinishTs: number;
  shipBuildItem: number;
  shipBuildQty: number;
  shipBuildFinishTs: number;
  defenseBuildItem: number;
  defenseBuildQty: number;
  defenseBuildFinishTs: number;
  rocketLauncher: number;
  lightLaser: number;
  heavyLaser: number;
  gaussCannon: number;
  ionCannon: number;
  plasmaTurret: number;
  smallShieldDome: number;
  largeShieldDome: number;
  antiBallisticMissile: number;
  interplanetaryMissile: number;
}

export interface PublicPlanetInfo {
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
}

export interface UniverseMapPlanetInfo {
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
  metal: bigint;
  crystal: bigint;
  deuterium: bigint;
  smallCargo: number;
  largeCargo: number;
  lightFighter: number;
  heavyFighter: number;
  cruiser: number;
  battleship: number;
  battlecruiser: number;
  bomber: number;
  destroyer: number;
  deathstar: number;
  missions: Mission[];
}

export interface Research {
  creator: string;
  energyTech: number;
  combustionDrive: number;
  impulseDrive: number;
  hyperspaceDrive: number;
  computerTech: number;
  astrophysics: number;
  igrNetwork: number;
  weaponsTechnology: number;
  shieldingTechnology: number;
  armorTechnology: number;
  queueItem: number;
  queueTarget: number;
  researchFinishTs: number;
}

export interface Resources {
  metal: bigint;
  crystal: bigint;
  deuterium: bigint;
  metalHour: bigint;
  crystalHour: bigint;
  deuteriumHour: bigint;
  energyProduction: bigint;
  energyConsumption: bigint;
  metalCap: bigint;
  crystalCap: bigint;
  deuteriumCap: bigint;
  lastUpdateTs: number;
}

export interface Fleet {
  creator: string;
  smallCargo: number;
  largeCargo: number;
  lightFighter: number;
  heavyFighter: number;
  cruiser: number;
  battleship: number;
  battlecruiser: number;
  bomber: number;
  destroyer: number;
  deathstar: number;
  recycler: number;
  espionageProbe: number;
  colonyShip: number;
  solarSatellite: number;
  activeMissions: number;
  missions: Mission[];
}

export interface PlayerState {
  planet: Planet;
  resources: Resources;
  fleet: Fleet;
  research: Research;
  entityPda: string;
  planetPda: string;
  fleetPda: string;
  resourcesPda: string;
  researchPda: string;
  isDelegated: boolean;
}

export interface VaultRecoveryPromptRequest {
  mode: "create" | "unlock";
  wallet: string;
}

export interface GameConfigState {
  admin: string;
  antimatterMint: string;
}

export type VaultRecoveryPromptHandler = (request: VaultRecoveryPromptRequest) => Promise<string>;

export interface LaunchFleetTarget {
  galaxy: number;
  system: number;
  position: number;
  colonyName?: string;
}

export type ProgressReporter = (message: string) => void;

export type GameplayVaultAuthorization = "session" | "passkey";

/**
 * Executes instructions through a programmable smart-wallet vault. The
 * `vaultPublicKey` is the PDA that GAMESOL authorizes and that LazorKit marks
 * as a signer during CPI; it is intentionally not a browser Keypair.
 */
export interface GameplayVaultExecutor {
  vaultPublicKey: PublicKey;
  payerPublicKey: PublicKey;
  execute(
    instructions: TransactionInstruction[],
    authorization: GameplayVaultAuthorization,
  ): Promise<string>;
}

export type VaultStatus =
  | "ready"              // vault keypair loaded and funded
  | "not_initialized"   // no player profile on-chain yet
  | "backup_missing"    // player exists but no on-chain backup found
  | "wrong_password"    // backup found but decryption failed
  | "loading";          // still resolving

interface GameClientOptions {
  requestVaultRecoveryPassphrase?: VaultRecoveryPromptHandler;
  onVaultRecoveryPassphraseRejected?: (wallet: string) => void;
}

// ─── Internal account types ───────────────────────────────────────────────────
interface PlayerProfileAccount {
  authority: PublicKey;
  planetCount: number;
}

export interface QuestStateAccount {
  authority: PublicKey;
  tutorialClaimedMask: bigint;
  dailyEpoch: number;
  weeklyEpoch: number;
  monthlyEpoch: number;
  dailyClaimedMask: bigint;
  weeklyClaimedMask: bigint;
  monthlyClaimedMask: bigint;
  dailyCheckinDay: number;
  dailyCheckinStreak: number;
  totalCheckins: number;
  lastUpdatedTs: number;
  bump: number;
}

export interface QuestProgressStateAccount {
  authority: PublicKey;
  dailyEpoch: number;
  weeklyEpoch: number;
  monthlyEpoch: number;
  dailyStorePacksBought: number;
  weeklyStorePacksBought: number;
  monthlyStorePacksBought: number;
  dailyAntimatterSpent: bigint;
  weeklyAntimatterSpent: bigint;
  monthlyAntimatterSpent: bigint;
  dailyPlanetsColonized: number;
  weeklyPlanetsColonized: number;
  monthlyPlanetsColonized: number;
  dailyAttacksResolved: number;
  weeklyAttacksResolved: number;
  monthlyAttacksResolved: number;
  dailyTransportsResolved: number;
  weeklyTransportsResolved: number;
  monthlyTransportsResolved: number;
  dailySpyMissionsResolved: number;
  weeklySpyMissionsResolved: number;
  monthlySpyMissionsResolved: number;
  lastUpdatedTs: number;
  bump: number;
}

export interface QuestRewardTargetStateAccount {
  authority: PublicKey;
  dailyEpoch: number;
  weeklyEpoch: number;
  monthlyEpoch: number;
  dailyStorePacksPlanet: PublicKey;
  weeklyStorePacksPlanet: PublicKey;
  monthlyStorePacksPlanet: PublicKey;
  dailyAntimatterPlanet: PublicKey;
  weeklyAntimatterPlanet: PublicKey;
  monthlyAntimatterPlanet: PublicKey;
  dailyColonizedPlanet: PublicKey;
  weeklyColonizedPlanet: PublicKey;
  monthlyColonizedPlanet: PublicKey;
  dailyAttacksPlanet: PublicKey;
  weeklyAttacksPlanet: PublicKey;
  monthlyAttacksPlanet: PublicKey;
  dailyTransportsPlanet: PublicKey;
  weeklyTransportsPlanet: PublicKey;
  monthlyTransportsPlanet: PublicKey;
  dailySpyPlanet: PublicKey;
  weeklySpyPlanet: PublicKey;
  monthlySpyPlanet: PublicKey;
  lastUpdatedTs: number;
  bump: number;
}

export interface StoreConfigState {
  admin: string;
  usdcMint: string;
  treasuryUsdcAccount: string;
  enabled: boolean;
}

export interface StorePurchaseStateAccount {
  authority: string;
  dailyEpoch: number;
  weeklyEpoch: number;
  monthlyEpoch: number;
  dailyPurchasedMask: bigint;
  weeklyPurchasedMask: bigint;
  monthlyPurchasedMask: bigint;
  lastUpdatedTs: number;
  bump: number;
}

export interface AllianceStateAccount {
  publicKey: string;
  founder: string;
  name: string;
  tag?: string;
  imageUrl?: string;
  level: number;
  xp: bigint;
  memberCount: number;
  maxMembers: number;
  totalMissionsCompleted: bigint;
  createdAt: number;
  bump: number;
}

export interface AllianceMetadataAccount {
  publicKey: string;
  alliance: string;
  tag: string;
  imageUrl: string;
  bump: number;
}

export interface AllianceTreasuryStateAccount {
  publicKey: string;
  alliance: string;
  metal: bigint;
  crystal: bigint;
  deuterium: bigint;
  antimatter: bigint;
  logisticsHub: number;
  researchGrid: number;
  defenseCoordination: number;
  tradeNetwork: number;
  totalMetalDeposited: bigint;
  totalCrystalDeposited: bigint;
  totalDeuteriumDeposited: bigint;
  totalAntimatterDeposited: bigint;
  bump: number;
}

export interface AllianceMembershipAccount {
  authority: string;
  alliance: string;
  role: number;
  joinedAt: number;
  dailyEpoch: number;
  weeklyEpoch: number;
  monthlyEpoch: number;
  dailyClaimedMask: bigint;
  weeklyClaimedMask: bigint;
  monthlyClaimedMask: bigint;
  bump: number;
}

export interface AllianceJoinRequestAccount {
  publicKey: string;
  applicant: string;
  alliance: string;
  createdAt: number;
  bump: number;
}

export interface SystemSovereigntyAccount {
  publicKey: string;
  version: number;
  alliance: string;
  claimantPlanet: string;
  galaxy: number;
  system: number;
  specialization: number;
  vulnerabilityHourUtc: number;
  claimedAt: number;
  upkeepPaidUntil: number;
  updatedAt: number;
  bump: number;
}

export interface AllianceGovernanceConfigAccount {
  publicKey: string;
  version: number;
  alliance: string;
  antimatterMint: string;
  dao: string;
  governanceExecutor: string;
  enabled: boolean;
  proposalCount: bigint;
  bump: number;
}

export interface GamesolGovernanceConfigAccount {
  publicKey: string;
  version: number;
  antimatterMint: string;
  dao: string;
  governanceExecutor: string;
  enabled: boolean;
  bump: number;
}

export interface AllianceDecisionAccount {
  publicKey: string;
  version: number;
  id: bigint;
  alliance: string;
  proposer: string;
  externalProposal: string;
  action: number;
  targetPlanet: string;
  galaxy: number;
  system: number;
  specialization: number;
  vulnerabilityHourUtc: number;
  createdAt: number;
  expiresAt: number;
  executedAt: number;
  executed: boolean;
  bump: number;
}

interface PlanetStateAccount {
  authority: PublicKey;
  player: PublicKey;
  planetIndex: number;
  galaxy: number;
  system: number;
  position: number;
  name: string;
  diameter: number;
  temperature: number;
  maxFields: number;
  usedFields: number;
  metalMine: number;
  crystalMine: number;
  deuteriumSynthesizer: number;
  solarPlant: number;
  fusionReactor: number;
  roboticsFactory: number;
  naniteFactory: number;
  shipyard: number;
  metalStorage: number;
  crystalStorage: number;
  deuteriumTank: number;
  researchLab: number;
  missileSilo: number;
  energyTech: number;
  combustionDrive: number;
  impulseDrive: number;
  hyperspaceDrive: number;
  computerTech: number;
  astrophysics: number;
  igrNetwork: number;
  weaponsTechnology: number;
  shieldingTechnology: number;
  armorTechnology: number;
  researchQueueItem: number;
  researchQueueTarget: number;
  researchFinishTs: number;
  buildQueueItem: number;
  buildQueueTarget: number;
  buildFinishTs: number;
  shipBuildItem: number;
  shipBuildQty: number;
  shipBuildFinishTs: number;
  metal: bigint;
  crystal: bigint;
  deuterium: bigint;
  metalHour: bigint;
  crystalHour: bigint;
  deuteriumHour: bigint;
  energyProduction: bigint;
  energyConsumption: bigint;
  metalCap: bigint;
  crystalCap: bigint;
  deuteriumCap: bigint;
  lastUpdateTs: number;
  createdAt: number;
  protectionUntilTs: number;
  marketUnlockedAt: number;
  attackUnlockedAt: number;
  lastAttackLaunchTs: number;
  lastAttackedTs: number;
  smallCargo: number;
  largeCargo: number;
  lightFighter: number;
  heavyFighter: number;
  cruiser: number;
  battleship: number;
  battlecruiser: number;
  bomber: number;
  destroyer: number;
  deathstar: number;
  recycler: number;
  espionageProbe: number;
  colonyShip: number;
  solarSatellite: number;
  rocketLauncher: number;
  lightLaser: number;
  heavyLaser: number;
  gaussCannon: number;
  ionCannon: number;
  plasmaTurret: number;
  smallShieldDome: number;
  largeShieldDome: number;
  antiBallisticMissile: number;
  interplanetaryMissile: number;
  activeMissions: number;
  missions: Mission[];
  defenseBuildItem: number;
  defenseBuildQty: number;
  defenseBuildFinishTs: number;
}

interface PublicPlanetStateAccount {
  authority: PublicKey;
  player: PublicKey;
  planetIndex: number;
  galaxy: number;
  system: number;
  position: number;
  version: number;
  name: string;
  createdAt: number;
}

interface PlanetOwnerIndexAccount {
  authority: PublicKey;
  slot: number;
  planet: PublicKey;
  active: boolean;
  bump: number;
}

interface AuthorizedVaultAccount {
  authority: PublicKey;
  vault: PublicKey;
  expiresAt: number;
  revoked: boolean;
  bump: number;
}

interface VaultBackupAccount {
  authority: PublicKey;
  vault: PublicKey;
  version: number;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  kdfSalt: Uint8Array;
  updatedAt: number;
  bump: number;
}

interface GameConfigAccount {
  admin: PublicKey;
  antimatterMint: PublicKey;
  bump: number;
}

// ─── Borsh Writer ─────────────────────────────────────────────────────────────
class BorshWriter {
  private chunks: Buffer[] = [];

  writeU8(value: number): void { this.chunks.push(Buffer.from([value & 0xff])); }
  writeU16(value: number): void { const b = Buffer.alloc(2); b.writeUInt16LE(value, 0); this.chunks.push(b); }
  writeU32(value: number): void { const b = Buffer.alloc(4); b.writeUInt32LE(value, 0); this.chunks.push(b); }
  writeI64(value: number): void { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(value), 0); this.chunks.push(b); }
  writeU64(value: bigint | number): void { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value), 0); this.chunks.push(b); }
  writeBytes(value: Uint8Array): void { this.writeU32(value.length); this.chunks.push(Buffer.from(value)); }
  writeFixedBytes(value: Uint8Array): void { this.chunks.push(Buffer.from(value)); }
  writeString(value: string): void {
    const bytes = Buffer.from(value, "utf8");
    this.writeU32(bytes.length);
    this.chunks.push(bytes);
  }
  toBuffer(): Buffer { return Buffer.concat(this.chunks); }
}

// ─── Borsh Readers ────────────────────────────────────────────────────────────
function readU8(d: Buffer, o: number): number { return d.readUInt8(o); }
function readU16(d: Buffer, o: number): number { return d.readUInt16LE(o); }
function readU32(d: Buffer, o: number): number { return d.readUInt32LE(o); }
function readU64(d: Buffer, o: number): bigint { return d.readBigUInt64LE(o); }
function readI16(d: Buffer, o: number): number { return d.readInt16LE(o); }
function readI64(d: Buffer, o: number): number { return Number(d.readBigInt64LE(o)); }
function readPubkeyRaw(d: Buffer, o: number): PublicKey { return new PublicKey(d.slice(o, o + 32)); }
function readFixedString(data: Buffer, offset: number, length: number): string {
  return Buffer.from(data.slice(offset, offset + length)).toString("utf8").replace(/\0/g, "").trim();
}

function decodeBattleResolvedEvent(data: Buffer): BattleResolvedEvent | null {
  const oldEventSize = 251;
  const currentEventSize = 267;
  if (data.length < oldEventSize || !data.slice(0, 8).equals(BATTLE_RESOLVED_EVENT_DISCRIMINATOR)) {
    return null;
  }

  let o = 8;
  const sourcePlanet = readPubkeyRaw(data, o).toBase58(); o += 32;
  const destinationPlanet = readPubkeyRaw(data, o).toBase58(); o += 32;
  const attacker = readPubkeyRaw(data, o).toBase58(); o += 32;
  const defender = readPubkeyRaw(data, o).toBase58(); o += 32;
  const sourceGalaxy = readU16(data, o); o += 2;
  const sourceSystem = readU16(data, o); o += 2;
  const sourcePosition = readU8(data, o); o += 1;
  const targetGalaxy = readU16(data, o); o += 2;
  const targetSystem = readU16(data, o); o += 2;
  const targetPosition = readU8(data, o); o += 1;
  const resolvedAt = readI64(data, o); o += 8;
  const missionSlot = readU8(data, o); o += 1;
  const combatRounds = readU8(data, o); o += 1;
  const attackerWon = readU8(data, o) !== 0; o += 1;
  const attackerDestroyed = readU8(data, o) !== 0; o += 1;
  const defenderSurvived = readU8(data, o) !== 0; o += 1;
  const lootMetal = readU64(data, o); o += 8;
  const lootCrystal = readU64(data, o); o += 8;
  const lootDeuterium = readU64(data, o); o += 8;
  const debrisMetal = readU64(data, o); o += 8;
  const debrisCrystal = readU64(data, o); o += 8;
  const hasRecycledFields = data.length >= currentEventSize;
  const recycledMetal = hasRecycledFields ? readU64(data, o) : 0n;
  if (hasRecycledFields) o += 8;
  const recycledCrystal = hasRecycledFields ? readU64(data, o) : 0n;
  if (hasRecycledFields) o += 8;

  return {
    sourcePlanet,
    destinationPlanet,
    attacker,
    defender,
    sourceGalaxy,
    sourceSystem,
    sourcePosition,
    targetGalaxy,
    targetSystem,
    targetPosition,
    resolvedAt,
    missionSlot,
    combatRounds,
    attackerWon,
    attackerDestroyed,
    defenderSurvived,
    lootMetal,
    lootCrystal,
    lootDeuterium,
    debrisMetal,
    debrisCrystal,
    recycledMetal,
    recycledCrystal,
    attackerSmallCargo: readU32(data, o),
    attackerLargeCargo: readU32(data, o + 4),
    attackerLightFighter: readU32(data, o + 8),
    attackerHeavyFighter: readU32(data, o + 12),
    attackerCruiser: readU32(data, o + 16),
    attackerBattleship: readU32(data, o + 20),
    attackerBattlecruiser: readU32(data, o + 24),
    attackerBomber: readU32(data, o + 28),
    attackerDestroyer: readU32(data, o + 32),
    attackerDeathstar: readU32(data, o + 36),
    attackerRecycler: readU32(data, o + 40),
    attackerEspionageProbe: readU32(data, o + 44),
    attackerColonyShip: readU32(data, o + 48),
  };
}

function decodeEspionageReportEvent(data: Buffer): EspionageReportEvent | null {
  if (data.length < 235 || !data.slice(0, 8).equals(ESPIONAGE_REPORT_EVENT_DISCRIMINATOR)) {
    return null;
  }

  let o = 8;
  const sourcePlanet = readPubkeyRaw(data, o).toBase58(); o += 32;
  const destinationPlanet = readPubkeyRaw(data, o).toBase58(); o += 32;
  const attacker = readPubkeyRaw(data, o).toBase58(); o += 32;
  const defender = readPubkeyRaw(data, o).toBase58(); o += 32;
  const sourceGalaxy = readU16(data, o); o += 2;
  const sourceSystem = readU16(data, o); o += 2;
  const sourcePosition = readU8(data, o); o += 1;
  const targetGalaxy = readU16(data, o); o += 2;
  const targetSystem = readU16(data, o); o += 2;
  const targetPosition = readU8(data, o); o += 1;
  const resolvedAt = readI64(data, o); o += 8;
  const missionSlot = readU8(data, o); o += 1;
  const revealLevel = readU8(data, o); o += 1;
  const probesSent = readU32(data, o); o += 4;
  const probesSurvived = readU32(data, o); o += 4;
  const probesLost = readU32(data, o); o += 4;
  const sensorScore = readU64(data, o); o += 8;
  const counterScore = readU64(data, o); o += 8;
  const reportedMetal = readU64(data, o); o += 8;
  const reportedCrystal = readU64(data, o); o += 8;
  const reportedDeuterium = readU64(data, o); o += 8;
  const reportedBuildingScore = readU64(data, o); o += 8;
  const reportedFleetPoints = readU64(data, o); o += 8;
  const reportedDefensePoints = readU64(data, o); o += 8;

  return {
    sourcePlanet,
    destinationPlanet,
    attacker,
    defender,
    sourceGalaxy,
    sourceSystem,
    sourcePosition,
    targetGalaxy,
    targetSystem,
    targetPosition,
    resolvedAt,
    missionSlot,
    revealLevel,
    probesSent,
    probesSurvived,
    probesLost,
    sensorScore,
    counterScore,
    reportedMetal,
    reportedCrystal,
    reportedDeuterium,
    reportedBuildingScore,
    reportedFleetPoints,
    reportedDefensePoints,
    reportedWeaponsTechnology: readU8(data, o),
    reportedShieldingTechnology: readU8(data, o + 1),
    reportedArmorTechnology: readU8(data, o + 2),
  };
}

function parseBattleResolvedEventFromLogs(logs: string[] | null | undefined): BattleResolvedEvent | null {
  for (const log of logs ?? []) {
    const payload = log.startsWith("Program data: ") ? log.slice("Program data: ".length).trim() : "";
    if (!payload) continue;
    try {
      const event = decodeBattleResolvedEvent(Buffer.from(payload, "base64"));
      if (event) return event;
    } catch {
      // Ignore unrelated program data logs.
    }
  }
  return null;
}

function parseEspionageReportEventFromLogs(logs: string[] | null | undefined): EspionageReportEvent | null {
  for (const log of logs ?? []) {
    const payload = log.startsWith("Program data: ") ? log.slice("Program data: ".length).trim() : "";
    if (!payload) continue;
    try {
      const event = decodeEspionageReportEvent(Buffer.from(payload, "base64"));
      if (event) return event;
    } catch {
      // Ignore unrelated program data logs.
    }
  }
  return null;
}

// ─── Instruction Encoders ─────────────────────────────────────────────────────
function encodeInstruction(discriminator: Buffer, args?: Buffer): Buffer {
  return args ? Buffer.concat([discriminator, args]) : discriminator;
}

function encodeInitializePlayerArgs(
  vault: PublicKey,
  expiresAt: number,
  backupVersion: number,
  backupCiphertext: Uint8Array,
  backupIv: Uint8Array,
  backupSalt: Uint8Array,
  backupKdfSalt: Uint8Array,
): Buffer {
  const writer = new BorshWriter();
  writer.writeFixedBytes(vault.toBytes());
  writer.writeI64(expiresAt);
  writer.writeU8(backupVersion);
  writer.writeBytes(backupCiphertext);
  writer.writeFixedBytes(backupIv);
  writer.writeFixedBytes(backupSalt);
  writer.writeFixedBytes(backupKdfSalt);
  return writer.toBuffer();
}

function encodeRotateVaultArgs(
  newVault: PublicKey,
  expiresAt: number,
  backupVersion: number,
  backupCiphertext: Uint8Array,
  backupIv: Uint8Array,
  backupSalt: Uint8Array,
  backupKdfSalt: Uint8Array,
): Buffer {
  const writer = new BorshWriter();
  writer.writeFixedBytes(newVault.toBytes());
  writer.writeI64(expiresAt);
  writer.writeU8(backupVersion);
  writer.writeBytes(backupCiphertext);
  writer.writeFixedBytes(backupIv);
  writer.writeFixedBytes(backupSalt);
  writer.writeFixedBytes(backupKdfSalt);
  return writer.toBuffer();
}

function encodeHomeworldArgs(now: number, name: string, galaxy: number, system: number, position: number): Buffer {
  const writer = new BorshWriter();
  writer.writeI64(now);
  writer.writeString(name);
  writer.writeU16(galaxy);
  writer.writeU16(system);
  writer.writeU8(position);
  return writer.toBuffer();
}

function encodeColonyArgs(now: number, mission: Mission, slot: number): Buffer {
  const writer = new BorshWriter();
  writer.writeI64(now);
  writer.writeString(mission.colonyName || "Colony");
  writer.writeU16(mission.targetGalaxy);
  writer.writeU16(mission.targetSystem);
  writer.writeU8(mission.targetPosition);
  writer.writeU64(mission.cargoMetal);
  writer.writeU64(mission.cargoCrystal);
  writer.writeU64(mission.cargoDeuterium);
  writer.writeU32(mission.sSmallCargo);
  writer.writeU32(mission.sLargeCargo);
  writer.writeU32(mission.sLightFighter);
  writer.writeU32(mission.sHeavyFighter);
  writer.writeU32(mission.sCruiser);
  writer.writeU32(mission.sBattleship);
  writer.writeU32(mission.sBattlecruiser);
  writer.writeU32(mission.sBomber);
  writer.writeU32(mission.sDestroyer);
  writer.writeU32(mission.sDeathstar);
  writer.writeU32(mission.sRecycler);
  writer.writeU32(mission.sEspionageProbe);
  writer.writeU32(0); // colony_ship consumed
  writer.writeU32(0); // solar_satellite not transferable
  writer.writeU8(slot);
  return writer.toBuffer();
}

function encodeBuildShipArgs(shipType: number, quantity: number, now: number): Buffer {
  const writer = new BorshWriter();
  writer.writeU8(shipType);
  writer.writeU32(quantity);
  writer.writeI64(now);
  return writer.toBuffer();
}

function encodeBuildDefenseArgs(defenseType: number, quantity: number, now: number): Buffer {
  const writer = new BorshWriter();
  writer.writeU8(defenseType);
  writer.writeU32(quantity);
  writer.writeI64(now);
  return writer.toBuffer();
}

function encodePubkeyArg(value: PublicKey): Buffer {
  const writer = new BorshWriter();
  writer.writeFixedBytes(value.toBytes());
  return writer.toBuffer();
}

function encodeI64Arg(value: number): Buffer {
  const writer = new BorshWriter();
  writer.writeI64(value);
  return writer.toBuffer();
}

function encodeLaunchFleetArgs(
  ships: { lf?: number; hf?: number; cr?: number; bs?: number; bc?: number; bm?: number; ds?: number; de?: number; sc?: number; lc?: number; rec?: number; ep?: number; col?: number },
  cargo: { metal?: bigint; crystal?: bigint; deuterium?: bigint },
  missionType: number,
  speedFactor: number,
  now: number,
  target: LaunchFleetTarget,
): Buffer {
  const writer = new BorshWriter();
  writer.writeU8(missionType);
  writer.writeU32(ships.lf ?? 0);
  writer.writeU32(ships.hf ?? 0);
  writer.writeU32(ships.cr ?? 0);
  writer.writeU32(ships.bs ?? 0);
  writer.writeU32(ships.bc ?? 0);
  writer.writeU32(ships.bm ?? 0);
  writer.writeU32(ships.ds ?? 0);
  writer.writeU32(ships.de ?? 0);
  writer.writeU32(ships.sc ?? 0);
  writer.writeU32(ships.lc ?? 0);
  writer.writeU32(ships.rec ?? 0);
  writer.writeU32(ships.ep ?? 0);
  writer.writeU32(ships.col ?? 0);
  writer.writeU64(cargo.metal ?? 0n);
  writer.writeU64(cargo.crystal ?? 0n);
  writer.writeU64(cargo.deuterium ?? 0n);
  writer.writeU8(speedFactor);
  writer.writeI64(now);
  writer.writeU16(target.galaxy);
  writer.writeU16(target.system);
  writer.writeU8(target.position);
  writer.writeString(target.colonyName ?? "");
  return writer.toBuffer();
}

// ─── PDA Derivations ──────────────────────────────────────────────────────────
export function derivePlayerProfilePda(walletPubkey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player_profile"), walletPubkey.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function derivePlanetStatePda(walletPubkey: PublicKey, index: number): PublicKey {
  const indexSeed = Buffer.alloc(4);
  indexSeed.writeUInt32LE(index, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("planet_state"), walletPubkey.toBuffer(), indexSeed],
    GAME_STATE_PROGRAM_ID,
  )[0];
}
export function derivePlanetOwnerIndexPda(walletPubkey: PublicKey, slot: number): PublicKey {
  const slotSeed = Buffer.alloc(4);
  slotSeed.writeUInt32LE(slot, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("planet_owner_index"), walletPubkey.toBuffer(), slotSeed],
    GAME_STATE_PROGRAM_ID,
  )[0];
}
export function derivePlanetOwnershipRegistryPda(planet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("planet_ownership"), planet.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

function derivePlanetListingIndexPda(planet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("planet_listing_index"), planet.toBuffer()],
    MARKET_PROGRAM_ID,
  )[0];
}

function derivePlanetMarketObligationPda(planet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("planet_market_obligation"), planet.toBuffer()],
    MARKET_PROGRAM_ID,
  )[0];
}

export function derivePublicPlanetStatePda(walletPubkey: PublicKey, index: number): PublicKey {
  const indexSeed = Buffer.alloc(4);
  indexSeed.writeUInt32LE(index, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("public_planet_v2"), walletPubkey.toBuffer(), indexSeed],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveQuestStatePda(walletPubkey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("quest_state"), walletPubkey.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveQuestProgressPda(walletPubkey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("quest_progress"), walletPubkey.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveQuestRewardTargetsPda(walletPubkey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("quest_reward_targets"), walletPubkey.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveQuestTutorialRewardTargetsPda(walletPubkey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("quest_tutorial_reward_targets"), walletPubkey.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveAlliancePda(founderPubkey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("alliance"), founderPubkey.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveAllianceMetadataPda(alliancePda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("alliance_metadata"), alliancePda.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveAllianceMembershipPda(walletPubkey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("alliance_membership"), walletPubkey.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveAllianceJoinRequestPda(alliancePda: PublicKey, applicant: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("alliance_join_request"), alliancePda.toBuffer(), applicant.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveAllianceTreasuryPda(alliancePda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("alliance_treasury"), alliancePda.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveLazorPlayerPda(vault: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), vault.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveSystemSovereigntyPda(galaxy: number, system: number): PublicKey {
  const galaxySeed = Buffer.alloc(2);
  galaxySeed.writeUInt16LE(galaxy, 0);
  const systemSeed = Buffer.alloc(2);
  systemSeed.writeUInt16LE(system, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("system_sovereignty"), galaxySeed, systemSeed],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveAllianceGovernancePda(alliancePda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("alliance_governance"), alliancePda.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveGamesolGovernancePda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("gamesol_governance")],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveAllianceDecisionPda(alliancePda: PublicKey, proposalId: bigint | number): PublicKey {
  const proposalSeed = Buffer.alloc(8);
  proposalSeed.writeBigUInt64LE(BigInt(proposalId), 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("alliance_decision"), alliancePda.toBuffer(), proposalSeed],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveAssociatedTokenAccount(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function createAssociatedTokenAccountInstruction(payer: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  const ata = deriveAssociatedTokenAccount(owner, mint);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

export function deriveStoreConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("store_config")],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function deriveStorePurchaseStatePda(walletPubkey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("store_purchase_state"), walletPubkey.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

/**
 * Derives the coordinate occupancy lock PDA for a given galaxy/system/position.
 * Seeds match the Rust program: ["planet_coords", galaxy_le16, system_le16, position_u8]
 */
export function derivePlanetCoordsPda(galaxy: number, system: number, position: number): PublicKey {
  const galaxySeed = Buffer.alloc(2);
  galaxySeed.writeUInt16LE(galaxy, 0);
  const systemSeed = Buffer.alloc(2);
  systemSeed.writeUInt16LE(system, 0);
  const positionSeed = Buffer.from([position]);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("planet_coords"), galaxySeed, systemSeed, positionSeed],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

function deriveAuthorizedVaultPda(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("authorized_vault"), authority.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

function deriveVaultBackupPda(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_backup"), authority.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

function deriveGameConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")],
    GAME_STATE_PROGRAM_ID,
  )[0];
}


// ─── Coord slot helpers ───────────────────────────────────────────────────────

/**
 * Returns true if the coordinate slot is already occupied (planet_coords PDA exists).
 */
async function isCoordOccupied(
  connection: Connection,
  galaxy: number,
  system: number,
  position: number,
): Promise<boolean> {
  const pda = derivePlanetCoordsPda(galaxy, system, position);
  const info = await connection.getAccountInfo(pda, "confirmed");
  return info !== null && info.owner.equals(GAME_STATE_PROGRAM_ID);
}

/**
 * Derives homeworld coordinates deterministically from the wallet pubkey bytes,
 * matching the on-chain logic in `initialize_homeworld`.
 */
function deriveHomeworldCoordsFromWallet(walletPubkey: PublicKey): { galaxy: number; system: number; position: number } {
  const b = walletPubkey.toBytes();
  const galaxy = (b[0] % 9) + 1;
  const system = (((b[1] | (b[2] << 8)) >>> 0) % 499) + 1;
  const position = (b[3] % 15) + 1;
  return { galaxy, system, position };
}

/**
 * Generates a random coord candidate within game bounds.
 */
function randomCoords(): { galaxy: number; system: number; position: number } {
  return {
    galaxy:   Math.floor(Math.random() * 9) + 1,
    system:   Math.floor(Math.random() * 499) + 1,
    position: Math.floor(Math.random() * 15) + 1,
  };
}

// ─── Account Deserializers ────────────────────────────────────────────────────
function deserializePlayerProfile(data: Buffer): PlayerProfileAccount {
  if (!data.slice(0, 8).equals(PLAYER_PROFILE_DISCRIMINATOR)) {
    throw new Error("Invalid player profile discriminator.");
  }
  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const planetCount = readU32(data, o);
  return { authority, planetCount };
}

function deserializeQuestState(data: Buffer): QuestStateAccount {
  if (!data.slice(0, 8).equals(QUEST_STATE_DISCRIMINATOR)) {
    throw new Error("Invalid quest state discriminator.");
  }
  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const tutorialClaimedMask = readU64(data, o); o += 8;
  const dailyEpoch = readI64(data, o); o += 8;
  const weeklyEpoch = readI64(data, o); o += 8;
  const monthlyEpoch = readI64(data, o); o += 8;
  const dailyClaimedMask = readU64(data, o); o += 8;
  const weeklyClaimedMask = readU64(data, o); o += 8;
  const monthlyClaimedMask = readU64(data, o); o += 8;
  const dailyCheckinDay = readI64(data, o); o += 8;
  const dailyCheckinStreak = readU16(data, o); o += 2;
  const totalCheckins = readU32(data, o); o += 4;
  const lastUpdatedTs = readI64(data, o); o += 8;
  const bump = readU8(data, o);
  return {
    authority,
    tutorialClaimedMask,
    dailyEpoch,
    weeklyEpoch,
    monthlyEpoch,
    dailyClaimedMask,
    weeklyClaimedMask,
    monthlyClaimedMask,
    dailyCheckinDay,
    dailyCheckinStreak,
    totalCheckins,
    lastUpdatedTs,
    bump,
  };
}

function deserializeQuestProgressState(data: Buffer): QuestProgressStateAccount {
  if (!data.slice(0, 8).equals(QUEST_PROGRESS_STATE_DISCRIMINATOR)) {
    throw new Error("Invalid quest progress state discriminator.");
  }
  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const dailyEpoch = readI64(data, o); o += 8;
  const weeklyEpoch = readI64(data, o); o += 8;
  const monthlyEpoch = readI64(data, o); o += 8;
  const dailyStorePacksBought = readU32(data, o); o += 4;
  const weeklyStorePacksBought = readU32(data, o); o += 4;
  const monthlyStorePacksBought = readU32(data, o); o += 4;
  const dailyAntimatterSpent = readU64(data, o); o += 8;
  const weeklyAntimatterSpent = readU64(data, o); o += 8;
  const monthlyAntimatterSpent = readU64(data, o); o += 8;
  const dailyPlanetsColonized = readU32(data, o); o += 4;
  const weeklyPlanetsColonized = readU32(data, o); o += 4;
  const monthlyPlanetsColonized = readU32(data, o); o += 4;
  const dailyAttacksResolved = readU32(data, o); o += 4;
  const weeklyAttacksResolved = readU32(data, o); o += 4;
  const monthlyAttacksResolved = readU32(data, o); o += 4;
  const dailyTransportsResolved = readU32(data, o); o += 4;
  const weeklyTransportsResolved = readU32(data, o); o += 4;
  const monthlyTransportsResolved = readU32(data, o); o += 4;
  const dailySpyMissionsResolved = readU32(data, o); o += 4;
  const weeklySpyMissionsResolved = readU32(data, o); o += 4;
  const monthlySpyMissionsResolved = readU32(data, o); o += 4;
  const lastUpdatedTs = readI64(data, o); o += 8;
  const bump = readU8(data, o);
  return {
    authority,
    dailyEpoch,
    weeklyEpoch,
    monthlyEpoch,
    dailyStorePacksBought,
    weeklyStorePacksBought,
    monthlyStorePacksBought,
    dailyAntimatterSpent,
    weeklyAntimatterSpent,
    monthlyAntimatterSpent,
    dailyPlanetsColonized,
    weeklyPlanetsColonized,
    monthlyPlanetsColonized,
    dailyAttacksResolved,
    weeklyAttacksResolved,
    monthlyAttacksResolved,
    dailyTransportsResolved,
    weeklyTransportsResolved,
    monthlyTransportsResolved,
    dailySpyMissionsResolved,
    weeklySpyMissionsResolved,
    monthlySpyMissionsResolved,
    lastUpdatedTs,
    bump,
  };
}

function deserializeQuestRewardTargetState(data: Buffer): QuestRewardTargetStateAccount {
  if (!data.slice(0, 8).equals(QUEST_REWARD_TARGET_STATE_DISCRIMINATOR)) {
    throw new Error("Invalid quest reward target state discriminator.");
  }
  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const dailyEpoch = readI64(data, o); o += 8;
  const weeklyEpoch = readI64(data, o); o += 8;
  const monthlyEpoch = readI64(data, o); o += 8;
  const dailyStorePacksPlanet = readPubkeyRaw(data, o); o += 32;
  const weeklyStorePacksPlanet = readPubkeyRaw(data, o); o += 32;
  const monthlyStorePacksPlanet = readPubkeyRaw(data, o); o += 32;
  const dailyAntimatterPlanet = readPubkeyRaw(data, o); o += 32;
  const weeklyAntimatterPlanet = readPubkeyRaw(data, o); o += 32;
  const monthlyAntimatterPlanet = readPubkeyRaw(data, o); o += 32;
  const dailyColonizedPlanet = readPubkeyRaw(data, o); o += 32;
  const weeklyColonizedPlanet = readPubkeyRaw(data, o); o += 32;
  const monthlyColonizedPlanet = readPubkeyRaw(data, o); o += 32;
  const dailyAttacksPlanet = readPubkeyRaw(data, o); o += 32;
  const weeklyAttacksPlanet = readPubkeyRaw(data, o); o += 32;
  const monthlyAttacksPlanet = readPubkeyRaw(data, o); o += 32;
  const dailyTransportsPlanet = readPubkeyRaw(data, o); o += 32;
  const weeklyTransportsPlanet = readPubkeyRaw(data, o); o += 32;
  const monthlyTransportsPlanet = readPubkeyRaw(data, o); o += 32;
  const dailySpyPlanet = readPubkeyRaw(data, o); o += 32;
  const weeklySpyPlanet = readPubkeyRaw(data, o); o += 32;
  const monthlySpyPlanet = readPubkeyRaw(data, o); o += 32;
  const lastUpdatedTs = readI64(data, o); o += 8;
  const bump = readU8(data, o);
  return {
    authority,
    dailyEpoch,
    weeklyEpoch,
    monthlyEpoch,
    dailyStorePacksPlanet,
    weeklyStorePacksPlanet,
    monthlyStorePacksPlanet,
    dailyAntimatterPlanet,
    weeklyAntimatterPlanet,
    monthlyAntimatterPlanet,
    dailyColonizedPlanet,
    weeklyColonizedPlanet,
    monthlyColonizedPlanet,
    dailyAttacksPlanet,
    weeklyAttacksPlanet,
    monthlyAttacksPlanet,
    dailyTransportsPlanet,
    weeklyTransportsPlanet,
    monthlyTransportsPlanet,
    dailySpyPlanet,
    weeklySpyPlanet,
    monthlySpyPlanet,
    lastUpdatedTs,
    bump,
  };
}

function deserializeStoreConfig(data: Buffer): StoreConfigState {
  if (!data.slice(0, 8).equals(STORE_CONFIG_DISCRIMINATOR)) {
    throw new Error("Invalid store config discriminator.");
  }
  let o = 8;
  const admin = readPubkeyRaw(data, o); o += 32;
  const usdcMint = readPubkeyRaw(data, o); o += 32;
  const treasuryUsdcAccount = readPubkeyRaw(data, o); o += 32;
  const enabled = readU8(data, o) !== 0; o += 1;
  readU8(data, o);
  return {
    admin: admin.toBase58(),
    usdcMint: usdcMint.toBase58(),
    treasuryUsdcAccount: treasuryUsdcAccount.toBase58(),
    enabled,
  };
}

function deserializeStorePurchaseState(data: Buffer): StorePurchaseStateAccount {
  if (!data.slice(0, 8).equals(STORE_PURCHASE_STATE_DISCRIMINATOR)) {
    throw new Error("Invalid store purchase state discriminator.");
  }
  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const dailyEpoch = readI64(data, o); o += 8;
  const weeklyEpoch = readI64(data, o); o += 8;
  const monthlyEpoch = readI64(data, o); o += 8;
  const dailyPurchasedMask = readU64(data, o); o += 8;
  const weeklyPurchasedMask = readU64(data, o); o += 8;
  const monthlyPurchasedMask = readU64(data, o); o += 8;
  const lastUpdatedTs = readI64(data, o); o += 8;
  const bump = readU8(data, o);
  return { authority: authority.toBase58(), dailyEpoch, weeklyEpoch, monthlyEpoch, dailyPurchasedMask, weeklyPurchasedMask, monthlyPurchasedMask, lastUpdatedTs, bump };
}

function deserializeAllianceState(publicKey: PublicKey, data: Buffer): AllianceStateAccount {
  if (!data.slice(0, 8).equals(ALLIANCE_STATE_DISCRIMINATOR)) {
    throw new Error("Invalid alliance state discriminator.");
  }
  let o = 8;
  const founder = readPubkeyRaw(data, o); o += 32;
  const name = readFixedString(data, o, MAX_ALLIANCE_NAME_LEN); o += MAX_ALLIANCE_NAME_LEN;
  const level = readU16(data, o); o += 2;
  const xp = readU64(data, o); o += 8;
  const memberCount = readU16(data, o); o += 2;
  const maxMembers = readU16(data, o); o += 2;
  const totalMissionsCompleted = readU64(data, o); o += 8;
  const createdAt = readI64(data, o); o += 8;
  const bump = readU8(data, o);
  return {
    publicKey: publicKey.toBase58(),
    founder: founder.toBase58(),
    name,
    level,
    xp,
    memberCount,
    maxMembers,
    totalMissionsCompleted,
    createdAt,
    bump,
  };
}

function deserializeAllianceMetadata(publicKey: PublicKey, data: Buffer): AllianceMetadataAccount {
  if (!data.slice(0, 8).equals(ALLIANCE_METADATA_DISCRIMINATOR)) {
    throw new Error("Invalid alliance metadata discriminator.");
  }
  let o = 8;
  const alliance = readPubkeyRaw(data, o); o += 32;
  const tag = readFixedString(data, o, MAX_ALLIANCE_TAG_LEN); o += MAX_ALLIANCE_TAG_LEN;
  const imageUrl = readFixedString(data, o, MAX_ALLIANCE_IMAGE_URL_LEN); o += MAX_ALLIANCE_IMAGE_URL_LEN;
  const bump = readU8(data, o);
  return {
    publicKey: publicKey.toBase58(),
    alliance: alliance.toBase58(),
    tag,
    imageUrl,
    bump,
  };
}

function deserializeAllianceTreasuryState(publicKey: PublicKey, data: Buffer): AllianceTreasuryStateAccount {
  if (!data.slice(0, 8).equals(ALLIANCE_TREASURY_STATE_DISCRIMINATOR)) {
    throw new Error("Invalid alliance treasury discriminator.");
  }
  let o = 8;
  const alliance = readPubkeyRaw(data, o); o += 32;
  const metal = readU64(data, o); o += 8;
  const crystal = readU64(data, o); o += 8;
  const deuterium = readU64(data, o); o += 8;
  const antimatter = readU64(data, o); o += 8;
  const logisticsHub = readU8(data, o); o += 1;
  const researchGrid = readU8(data, o); o += 1;
  const defenseCoordination = readU8(data, o); o += 1;
  const tradeNetwork = readU8(data, o); o += 1;
  const totalMetalDeposited = readU64(data, o); o += 8;
  const totalCrystalDeposited = readU64(data, o); o += 8;
  const totalDeuteriumDeposited = readU64(data, o); o += 8;
  const totalAntimatterDeposited = readU64(data, o); o += 8;
  const bump = readU8(data, o);
  return {
    publicKey: publicKey.toBase58(),
    alliance: alliance.toBase58(),
    metal,
    crystal,
    deuterium,
    antimatter,
    logisticsHub,
    researchGrid,
    defenseCoordination,
    tradeNetwork,
    totalMetalDeposited,
    totalCrystalDeposited,
    totalDeuteriumDeposited,
    totalAntimatterDeposited,
    bump,
  };
}

export function createTransferCheckedTokenInstruction(
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint,
  decimals: number,
): TransactionInstruction {
  const data = Buffer.alloc(10);
  data[0] = 12; // SPL Token TransferChecked
  data.writeBigUInt64LE(amount, 1);
  data[9] = decimals;
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

function deserializeSystemSovereignty(publicKey: PublicKey, data: Buffer): SystemSovereigntyAccount {
  if (data.length !== 104 || !data.slice(0, 8).equals(SYSTEM_SOVEREIGNTY_DISCRIMINATOR)) {
    throw new Error("Invalid system sovereignty account.");
  }
  let o = 8;
  const version = readU8(data, o); o += 1;
  const alliance = readPubkeyRaw(data, o); o += 32;
  const claimantPlanet = readPubkeyRaw(data, o); o += 32;
  const galaxy = readU16(data, o); o += 2;
  const system = readU16(data, o); o += 2;
  const specialization = readU8(data, o); o += 1;
  const vulnerabilityHourUtc = readU8(data, o); o += 1;
  const claimedAt = readI64(data, o); o += 8;
  const upkeepPaidUntil = readI64(data, o); o += 8;
  const updatedAt = readI64(data, o); o += 8;
  const bump = readU8(data, o);
  return {
    publicKey: publicKey.toBase58(),
    version,
    alliance: alliance.toBase58(),
    claimantPlanet: claimantPlanet.toBase58(),
    galaxy,
    system,
    specialization,
    vulnerabilityHourUtc,
    claimedAt,
    upkeepPaidUntil,
    updatedAt,
    bump,
  };
}

function deserializeAllianceGovernanceConfig(publicKey: PublicKey, data: Buffer): AllianceGovernanceConfigAccount {
  if (data.length !== 147 || !data.slice(0, 8).equals(ALLIANCE_GOVERNANCE_CONFIG_DISCRIMINATOR)) {
    throw new Error("Invalid alliance governance config account.");
  }
  let o = 8;
  const version = readU8(data, o); o += 1;
  const alliance = readPubkeyRaw(data, o); o += 32;
  const antimatterMint = readPubkeyRaw(data, o); o += 32;
  const dao = readPubkeyRaw(data, o); o += 32;
  const governanceExecutor = readPubkeyRaw(data, o); o += 32;
  const enabled = readU8(data, o) !== 0; o += 1;
  const proposalCount = readU64(data, o); o += 8;
  const bump = readU8(data, o);
  return {
    publicKey: publicKey.toBase58(), version, alliance: alliance.toBase58(),
    antimatterMint: antimatterMint.toBase58(), dao: dao.toBase58(),
    governanceExecutor: governanceExecutor.toBase58(), enabled, proposalCount, bump,
  };
}

function deserializeGamesolGovernanceConfig(publicKey: PublicKey, data: Buffer): GamesolGovernanceConfigAccount {
  if (data.length !== 107 || !data.slice(0, 8).equals(GAMESOL_GOVERNANCE_CONFIG_DISCRIMINATOR)) {
    throw new Error("Invalid GAMESOL governance config account.");
  }
  let o = 8;
  const version = readU8(data, o); o += 1;
  const antimatterMint = readPubkeyRaw(data, o); o += 32;
  const dao = readPubkeyRaw(data, o); o += 32;
  const governanceExecutor = readPubkeyRaw(data, o); o += 32;
  const enabled = readU8(data, o) !== 0; o += 1;
  const bump = readU8(data, o);
  return {
    publicKey: publicKey.toBase58(), version, antimatterMint: antimatterMint.toBase58(),
    dao: dao.toBase58(), governanceExecutor: governanceExecutor.toBase58(), enabled, bump,
  };
}

function deserializeAllianceDecision(publicKey: PublicKey, data: Buffer): AllianceDecisionAccount {
  if (data.length !== 178 || !data.slice(0, 8).equals(ALLIANCE_DECISION_DISCRIMINATOR)) {
    throw new Error("Invalid alliance decision account.");
  }
  let o = 8;
  const version = readU8(data, o); o += 1;
  const id = readU64(data, o); o += 8;
  const alliance = readPubkeyRaw(data, o); o += 32;
  const proposer = readPubkeyRaw(data, o); o += 32;
  const externalProposal = readPubkeyRaw(data, o); o += 32;
  const action = readU8(data, o); o += 1;
  const targetPlanet = readPubkeyRaw(data, o); o += 32;
  const galaxy = readU16(data, o); o += 2;
  const system = readU16(data, o); o += 2;
  const specialization = readU8(data, o); o += 1;
  const vulnerabilityHourUtc = readU8(data, o); o += 1;
  const createdAt = readI64(data, o); o += 8;
  const expiresAt = readI64(data, o); o += 8;
  const executedAt = readI64(data, o); o += 8;
  const executed = readU8(data, o) !== 0; o += 1;
  const bump = readU8(data, o);
  return {
    publicKey: publicKey.toBase58(), version, id, alliance: alliance.toBase58(),
    proposer: proposer.toBase58(), externalProposal: externalProposal.toBase58(), action,
    targetPlanet: targetPlanet.toBase58(), galaxy, system, specialization,
    vulnerabilityHourUtc, createdAt, expiresAt, executedAt, executed, bump,
  };
}

function deserializeAllianceMembership(data: Buffer): AllianceMembershipAccount {
  if (!data.slice(0, 8).equals(ALLIANCE_MEMBERSHIP_DISCRIMINATOR)) {
    throw new Error("Invalid alliance membership discriminator.");
  }
  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const alliance = readPubkeyRaw(data, o); o += 32;
  const role = readU8(data, o); o += 1;
  const joinedAt = readI64(data, o); o += 8;
  const dailyEpoch = readI64(data, o); o += 8;
  const weeklyEpoch = readI64(data, o); o += 8;
  const monthlyEpoch = readI64(data, o); o += 8;
  const dailyClaimedMask = readU64(data, o); o += 8;
  const weeklyClaimedMask = readU64(data, o); o += 8;
  const monthlyClaimedMask = readU64(data, o); o += 8;
  const bump = readU8(data, o);
  return {
    authority: authority.toBase58(),
    alliance: alliance.toBase58(),
    role,
    joinedAt,
    dailyEpoch,
    weeklyEpoch,
    monthlyEpoch,
    dailyClaimedMask,
    weeklyClaimedMask,
    monthlyClaimedMask,
    bump,
  };
}

function deserializeAllianceJoinRequest(publicKey: PublicKey, data: Buffer): AllianceJoinRequestAccount {
  if (!data.slice(0, 8).equals(ALLIANCE_JOIN_REQUEST_DISCRIMINATOR)) {
    throw new Error("Invalid alliance join request discriminator.");
  }
  let o = 8;
  const applicant = readPubkeyRaw(data, o); o += 32;
  const alliance = readPubkeyRaw(data, o); o += 32;
  const createdAt = readI64(data, o); o += 8;
  const bump = readU8(data, o);
  return {
    publicKey: publicKey.toBase58(),
    applicant: applicant.toBase58(),
    alliance: alliance.toBase58(),
    createdAt,
    bump,
  };
}

function deserializeMission(data: Buffer, offset: number): { mission: Mission; bytesRead: number } {
  let o = offset;
  const missionType = readU8(data, o); o += 1;
  const targetGalaxy = readU16(data, o); o += 2;
  const targetSystem = readU16(data, o); o += 2;
  const targetPosition = readU8(data, o); o += 1;
  const colonyName = readFixedString(data, o, MAX_MISSION_COLONY_NAME_LEN); o += MAX_MISSION_COLONY_NAME_LEN;
  const departTs = readI64(data, o); o += 8;
  const arriveTs = readI64(data, o); o += 8;
  const returnTs = readI64(data, o); o += 8;
  const sSmallCargo = readU32(data, o); o += 4;
  const sLargeCargo = readU32(data, o); o += 4;
  const sLightFighter = readU32(data, o); o += 4;
  const sHeavyFighter = readU32(data, o); o += 4;
  const sCruiser = readU32(data, o); o += 4;
  const sBattleship = readU32(data, o); o += 4;
  const sBattlecruiser = readU32(data, o); o += 4;
  const sBomber = readU32(data, o); o += 4;
  const sDestroyer = readU32(data, o); o += 4;
  const sDeathstar = readU32(data, o); o += 4;
  const sRecycler = readU32(data, o); o += 4;
  const sEspionageProbe = readU32(data, o); o += 4;
  const sColonyShip = readU32(data, o); o += 4;
  const cargoMetal = readU64(data, o); o += 8;
  const cargoCrystal = readU64(data, o); o += 8;
  const cargoDeuterium = readU64(data, o); o += 8;
  const applied = readU8(data, o) !== 0; o += 1;
  const speedFactor = readU8(data, o); o += 1;
  const combatRounds = readU8(data, o); o += 1;
  const attackerWon = readU8(data, o) !== 0; o += 1;

  return {
    mission: {
      missionType, destination: "11111111111111111111111111111111",
      targetGalaxy, targetSystem, targetPosition, colonyName,
      departTs, arriveTs, returnTs,
      sSmallCargo, sLargeCargo, sLightFighter, sHeavyFighter, sCruiser,
      sBattleship, sBattlecruiser, sBomber, sDestroyer, sDeathstar,
      sRecycler, sEspionageProbe, sColonyShip,
      cargoMetal, cargoCrystal, cargoDeuterium, applied, speedFactor,
      combatRounds,
      attackerWon,
    },
    bytesRead: o - offset,
  };
}

function deserializePlanetState(data: Buffer): PlanetStateAccount {
  if (!data.slice(0, 8).equals(PLANET_STATE_DISCRIMINATOR)) {
    throw new Error("Invalid planet state discriminator.");
  }

  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const player = readPubkeyRaw(data, o); o += 32;
  const planetIndex = readU32(data, o); o += 4;
  const galaxy = readU16(data, o); o += 2;
  const system = readU16(data, o); o += 2;
  const position = readU8(data, o); o += 1;
  const name = readFixedString(data, o, MAX_PLANET_NAME_LEN); o += MAX_PLANET_NAME_LEN;
  const diameter = readU32(data, o); o += 4;
  const temperature = readI16(data, o); o += 2;
  const maxFields = readU16(data, o); o += 2;
  const usedFields = readU16(data, o); o += 2;
  const metalMine = readU8(data, o); o += 1;
  const crystalMine = readU8(data, o); o += 1;
  const deuteriumSynthesizer = readU8(data, o); o += 1;
  const solarPlant = readU8(data, o); o += 1;
  const fusionReactor = readU8(data, o); o += 1;
  const roboticsFactory = readU8(data, o); o += 1;
  const naniteFactory = readU8(data, o); o += 1;
  const shipyard = readU8(data, o); o += 1;
  const metalStorage = readU8(data, o); o += 1;
  const crystalStorage = readU8(data, o); o += 1;
  const deuteriumTank = readU8(data, o); o += 1;
  const researchLab = readU8(data, o); o += 1;
  const missileSilo = readU8(data, o); o += 1;
  const energyTech = readU8(data, o); o += 1;
  const combustionDrive = readU8(data, o); o += 1;
  const impulseDrive = readU8(data, o); o += 1;
  const hyperspaceDrive = readU8(data, o); o += 1;
  const computerTech = readU8(data, o); o += 1;
  const astrophysics = readU8(data, o); o += 1;
  const igrNetwork = readU8(data, o); o += 1;
  const weaponsTechnology = readU8(data, o); o += 1;
  const shieldingTechnology = readU8(data, o); o += 1;
  const armorTechnology = readU8(data, o); o += 1;
  const researchQueueItem = readU8(data, o); o += 1;
  const researchQueueTarget = readU8(data, o); o += 1;
  const researchFinishTs = readI64(data, o); o += 8;
  const buildQueueItem = readU8(data, o); o += 1;
  const buildQueueTarget = readU8(data, o); o += 1;
  const buildFinishTs = readI64(data, o); o += 8;

  const metal = readU64(data, o); o += 8;
  const crystal = readU64(data, o); o += 8;
  const deuterium = readU64(data, o); o += 8;
  const metalHour = readU64(data, o); o += 8;
  const crystalHour = readU64(data, o); o += 8;
  const deuteriumHour = readU64(data, o); o += 8;
  const energyProduction = readU64(data, o); o += 8;
  const energyConsumption = readU64(data, o); o += 8;
  const metalCap = readU64(data, o); o += 8;
  const crystalCap = readU64(data, o); o += 8;
  const deuteriumCap = readU64(data, o); o += 8;
  const lastUpdateTs = readI64(data, o); o += 8;
  const createdAt = readI64(data, o); o += 8;
  const protectionUntilTs = readI64(data, o); o += 8;
  const marketUnlockedAt = readI64(data, o); o += 8;
  const attackUnlockedAt = readI64(data, o); o += 8;
  const lastAttackLaunchTs = readI64(data, o); o += 8;
  const lastAttackedTs = readI64(data, o); o += 8;
  const smallCargo = readU32(data, o); o += 4;
  const largeCargo = readU32(data, o); o += 4;
  const lightFighter = readU32(data, o); o += 4;
  const heavyFighter = readU32(data, o); o += 4;
  const cruiser = readU32(data, o); o += 4;
  const battleship = readU32(data, o); o += 4;
  const battlecruiser = readU32(data, o); o += 4;
  const bomber = readU32(data, o); o += 4;
  const destroyer = readU32(data, o); o += 4;
  const deathstar = readU32(data, o); o += 4;
  const recycler = readU32(data, o); o += 4;
  const espionageProbe = readU32(data, o); o += 4;
  const colonyShip = readU32(data, o); o += 4;
  const solarSatellite = readU32(data, o); o += 4;
  const rocketLauncher = readU32(data, o); o += 4;
  const lightLaser = readU32(data, o); o += 4;
  const heavyLaser = readU32(data, o); o += 4;
  const gaussCannon = readU32(data, o); o += 4;
  const ionCannon = readU32(data, o); o += 4;
  const plasmaTurret = readU32(data, o); o += 4;
  const smallShieldDome = readU32(data, o); o += 4;
  const largeShieldDome = readU32(data, o); o += 4;
  const antiBallisticMissile = readU32(data, o); o += 4;
  const interplanetaryMissile = readU32(data, o); o += 4;
  const activeMissions = readU8(data, o); o += 1;

  const missions: Mission[] = [];
  for (let i = 0; i < MAX_MISSIONS; i++) {
    const { mission, bytesRead } = deserializeMission(data, o);
    missions.push(mission);
    o += bytesRead;
  }

  const bump = readU8(data, o); o += 1;

  let shipBuildItem = readU8(data, o); o += 1;
  const shipBuildQty = readU32(data, o); o += 4;
  const shipBuildFinishTs = readI64(data, o); o += 8;
  let defenseBuildItem = readU8(data, o); o += 1;
  const defenseBuildQty = readU32(data, o); o += 4;
  const defenseBuildFinishTs = readI64(data, o); o += 8;
  if (shipBuildQty === 0 && shipBuildFinishTs === 0) shipBuildItem = 255;
  if (defenseBuildQty === 0 && defenseBuildFinishTs === 0) defenseBuildItem = 255;

  void bump;

  return {
    authority, player, planetIndex, galaxy, system, position, name,
    diameter, temperature, maxFields, usedFields,
    metalMine, crystalMine, deuteriumSynthesizer, solarPlant, fusionReactor,
    roboticsFactory, naniteFactory, shipyard,
    metalStorage, crystalStorage, deuteriumTank, researchLab, missileSilo,
    energyTech, combustionDrive, impulseDrive, hyperspaceDrive, computerTech, astrophysics, igrNetwork,
    weaponsTechnology, shieldingTechnology, armorTechnology,
    researchQueueItem, researchQueueTarget, researchFinishTs,
    buildQueueItem, buildQueueTarget, buildFinishTs,
    shipBuildItem, shipBuildQty, shipBuildFinishTs,
    metal, crystal, deuterium,
    metalHour, crystalHour, deuteriumHour,
    energyProduction, energyConsumption,
    metalCap, crystalCap, deuteriumCap, lastUpdateTs,
    createdAt, protectionUntilTs, marketUnlockedAt, attackUnlockedAt,
    lastAttackLaunchTs, lastAttackedTs,
    smallCargo, largeCargo, lightFighter, heavyFighter, cruiser, battleship,
    battlecruiser, bomber, destroyer, deathstar, recycler, espionageProbe,
    colonyShip, solarSatellite,
    rocketLauncher, lightLaser, heavyLaser, gaussCannon, ionCannon, plasmaTurret,
    smallShieldDome, largeShieldDome, antiBallisticMissile, interplanetaryMissile,
    activeMissions, missions,
    defenseBuildItem, defenseBuildQty, defenseBuildFinishTs,
  };
}
function deserializePlanetOwnerIndex(data: Buffer): PlanetOwnerIndexAccount {
  if (!data.slice(0, 8).equals(PLANET_OWNER_INDEX_DISCRIMINATOR)) {
    throw new Error("Invalid planet owner index discriminator.");
  }

  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const slot = readU32(data, o); o += 4;
  const planet = readPubkeyRaw(data, o); o += 32;
  const active = readU8(data, o) !== 0; o += 1;
  const bump = readU8(data, o); o += 1;
  return { authority, slot, planet, active, bump };
}

function deserializePublicPlanetState(data: Buffer): PublicPlanetStateAccount {
  if (!data.slice(0, 8).equals(PUBLIC_PLANET_STATE_DISCRIMINATOR)) {
    throw new Error("Invalid public planet state discriminator.");
  }

  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const player = readPubkeyRaw(data, o); o += 32;
  const planetIndex = readU32(data, o); o += 4;
  const galaxy = readU16(data, o); o += 2;
  const system = readU16(data, o); o += 2;
  const position = readU8(data, o); o += 1;
  const version = readU8(data, o); o += 1;
  const name = readFixedString(data, o, MAX_PLANET_NAME_LEN); o += MAX_PLANET_NAME_LEN;
  const createdAt = readI64(data, o);
  if (version !== 1) throw new Error(`Unsupported public planet mirror version ${version}.`);
  return { authority, player, planetIndex, galaxy, system, position, version, name, createdAt };
}

function deserializeAuthorizedVault(data: Buffer): AuthorizedVaultAccount {
  if (!data.slice(0, 8).equals(AUTHORIZED_VAULT_DISCRIMINATOR)) {
    throw new Error("Invalid authorized vault discriminator.");
  }
  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const vault = readPubkeyRaw(data, o); o += 32;
  const expiresAt = readI64(data, o); o += 8;
  const revoked = readU8(data, o) !== 0; o += 1;
  const bump = readU8(data, o);
  return { authority, vault, expiresAt, revoked, bump };
}

function deserializeVaultBackup(data: Buffer): VaultBackupAccount {
  if (!data.slice(0, 8).equals(VAULT_BACKUP_DISCRIMINATOR)) {
    throw new Error("Invalid vault backup discriminator.");
  }
  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const vault = readPubkeyRaw(data, o); o += 32;
  const version = readU8(data, o); o += 1;
  const ciphertextLen = readU32(data, o); o += 4;
  const ciphertext = new Uint8Array(data.slice(o, o + ciphertextLen)); o += ciphertextLen;
  const iv = new Uint8Array(data.slice(o, o + 12)); o += 12;
  const salt = new Uint8Array(data.slice(o, o + 16)); o += 16;
  const kdfSalt = new Uint8Array(data.slice(o, o + 16)); o += 16;
  const updatedAt = readI64(data, o); o += 8;
  const bump = readU8(data, o);
  return { authority, vault, version, ciphertext, iv, salt, kdfSalt, updatedAt, bump };
}

function deserializeGameConfig(data: Buffer): GameConfigAccount {
  if (!data.slice(0, 8).equals(GAME_CONFIG_DISCRIMINATOR)) {
    throw new Error("Invalid game config discriminator.");
  }
  let o = 8;
  const admin = readPubkeyRaw(data, o); o += 32;
  const antimatterMint = readPubkeyRaw(data, o); o += 32;
  const bump = readU8(data, o);
  return { admin, antimatterMint, bump };
}


// ─── Adapters ─────────────────────────────────────────────────────────────────
function adaptPlanetState(planetPda: PublicKey, account: PlanetStateAccount): PlayerState {
  const authority = account.authority.toBase58();
  const key = planetPda.toBase58();

  return {
    entityPda: key,
    planetPda: key,
    fleetPda: key,
    resourcesPda: key,
    researchPda: key,
    isDelegated: false,
    planet: {
      creator: authority,
      entity: key,
      owner: authority,
      name: account.name,
      galaxy: account.galaxy,
      system: account.system,
      position: account.position,
      planetIndex: account.planetIndex,
      diameter: account.diameter,
      temperature: account.temperature,
      maxFields: account.maxFields,
      usedFields: account.usedFields,
      createdAt: account.createdAt,
      protectionUntilTs: account.protectionUntilTs,
      marketUnlockedAt: account.marketUnlockedAt,
      attackUnlockedAt: account.attackUnlockedAt,
      lastAttackLaunchTs: account.lastAttackLaunchTs,
      lastAttackedTs: account.lastAttackedTs,
      metalMine: account.metalMine,
      crystalMine: account.crystalMine,
      deuteriumSynthesizer: account.deuteriumSynthesizer,
      solarPlant: account.solarPlant,
      fusionReactor: account.fusionReactor,
      roboticsFactory: account.roboticsFactory,
      naniteFactory: account.naniteFactory,
      shipyard: account.shipyard,
      metalStorage: account.metalStorage,
      crystalStorage: account.crystalStorage,
      deuteriumTank: account.deuteriumTank,
      researchLab: account.researchLab,
      missileSilo: account.missileSilo,
      weaponsTechnology: account.weaponsTechnology,
      shieldingTechnology: account.shieldingTechnology,
      armorTechnology: account.armorTechnology,
      buildQueueItem: account.buildQueueItem,
      buildQueueTarget: account.buildQueueTarget,
      buildFinishTs: account.buildFinishTs,
      shipBuildItem: account.shipBuildItem,
      shipBuildQty: account.shipBuildQty,
      shipBuildFinishTs: account.shipBuildFinishTs,
      defenseBuildItem: account.defenseBuildItem,
      defenseBuildQty: account.defenseBuildQty,
      defenseBuildFinishTs: account.defenseBuildFinishTs,
      rocketLauncher: account.rocketLauncher,
      lightLaser: account.lightLaser,
      heavyLaser: account.heavyLaser,
      gaussCannon: account.gaussCannon,
      ionCannon: account.ionCannon,
      plasmaTurret: account.plasmaTurret,
      smallShieldDome: account.smallShieldDome,
      largeShieldDome: account.largeShieldDome,
      antiBallisticMissile: account.antiBallisticMissile,
      interplanetaryMissile: account.interplanetaryMissile,
    },
    resources: {
      metal: account.metal,
      crystal: account.crystal,
      deuterium: account.deuterium,
      metalHour: account.metalHour,
      crystalHour: account.crystalHour,
      deuteriumHour: account.deuteriumHour,
      energyProduction: account.energyProduction,
      energyConsumption: account.energyConsumption,
      metalCap: account.metalCap,
      crystalCap: account.crystalCap,
      deuteriumCap: account.deuteriumCap,
      lastUpdateTs: account.lastUpdateTs,
    },
    fleet: {
      creator: authority,
      smallCargo: account.smallCargo,
      largeCargo: account.largeCargo,
      lightFighter: account.lightFighter,
      heavyFighter: account.heavyFighter,
      cruiser: account.cruiser,
      battleship: account.battleship,
      battlecruiser: account.battlecruiser,
      bomber: account.bomber,
      destroyer: account.destroyer,
      deathstar: account.deathstar,
      recycler: account.recycler,
      espionageProbe: account.espionageProbe,
      colonyShip: account.colonyShip,
      solarSatellite: account.solarSatellite,
      activeMissions: account.activeMissions,
      missions: account.missions,
    },
    research: {
      creator: authority,
      energyTech: account.energyTech,
      combustionDrive: account.combustionDrive,
      impulseDrive: account.impulseDrive,
      hyperspaceDrive: account.hyperspaceDrive,
      computerTech: account.computerTech,
      astrophysics: account.astrophysics,
      igrNetwork: account.igrNetwork,
      weaponsTechnology: account.weaponsTechnology,
      shieldingTechnology: account.shieldingTechnology,
      armorTechnology: account.armorTechnology,
      queueItem: account.researchQueueItem,
      queueTarget: account.researchQueueTarget,
      researchFinishTs: account.researchFinishTs,
    },
  };
}

function publicPlanetInfoFromState(planetPda: PublicKey, account: PlanetStateAccount): PublicPlanetInfo {
  return {
    entity: planetPda.toBase58(),
    owner: account.authority.toBase58(),
    name: account.name,
    galaxy: account.galaxy,
    system: account.system,
    position: account.position,
    planetIndex: account.planetIndex,
    diameter: account.diameter,
    temperature: account.temperature,
    maxFields: account.maxFields,
    createdAt: account.createdAt,
    protectionUntilTs: account.protectionUntilTs,
    lastAttackedTs: account.lastAttackedTs,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function publicPlanetInfoFromPublicState(publicPlanetPda: PublicKey, account: PublicPlanetStateAccount): PublicPlanetInfo {
  const meta = derivePrivatePlanetDisplayMeta(account);
  return {
    entity: publicPlanetPda.toBase58(),
    owner: account.authority.toBase58(),
    name: account.name,
    galaxy: account.galaxy,
    system: account.system,
    position: account.position,
    planetIndex: account.planetIndex,
    diameter: meta.diameter,
    temperature: meta.temperature,
    maxFields: meta.maxFields,
    createdAt: account.createdAt,
    protectionUntilTs: 0,
    lastAttackedTs: 0,
  };
}

function derivePrivatePlanetDisplayMeta(account: PublicPlanetStateAccount): {
  diameter: number;
  temperature: number;
  maxFields: number;
} {
  if (account.planetIndex === 0) {
    const b = account.authority.toBytes();
    const baseTemp = 120 - account.position * 12;
    return {
      diameter: 8_000 + (((b[4] | (b[5] << 8)) >>> 0) % 10_000),
      temperature: Math.max(-60, Math.min(120, baseTemp + (b[6] % 40 - 20))),
      maxFields: 163 + (b[7] % 40),
    };
  }

  return {
    diameter: 8_000 + ((account.galaxy * 997 + account.system * 37 + account.position * 101) % 10_000),
    temperature: Math.max(-60, Math.min(120, 120 - account.position * 12)),
    maxFields: 163 + ((account.galaxy + account.system + account.position) % 40),
  };
}

function initialPrivateSnapshot(now: number): PrivateSnapshot {
  return {
    resources: {
      metal: 500n,
      crystal: 500n,
      deuterium: 100n,
      metalHour: 33n,
      crystalHour: 22n,
      deuteriumHour: 14n,
      energyProduction: 22n,
      energyConsumption: 42n,
      metalCap: 10_000n,
      crystalCap: 10_000n,
      deuteriumCap: 10_000n,
      lastUpdateTs: now,
    },
    buildings: {
      metalMine: 1,
      crystalMine: 1,
      deuteriumSynthesizer: 1,
      solarPlant: 1,
      fusionReactor: 0,
      roboticsFactory: 0,
      naniteFactory: 0,
      shipyard: 0,
      metalStorage: 0,
      crystalStorage: 0,
      deuteriumTank: 0,
      researchLab: 0,
      missileSilo: 0,
      usedFields: 4,
      buildQueueItem: 255,
      buildQueueTarget: 0,
      buildFinishTs: 0,
      shipBuildItem: 255,
      shipBuildQty: 0,
      shipBuildFinishTs: 0,
      defenseBuildItem: 255,
      defenseBuildQty: 0,
      defenseBuildFinishTs: 0,
    },
    research: {
      energyTech: 0,
      combustionDrive: 0,
      impulseDrive: 0,
      hyperspaceDrive: 0,
      computerTech: 0,
      astrophysics: 0,
      igrNetwork: 0,
      weaponsTechnology: 0,
      shieldingTechnology: 0,
      armorTechnology: 0,
      queueItem: 255,
      queueTarget: 0,
      researchFinishTs: 0,
    },
    fleet: {
      smallCargo: 0,
      largeCargo: 0,
      lightFighter: 0,
      heavyFighter: 0,
      cruiser: 0,
      battleship: 0,
      battlecruiser: 0,
      bomber: 0,
      destroyer: 0,
      deathstar: 0,
      recycler: 0,
      espionageProbe: 0,
      colonyShip: 0,
      solarSatellite: 0,
      activeMissions: 0,
      missions: [],
    },
    defense: {
      rocketLauncher: 0,
      lightLaser: 0,
      heavyLaser: 0,
      gaussCannon: 0,
      ionCannon: 0,
      plasmaTurret: 0,
      smallShieldDome: 0,
      largeShieldDome: 0,
      antiBallisticMissile: 0,
      interplanetaryMissile: 0,
    },
  };
}

function stateFromPublicPlanet(
  publicPlanetPda: PublicKey,
  account: PublicPlanetStateAccount,
  snapshot = initialPrivateSnapshot(account.createdAt),
): PlayerState {
  const authority = account.authority.toBase58();
  const entity = publicPlanetPda.toBase58();
  const buildings = snapshot.buildings as Record<string, number>;
  const research = snapshot.research as Record<string, number>;
  const resources = snapshot.resources as Resources;
  const fleet = snapshot.fleet as Omit<Fleet, "creator">;
  const defense = snapshot.defense as Record<string, number>;
  const meta = derivePrivatePlanetDisplayMeta(account);

  return {
    entityPda: entity,
    planetPda: entity,
    fleetPda: entity,
    resourcesPda: entity,
    researchPda: entity,
    isDelegated: false,
    planet: {
      creator: authority,
      entity,
      owner: authority,
      name: account.name,
      galaxy: account.galaxy,
      system: account.system,
      position: account.position,
      planetIndex: account.planetIndex,
      diameter: meta.diameter,
      temperature: meta.temperature,
      maxFields: meta.maxFields,
      usedFields: buildings.usedFields ?? 0,
      createdAt: account.createdAt,
      protectionUntilTs: 0,
      marketUnlockedAt: 0,
      attackUnlockedAt: 0,
      lastAttackLaunchTs: 0,
      lastAttackedTs: 0,
      metalMine: buildings.metalMine ?? 0,
      crystalMine: buildings.crystalMine ?? 0,
      deuteriumSynthesizer: buildings.deuteriumSynthesizer ?? 0,
      solarPlant: buildings.solarPlant ?? 0,
      fusionReactor: buildings.fusionReactor ?? 0,
      roboticsFactory: buildings.roboticsFactory ?? 0,
      naniteFactory: buildings.naniteFactory ?? 0,
      shipyard: buildings.shipyard ?? 0,
      metalStorage: buildings.metalStorage ?? 0,
      crystalStorage: buildings.crystalStorage ?? 0,
      deuteriumTank: buildings.deuteriumTank ?? 0,
      researchLab: buildings.researchLab ?? 0,
      missileSilo: buildings.missileSilo ?? 0,
      weaponsTechnology: research.weaponsTechnology ?? 0,
      shieldingTechnology: research.shieldingTechnology ?? 0,
      armorTechnology: research.armorTechnology ?? 0,
      buildQueueItem: buildings.buildQueueItem ?? 255,
      buildQueueTarget: buildings.buildQueueTarget ?? 0,
      buildFinishTs: buildings.buildFinishTs ?? 0,
      shipBuildItem: buildings.shipBuildItem ?? 255,
      shipBuildQty: buildings.shipBuildQty ?? 0,
      shipBuildFinishTs: buildings.shipBuildFinishTs ?? 0,
      defenseBuildItem: buildings.defenseBuildItem ?? 255,
      defenseBuildQty: buildings.defenseBuildQty ?? 0,
      defenseBuildFinishTs: buildings.defenseBuildFinishTs ?? 0,
      rocketLauncher: defense.rocketLauncher ?? 0,
      lightLaser: defense.lightLaser ?? 0,
      heavyLaser: defense.heavyLaser ?? 0,
      gaussCannon: defense.gaussCannon ?? 0,
      ionCannon: defense.ionCannon ?? 0,
      plasmaTurret: defense.plasmaTurret ?? 0,
      smallShieldDome: defense.smallShieldDome ?? 0,
      largeShieldDome: defense.largeShieldDome ?? 0,
      antiBallisticMissile: defense.antiBallisticMissile ?? 0,
      interplanetaryMissile: defense.interplanetaryMissile ?? 0,
    },
    resources,
    fleet: { creator: authority, ...fleet },
    research: {
      creator: authority,
      energyTech: research.energyTech ?? 0,
      combustionDrive: research.combustionDrive ?? 0,
      impulseDrive: research.impulseDrive ?? 0,
      hyperspaceDrive: research.hyperspaceDrive ?? 0,
      computerTech: research.computerTech ?? 0,
      astrophysics: research.astrophysics ?? 0,
      igrNetwork: research.igrNetwork ?? 0,
      weaponsTechnology: research.weaponsTechnology ?? 0,
      shieldingTechnology: research.shieldingTechnology ?? 0,
      armorTechnology: research.armorTechnology ?? 0,
      queueItem: research.queueItem ?? 255,
      queueTarget: research.queueTarget ?? 0,
      researchFinishTs: research.researchFinishTs ?? 0,
    },
  };
}

function isPlanetStateAccount(
  account: Awaited<ReturnType<Connection["getAccountInfo"]>>,
): account is NonNullable<Awaited<ReturnType<Connection["getAccountInfo"]>>> {
  return !!account &&
    account.owner.equals(GAME_STATE_PROGRAM_ID) &&
    account.data.slice(0, 8).equals(PLANET_STATE_DISCRIMINATOR);
}

function isPublicPlanetStateAccount(
  account: Awaited<ReturnType<Connection["getAccountInfo"]>>,
): account is NonNullable<Awaited<ReturnType<Connection["getAccountInfo"]>>> {
  return !!account &&
    account.owner.equals(GAME_STATE_PROGRAM_ID) &&
    account.data.slice(0, 8).equals(PUBLIC_PLANET_STATE_DISCRIMINATOR);
}

function describeTxError(err: unknown): string {
  if (err instanceof SendTransactionError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function isNonRetryableHomeworldError(message: string): boolean {
  return (
    message.includes("ConstraintSeeds") ||
    message.includes("A seeds constraint was violated") ||
    message.includes("custom program error: 0x7d6") ||
    message.includes("insufficient lamports") ||
    message.includes("Transfer: insufficient lamports") ||
    message.includes("InvalidVaultAuthorization") ||
    message.includes("Vault authorization mismatch") ||
    message.includes("custom program error: 0x1795")
  );
}

function hasCustomProgramError(details: string, hexCode: string): boolean {
  return new RegExp(`custom program error: ${hexCode}(?![0-9a-f])`, "i").test(details);
}

function mapSendTransactionError(message: string, logs: string[]): string {
  const details = [message, ...logs].join("\n");
  const suffix = logs.length > 0
    ? `\n\nLogs:\n${logs.join("\n")}`
    : `\n\nRaw transaction error:\n${message}`;
  if (
    details.includes("ConstraintSeeds") ||
    details.includes("A seeds constraint was violated") ||
    details.includes("custom program error: 0x7d6")
  ) {
    return "On-chain PDA seed mismatch (ConstraintSeeds / 0x7d6). Refresh and retry; if it persists, the player profile index is out of sync.";
  }
  if (
    details.includes("insufficient lamports") ||
    details.includes("Transfer: insufficient lamports")
  ) {
    return "Sponsored account setup could not cover this command. Refresh sponsor status and retry; only legacy vault accounts may need devnet SOL.";
  }
  if (
    details.includes("Access violation") ||
    hasCustomProgramError(details, "0x1")
  ) {
    return `On-chain program failed before returning a game error. The client did not receive program logs for this failure, so use the raw transaction error below.${suffix}`;
  }
  if (
    details.includes("Error Code: QueueBusy") ||
    details.includes("Build queue is busy") ||
    details.includes("custom program error: 0x1773")
  ) {
    return "Build queue is already busy. Finish the current construction before starting another one.";
  }
  if (
    details.includes("NoFields") ||
    details.includes("No free building fields") ||
    details.includes("custom program error: 0x1774")
  ) {
    return "No free building fields are available on this planet.";
  }
  if (
    details.includes("InsufficientMetal") ||
    details.includes("custom program error: 0x1775")
  ) {
    return "Not enough metal for this action.";
  }
  if (
    details.includes("InsufficientCrystal") ||
    details.includes("custom program error: 0x1776")
  ) {
    return "Not enough crystal for this action.";
  }
  if (
    details.includes("InsufficientDeuterium") ||
    details.includes("custom program error: 0x1777")
  ) {
    return "Not enough deuterium for this action.";
  }
  if (
    details.includes("NoBuild") ||
    details.includes("No build is currently queued") ||
    details.includes("custom program error: 0x1778")
  ) {
    return "No building is queued right now.";
  }
  if (
    details.includes("Error Code: BuildNotFinished") ||
    details.includes("queued build has not finished") ||
    details.includes("custom program error: 0x1779")
  ) {
    return "Building construction is still in progress. Wait for the timer or use ANTIMATTER to finish it instantly.";
  }
  if (
    details.includes("InvalidTech") ||
    details.includes("Invalid research technology") ||
    details.includes("custom program error: 0x177a")
  ) {
    return "That research technology is not supported. Refresh the game and try again.";
  }
  if (
    details.includes("LabTooLow") ||
    details.includes("Research lab level is too low") ||
    details.includes("custom program error: 0x177b")
  ) {
    return "Research Lab level is too low for that technology. Open Buildings and upgrade Research Lab first.";
  }
  if (
    details.includes("ResearchQueueBusy") ||
    details.includes("research queue is busy") ||
    details.includes("custom program error: 0x177c")
  ) {
    return "Research queue is already busy. Finish the current research before starting another technology.";
  }
  if (
    details.includes("NoResearch") ||
    details.includes("No research is currently queued") ||
    details.includes("custom program error: 0x177d")
  ) {
    return "No research is queued right now.";
  }
  if (
    details.includes("ResearchNotFinished") ||
    details.includes("research has not finished") ||
    details.includes("custom program error: 0x177e")
  ) {
    return "Research is still in progress. Wait for the timer or use ANTIMATTER to finish it instantly.";
  }
  if (
    details.includes("InvalidShipType") ||
    details.includes("Invalid ship type") ||
    details.includes("custom program error: 0x1781")
  ) {
    return "That ship type is not supported. Refresh the game and try again.";
  }
  if (
    details.includes("InvalidDefenseType") ||
    details.includes("Invalid defense type") ||
    details.includes("custom program error: 0x1782")
  ) {
    return "That defense type is not supported. Refresh the game and try again.";
  }
  if (
    details.includes("TechLocked") ||
    details.includes("locked by research requirements") ||
    details.includes("custom program error: 0x1783")
  ) {
    return "Requirements are missing for this unit. Open its Requirements panel and upgrade the listed buildings or research first.";
  }
  if (
    details.includes("ShipyardTooLow") ||
    details.includes("Shipyard level is too low") ||
    details.includes("custom program error: 0x1784")
  ) {
    return "Shipyard level is too low. Upgrade Shipyard first.";
  }
  if (
    details.includes("ShipyardQueueBusy") ||
    details.includes("Shipyard queue is busy") ||
    hasCustomProgramError(details, "0x1785")
  ) {
    const queue = details.match(/ship gate: type \d+ qty \d+ sy \d+ queue (\d+) (\d+) (-?\d+)/);
    if (queue) {
      const queueItem = Number(queue[1]);
      const queueQty = Number(queue[2]);
      const finishTs = Number(queue[3]);
      if (queueItem !== 255 && queueQty > 0 && finishTs > 0 && finishTs <= Math.floor(Date.now() / 1000)) {
        return "Shipyard queue is ready. Finish the current ship build before starting another ship.";
      }
    }
    return "Shipyard queue is already busy. Finish the current ship or defense build first.";
  }
  if (
    details.includes("NoShipBuild") ||
    details.includes("No ship build is currently queued") ||
    details.includes("custom program error: 0x1786")
  ) {
    return "No ship build is queued right now.";
  }
  if (
    details.includes("NoDefenseBuild") ||
    details.includes("No defense build is currently queued") ||
    details.includes("custom program error: 0x1787")
  ) {
    return "No defense build is queued right now.";
  }
  if (
    details.includes("ShipBuildNotFinished") ||
    details.includes("queued ship build has not finished") ||
    details.includes("custom program error: 0x1788")
  ) {
    return "Ship construction is still in progress. Wait for the timer or use ANTIMATTER to finish it instantly.";
  }
  if (
    details.includes("DefenseBuildNotFinished") ||
    details.includes("queued defense build has not finished") ||
    details.includes("custom program error: 0x1789")
  ) {
    return "Defense construction is still in progress. Wait for the timer or use ANTIMATTER to finish it instantly.";
  }
  if (
    details.includes("EmptyFleet") ||
    details.includes("selected fleet is empty") ||
    details.includes("custom program error: 0x178a")
  ) {
    return "Select at least one ship before launching a mission.";
  }
  if (
    details.includes("NoMissionSlot") ||
    details.includes("No free mission slot is available") ||
    details.includes("custom program error: 0x178b")
  ) {
    return "No mission slots available. Resolve or wait for an existing mission first.";
  }
  if (
    details.includes("InsufficientShips") ||
    details.includes("Insufficient ships are available") ||
    details.includes("custom program error: 0x178c")
  ) {
    return "Not enough ships are available for this fleet.";
  }
  if (
    details.includes("ExceedsCargo") ||
    details.includes("Cargo exceeds the selected fleet capacity") ||
    details.includes("custom program error: 0x178d")
  ) {
    return "Selected cargo exceeds this fleet's capacity.";
  }
  if (
    details.includes("InsufficientResources") ||
    details.includes("Insufficient resources are available") ||
    details.includes("custom program error: 0x178e")
  ) {
    return "Not enough resources are available for this action.";
  }
  if (details.includes("AllianceFull") || details.includes("custom program error: 0x17b3")) {
    return "This alliance is full. The alliance must level up before more players can join.";
  }
  if (details.includes("NotInAlliance") || details.includes("custom program error: 0x17b5")) {
    return "Join or create an alliance before using alliance missions.";
  }
  if (details.includes("AllianceFounderCannotLeave") || details.includes("custom program error: 0x17b6")) {
    return "Alliance founders cannot leave their own alliance in this version.";
  }
  if (details.includes("AllianceMissionAlreadyClaimed") || details.includes("custom program error: 0x17b8")) {
    return "This alliance mission was already claimed for the current period.";
  }
  if (details.includes("AllianceMissionRequirementsNotMet") || details.includes("custom program error: 0x17b9")) {
    return "Alliance mission requirements are not completed yet.";
  }
  if (details.includes("WrongQuestRewardPlanet") || details.includes("custom program error: 0x17c3")) {
    return "Claim this recurring quest from the planet that completed its progress.";
  }
  if (details.includes("ResourceCapExceeded") || details.includes("storage cap") || details.includes("custom program error: 0x17b2")) {
    return "This reward or transfer would exceed your planet storage cap. Spend resources or upgrade storage first.";
  }
  if (details.includes("NewPlayerProtected") || details.includes("new-player protection") || details.includes("custom program error: 0x17a3")) {
    return "Target planet is protected by beginner protection or an active defense shield.";
  }
  if (details.includes("GameplayLocked") || details.includes("gameplay action") || details.includes("custom program error: 0x17a4")) {
    return "This action is still locked for this planet. Wait for the unlock timer.";
  }
  if (details.includes("AttackCooldown") || details.includes("attacker is still on attack cooldown") || details.includes("custom program error: 0x17a5")) {
    return "Attack launch cooldown is still active.";
  }
  if (details.includes("TargetCooldown") || details.includes("target is still on attack cooldown") || details.includes("custom program error: 0x17a6")) {
    return "Target planet was attacked recently. Wait for its cooldown.";
  }
  if (details.includes("AttackPowerTooLow") || details.includes("attacking fleet is too weak") || details.includes("custom program error: 0x17a7")) {
    return "Attack fleet is too weak. Send at least 1,000 combat points.";
  }
  if (details.includes("InvalidTimestamp") || details.includes("timestamp is invalid") || details.includes("custom program error: 0x17a2")) {
    return "The chain timestamp check failed. Refresh planet state and try again.";
  }
  if (
    details.includes("InvalidVaultAuthorization") ||
    details.includes("provided vault authorization is invalid") ||
    details.includes("custom program error: 0x1795")
  ) {
    return "Vault authorization mismatch. Please retry; if it persists, restore the vault with the saved password.";
  }
  return message;
}

function bytesToBase64(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64"); }
function utf8Bytes(value: string): Uint8Array { return new TextEncoder().encode(value); }
function asCryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out as Uint8Array<ArrayBuffer>;
}

function buildVaultRecoveryMessage(authority: PublicKey, salt: Uint8Array): Uint8Array {
  return utf8Bytes(
    `${VAULT_RECOVERY_MESSAGE_PREFIX}\nAuthority:${authority.toBase58()}\nSalt:${bytesToBase64(salt)}`,
  );
}

// ─── GameClient ───────────────────────────────────────────────────────────────
export class GameClient {
  private connection: Connection;
  private provider: AnchorProvider;
  private options: GameClientOptions;
  private activityEventCache = new Map<string, { expiresAt: number; promise: Promise<{ battles: BattleResolvedEventRecord[]; espionage: EspionageReportEventRecord[] }> }>();
  private vaultKeypair: Keypair | null = null;
  private gameplayVaultExecutor: GameplayVaultExecutor | null = null;
  private vaultRecoveryPassphrase: string | null = null;
  private preferVaultSigning = true;
  // Set to true when a backup was found on-chain but decryption failed (wrong password).
  // Allows the UI to distinguish "no backup" from "wrong password".
  private vaultBackupDecryptFailed = false;

  constructor(connection: Connection, provider: AnchorProvider, options: GameClientOptions = {}) {
    this.connection = connection;
    this.provider = provider;
    this.options = options;
    setProvider(provider);
  }

  getConnection(): Connection {
    return this.connection;
  }

  getVaultPublicKey(): PublicKey | null {
    return this.gameplayVaultExecutor?.vaultPublicKey ?? this.vaultKeypair?.publicKey ?? null;
  }

  isVaultReady(): boolean {
    return this.getVaultPublicKey() !== null;
  }

  async getVaultBalanceLamports(): Promise<number> {
    const vault = this.getVaultPublicKey();
    if (!vault) return 0;
    return this.connection.getBalance(vault, "confirmed");
  }

  setGameplayVaultExecutor(executor: GameplayVaultExecutor | null): void {
    this.gameplayVaultExecutor = executor;
    if (executor) {
      // A smart-wallet vault supersedes the legacy decrypted Keypair. Never
      // keep both signing paths live for the same client instance.
      this.vaultKeypair = null;
      this.vaultBackupDecryptFailed = false;
      this.clearCachedVaultRecoveryPassphrase();
      this.preferVaultSigning = true;
    }
  }

  async isGameplayVaultAuthorized(vault = this.gameplayVaultExecutor?.vaultPublicKey): Promise<boolean> {
    if (!vault) return false;
    const authorized = await this.fetchAuthorizedVault(this.provider.wallet.publicKey);
    return Boolean(
      authorized
      && authorized.vault.equals(vault)
      && !authorized.revoked
      && (authorized.expiresAt <= 0 || authorized.expiresAt >= Math.floor(Date.now() / 1000)),
    );
  }

  async isLazorPlayerInitialized(vault = this.gameplayVaultExecutor?.vaultPublicKey): Promise<boolean> {
    if (!vault) return false;
    const account = await this.connection.getAccountInfo(deriveLazorPlayerPda(vault), "confirmed");
    return Boolean(
      account
      && account.owner.equals(GAME_STATE_PROGRAM_ID)
      && account.data.length >= 8
      && Buffer.from(account.data.subarray(0, 8)).equals(LAZOR_PLAYER_PROFILE_DISCRIMINATOR),
    );
  }

  async initializeLazorPlayer(reportProgress?: ProgressReporter): Promise<void> {
    const executor = this.gameplayVaultExecutor;
    if (!executor) throw new Error("Connect a LazorKit passkey wallet first.");
    const vault = executor.vaultPublicKey;
    if (await this.isLazorPlayerInitialized(vault)) return;

    const playerPda = deriveLazorPlayerPda(vault);
    const gameplayProfilePda = derivePlayerProfilePda(vault);
    const gameplayAuthorityPda = deriveAuthorizedVaultPda(vault);
    const rentInstruction = await this.buildSponsoredRentInstruction(vault, [
      { pubkey: playerPda, space: ACCOUNT_SPACE.lazorPlayer },
      { pubkey: gameplayProfilePda, space: ACCOUNT_SPACE.playerProfile },
      { pubkey: gameplayAuthorityPda, space: ACCOUNT_SPACE.authorizedVault },
    ]);

    reportProgress?.("Using Quick Play: creating your permanent GAMESOL player");
    const instruction = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: vault, isSigner: true, isWritable: true },
        { pubkey: playerPda, isSigner: false, isWritable: true },
        { pubkey: gameplayProfilePda, isSigner: false, isWritable: true },
        { pubkey: gameplayAuthorityPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: IX.initializeLazorPlayer,
    });
    // Onboarding requires Quick Play before this step. Reuse that already
    // approved, program-scoped session instead of opening a second passkey
    // review for an inner PDA-signed instruction that cannot simulate by
    // itself in the portal.
    await executor.execute(rentInstruction ? [rentInstruction, instruction] : [instruction], "session");
  }

  async fetchBattleResolvedEvent(signature: string): Promise<BattleResolvedEvent | null> {
    const tx = await this.connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    return parseBattleResolvedEventFromLogs(tx?.meta?.logMessages);
  }

  async fetchEspionageReportEvent(signature: string): Promise<EspionageReportEvent | null> {
    const tx = await this.connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    return parseEspionageReportEventFromLogs(tx?.meta?.logMessages);
  }

  async fetchActivityEventsForPlanets(
    planetPdas: Array<PublicKey | string>,
    limitPerPlanet = 40,
  ): Promise<{ battles: BattleResolvedEventRecord[]; espionage: EspionageReportEventRecord[] }> {
    const planetKeys = planetPdas.map(planet => planet instanceof PublicKey ? planet.toBase58() : planet);
    const cacheKey = `${[...planetKeys].sort().join(",")}:${limitPerPlanet}`;
    const cached = this.activityEventCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    const promise = this.loadActivityEventsForPlanets(planetKeys, limitPerPlanet);
    this.activityEventCache.set(cacheKey, { expiresAt: Date.now() + 30_000, promise });
    void promise.catch(() => this.activityEventCache.delete(cacheKey));
    return promise;
  }

  private async loadActivityEventsForPlanets(
    planetKeys: string[],
    limitPerPlanet: number,
  ): Promise<{ battles: BattleResolvedEventRecord[]; espionage: EspionageReportEventRecord[] }> {
    const planetSet = new Set(planetKeys);
    const signatures = new Map<string, { slot: number; blockTime: number | null }>();

    let nextPlanet = 0;
    const activityConcurrency = IS_SHARED_PUBLIC_RPC ? 1 : Math.min(5, planetKeys.length);
    await Promise.all(Array.from({ length: activityConcurrency }, async () => {
      while (nextPlanet < planetKeys.length) {
        const planetKey = planetKeys[nextPlanet++];
        try {
          const entries = await this.connection.getSignaturesForAddress(
            new PublicKey(planetKey),
            { limit: limitPerPlanet },
            "confirmed",
          );
          for (const entry of entries) {
            if (!signatures.has(entry.signature)) signatures.set(entry.signature, { slot: entry.slot, blockTime: entry.blockTime ?? null });
          }
        } catch {
          // Activity is best-effort; one throttled planet must not hide every report.
        }
        if (IS_SHARED_PUBLIC_RPC && nextPlanet < planetKeys.length) {
          await new Promise(resolve => window.setTimeout(resolve, 300));
        }
      }
    }));

    const battles: BattleResolvedEventRecord[] = [];
    const espionage: EspionageReportEventRecord[] = [];
    const signatureEntries = Array.from(signatures.entries());
    for (let offset = 0; offset < signatureEntries.length; offset += 50) {
      const batch = signatureEntries.slice(offset, offset + 50);
      try {
        const transactions = await this.connection.getTransactions(batch.map(([signature]) => signature), {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        transactions.forEach((tx, index) => {
          if (!tx) return;
          const [signature, meta] = batch[index];
          const battle = parseBattleResolvedEventFromLogs(tx.meta?.logMessages);
          if (battle && (planetSet.has(battle.sourcePlanet) || planetSet.has(battle.destinationPlanet))) {
            battles.push({ signature, slot: tx.slot ?? meta.slot, blockTime: tx.blockTime ?? meta.blockTime, event: battle });
          }
          const spy = parseEspionageReportEventFromLogs(tx.meta?.logMessages);
          if (spy && (planetSet.has(spy.sourcePlanet) || planetSet.has(spy.destinationPlanet))) {
            espionage.push({ signature, slot: tx.slot ?? meta.slot, blockTime: tx.blockTime ?? meta.blockTime, event: spy });
          }
        });
      } catch {
        // Historical transaction batches are best-effort and depend on the RPC node.
      }
    }

    battles.sort((a, b) => {
      const bTime = b.event.resolvedAt || b.blockTime || 0;
      const aTime = a.event.resolvedAt || a.blockTime || 0;
      return bTime - aTime;
    });
    espionage.sort((a, b) => {
      const bTime = b.event.resolvedAt || b.blockTime || 0;
      const aTime = a.event.resolvedAt || a.blockTime || 0;
      return bTime - aTime;
    });
    return { battles, espionage };
  }

  async fetchBattleResolvedEventsForPlanets(
    planetPdas: Array<PublicKey | string>,
    limitPerPlanet = 40,
  ): Promise<BattleResolvedEventRecord[]> {
    return (await this.fetchActivityEventsForPlanets(planetPdas, limitPerPlanet)).battles;
  }

  async fetchEspionageReportEventsForPlanets(
    planetPdas: Array<PublicKey | string>,
    limitPerPlanet = 40,
  ): Promise<EspionageReportEventRecord[]> {
    return (await this.fetchActivityEventsForPlanets(planetPdas, limitPerPlanet)).espionage;
  }

  /**
   * Returns a structured vault status for the UI to show appropriate recovery options.
   * Call after ensureVault() has been attempted.
   */
  async getVaultStatus(): Promise<VaultStatus> {
    if (this.gameplayVaultExecutor) {
      return await this.isGameplayVaultAuthorized() ? "ready" : "not_initialized";
    }
    if (this.vaultKeypair !== null) return "ready";
    if (this.vaultBackupDecryptFailed) return "wrong_password";
    // Check if a backup exists at all
    const backup = await this.fetchVaultBackup();
    if (!backup) return "backup_missing";
    return "wrong_password"; // backup exists but we haven't decrypted it yet
  }

  /**
   * Best-effort restore of an existing vault for the connected wallet.
   * This never creates a new vault or writes on-chain state.
   */
  async restoreExistingVault(reportProgress?: ProgressReporter): Promise<Keypair | null> {
    if (this.vaultKeypair) return this.vaultKeypair;
    return this.tryRestoreVaultFromBackup(reportProgress);
  }

  clearCachedVaultRecoveryPassphrase(): void {
    this.vaultRecoveryPassphrase = null;
  }

  setPreferVaultSigning(value: boolean): void {
    this.preferVaultSigning = value;
  }

  getPreferVaultSigning(): boolean {
    return this.preferVaultSigning;
  }

  // ── Crypto helpers ──────────────────────────────────────────────────────────
  private async promptVaultRecoveryPassphrase(createIfMissing: boolean): Promise<string> {
    if (this.vaultRecoveryPassphrase && !createIfMissing) return this.vaultRecoveryPassphrase;

    if (this.options.requestVaultRecoveryPassphrase) {
      const value = await this.options.requestVaultRecoveryPassphrase({
        mode: createIfMissing ? "create" : "unlock",
        wallet: this.provider.wallet.publicKey.toBase58(),
      });
      const trimmed = value?.trim();
      if (!trimmed) throw new Error("Vault recovery password is required.");
      this.vaultRecoveryPassphrase = trimmed;
      return trimmed;
    }

    const promptFn = globalThis.prompt;
    if (promptFn) {
      const promptText = createIfMissing
        ? "Choose a strong vault recovery password:"
        : "Enter your vault recovery password to restore game access:";
      const value = promptFn(promptText)?.trim();
      if (!value) throw new Error("A vault recovery password is required.");
      this.vaultRecoveryPassphrase = value;
      return value;
    }

    throw new Error(
      "No recovery passphrase handler provided. " +
      "Pass `requestVaultRecoveryPassphrase` in GameClientOptions.",
    );
  }

  async withdrawVaultLamports(lamports: number, destination?: PublicKey): Promise<string> {
    if (lamports <= 0) throw new Error("Invalid withdraw amount.");

    if (this.gameplayVaultExecutor) {
      if (!destination) throw new Error("Choose where you want to send the SOL.");
      if (destination.equals(this.gameplayVaultExecutor.vaultPublicKey)) {
        throw new Error("Choose an address different from your game account.");
      }
      return this.gameplayVaultExecutor.execute([
        SystemProgram.transfer({
          fromPubkey: this.gameplayVaultExecutor.vaultPublicKey,
          toPubkey: destination,
          lamports,
        }),
      ], "passkey");
    }

    if (!this.vaultKeypair) throw new Error("Vault is not ready.");

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.vaultKeypair.publicKey,
        toPubkey: this.provider.wallet.publicKey,
        lamports,
      }),
    );

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");

    tx.recentBlockhash = blockhash;
    tx.feePayer = this.vaultKeypair.publicKey;
    tx.sign(this.vaultKeypair);

    const sig = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    await this.connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    return sig;
  }

  async withdrawVaultToken(
    mint: PublicKey,
    rawAmount: bigint,
    decimals: number,
    destinationOwner: PublicKey,
  ): Promise<string> {
    if (!this.gameplayVaultExecutor) {
      throw new Error("Token sending is available for passkey game accounts only.");
    }
    if (rawAmount <= 0n) throw new Error("Enter an amount greater than zero.");
    const vault = this.gameplayVaultExecutor.vaultPublicKey;
    if (destinationOwner.equals(vault)) {
      throw new Error("Choose an address different from your game account.");
    }
    const source = deriveAssociatedTokenAccount(vault, mint);
    const destination = deriveAssociatedTokenAccount(destinationOwner, mint);
    const sourceInfo = await this.connection.getAccountInfo(source, "confirmed");
    if (!sourceInfo) throw new Error("Your game account does not hold this token yet.");
    const destinationInfo = await this.connection.getAccountInfo(destination, "confirmed");
    const instructions: TransactionInstruction[] = [];
    if (!destinationInfo) {
      instructions.push(createAssociatedTokenAccountInstruction(
        this.gameplayVaultExecutor.payerPublicKey,
        destinationOwner,
        mint,
      ));
    }
    instructions.push(createTransferCheckedTokenInstruction(
      source,
      mint,
      destination,
      vault,
      rawAmount,
      decimals,
    ));
    return this.gameplayVaultExecutor.execute(instructions, "passkey");
  }

  async depositToVaultLamports(lamports: number): Promise<string> {
    const vault = this.getVaultPublicKey();
    if (!vault) throw new Error("Vault is not ready.");
    if (!Number.isFinite(lamports) || lamports <= 0) {
      throw new Error("Invalid deposit amount.");
    }
    if (this.gameplayVaultExecutor && vault.equals(this.provider.wallet.publicKey)) {
      throw new Error("The LazorKit vault is the player wallet. Fund this address directly or use the devnet faucet.");
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.provider.wallet.publicKey,
        toPubkey: vault,
        lamports,
      }),
    );

    tx.feePayer = this.provider.wallet.publicKey;

    return this.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  }

  private async ensureVaultLamports(
    vault: Keypair | PublicKey,
    minLamports = VAULT_MIN_BALANCE_LAMPORTS,
    reportProgress?: ProgressReporter,
  ): Promise<void> {
    const vaultPublicKey = vault instanceof PublicKey ? vault : vault.publicKey;
    const balance = await this.connection.getBalance(vaultPublicKey, "confirmed");
    if (balance >= minLamports) return;
    if (this.gameplayVaultExecutor && vaultPublicKey.equals(this.provider.wallet.publicKey)) {
      throw new Error("Fund the LazorKit wallet with at least 0.05 devnet SOL before creating game accounts.");
    }

    const topUp = VAULT_TARGET_BALANCE_LAMPORTS - balance;
    if (topUp <= 0) return;

    reportProgress?.("Signing with wallet: topping up vault SOL for account rent");
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.provider.wallet.publicKey,
        toPubkey: vaultPublicKey,
        lamports: topUp,
      }),
    );
    await this.provider.sendAndConfirm(fundTx, [], { commitment: "confirmed" });
  }

  private async buildSponsoredRentInstruction(
    rentReceiver: PublicKey,
    accounts: Array<{ pubkey: PublicKey; space: number }>,
  ): Promise<TransactionInstruction | null> {
    const executor = this.gameplayVaultExecutor;
    if (!executor || accounts.length === 0) return null;

    const infos = await this.connection.getMultipleAccountsInfo(
      accounts.map(({ pubkey }) => pubkey),
      "confirmed",
    );
    const missing = accounts.filter((_, index) => infos[index] === null);
    if (missing.length === 0) return null;

    // Network rent can change; quote each distinct missing account size once.
    const lamports = await accountRentTotal(this.connection, missing.map(({ space }) => space));
    const amount = Buffer.alloc(8);
    amount.writeBigUInt64LE(BigInt(lamports));
    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: executor.payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: rentReceiver, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.sponsorAccountRent, amount),
    });
  }

  /**
   * Build the bounded rent contribution used by other trusted GAMESOL clients.
   * The hosted paymaster still validates the exact companion instruction and
   * verifies through simulation that the contribution becomes program-owned
   * account rent in the same transaction.
   */
  async buildSponsoredProgramRentInstruction(
    rentReceiver: PublicKey,
    accounts: Array<{ pubkey: PublicKey; space: number }>,
  ): Promise<TransactionInstruction | null> {
    return this.buildSponsoredRentInstruction(rentReceiver, accounts);
  }

  async buildSponsoredTokenAccountRentInstruction(
    tokenAccounts: PublicKey[],
  ): Promise<TransactionInstruction | null> {
    return this.buildSponsoredRentInstruction(
      this.provider.wallet.publicKey,
      tokenAccounts.map((pubkey) => ({ pubkey, space: 165 })),
    );
  }

  private async getVaultRecoverySignature(salt: Uint8Array): Promise<Uint8Array | null> {
    const wallet = this.provider.wallet as unknown as { signMessage?: (msg: Uint8Array) => Promise<Uint8Array> };
    if (typeof wallet.signMessage === "function") {
      const message = buildVaultRecoveryMessage(this.provider.wallet.publicKey, salt);
      return wallet.signMessage.call(this.provider.wallet, message);
    }
    return null;
  }

  private async deriveVaultEncryptionKey(
    salt: Uint8Array,
    kdfSalt: Uint8Array,
    createIfMissing: boolean,
  ): Promise<CryptoKey> {
    const passphrase = await this.promptVaultRecoveryPassphrase(createIfMissing);
    const signature = await this.getVaultRecoverySignature(salt);
    const contextBytes = signature
      ? signature
      : utf8Bytes(`${this.provider.wallet.publicKey.toBase58()}:${bytesToBase64(salt)}:no-sign-message`);
    const keyMaterialBytes = asCryptoBytes(new Uint8Array([...contextBytes, ...utf8Bytes(`:${passphrase}`)]));
    const keyMaterial = await crypto.subtle.importKey("raw", keyMaterialBytes, "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: asCryptoBytes(kdfSalt), iterations: 250_000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  private async encryptVaultSecretKey(
    vault: Keypair,
  ): Promise<{ ciphertext: Uint8Array; iv: Uint8Array; salt: Uint8Array; kdfSalt: Uint8Array }> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kdfSalt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveVaultEncryptionKey(salt, kdfSalt, true);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: asCryptoBytes(iv) }, key, asCryptoBytes(vault.secretKey)),
    );
    return { ciphertext, iv, salt, kdfSalt };
  }

  private async decryptVaultSecretKey(backup: VaultBackupAccount): Promise<Keypair> {
    const key = await this.deriveVaultEncryptionKey(backup.salt, backup.kdfSalt, false);
    const secretKey = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: asCryptoBytes(backup.iv) },
        key,
        asCryptoBytes(backup.ciphertext),
      ),
    );
    const vault = Keypair.fromSecretKey(secretKey);
    if (!vault.publicKey.equals(backup.vault)) {
      throw new Error("Recovered vault key does not match the on-chain backup.");
    }
    return vault;
  }

  private async fetchVaultBackup(): Promise<VaultBackupAccount | null> {
    const pda = deriveVaultBackupPda(this.provider.wallet.publicKey);
    const account = await this.connection.getAccountInfo(pda, "confirmed");
    if (!account?.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeVaultBackup(Buffer.from(account.data)); }
    catch { return null; }
  }

  async getGameConfig(): Promise<GameConfigState | null> {
    const gameConfigPda = deriveGameConfigPda();
    const account = await this.connection.getAccountInfo(gameConfigPda, "confirmed");
    if (!account?.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try {
      const config = deserializeGameConfig(Buffer.from(account.data));
      return {
        admin: config.admin.toBase58(),
        antimatterMint: config.antimatterMint.toBase58(),
      };
    } catch {
      return null;
    }
  }
  async getStoreConfig(): Promise<StoreConfigState | null> {
    const storeConfigPda = deriveStoreConfigPda();
    const account = await this.connection.getAccountInfo(storeConfigPda, "confirmed");
    if (!account?.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeStoreConfig(Buffer.from(account.data)); }
    catch { return null; }
  }

  async getStorePurchaseState(authority: PublicKey = this.provider.wallet.publicKey): Promise<StorePurchaseStateAccount | null> {
    const purchasePda = deriveStorePurchaseStatePda(authority);
    const account = await this.connection.getAccountInfo(purchasePda, "confirmed");
    if (!account?.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeStorePurchaseState(Buffer.from(account.data)); }
    catch { return null; }
  }


  private async findUserTokenAccountForMint(owner: PublicKey, mint: PublicKey, minAmount: bigint = 1n): Promise<PublicKey> {
    const response = await this.connection.getParsedTokenAccountsByOwner(
      owner,
      { mint, programId: TOKEN_PROGRAM_ID },
      "confirmed",
    );
    let best: { pubkey: PublicKey; amount: bigint } | null = null;
    for (const account of response.value) {
      const parsed = account.account.data as any;
      const amount = BigInt(parsed?.parsed?.info?.tokenAmount?.amount ?? "0");
      if (!best || amount > best.amount) best = { pubkey: account.pubkey, amount };
      if (amount >= minAmount) return account.pubkey;
    }
    if (!best) {
      throw new Error(`No token account found for mint ${mint.toBase58()}.`);
    }
    throw new Error(
      `No single token account for mint ${mint.toBase58()} has enough balance. ` +
      `Required ${minAmount.toString()}, best account has ${best.amount.toString()}.`,
    );
  }

  private async tryRestoreVaultFromBackup(reportProgress?: ProgressReporter): Promise<Keypair | null> {
    const backup = await this.fetchVaultBackup();
    if (!backup) {
      console.log("[GAME_STATE:vault_backup] miss");
      return null;
    }
    // A valid AES-GCM vault backup contains a 64-byte secret key plus the
    // authentication tag, a 12-byte IV, and two 16-byte salts. Legacy devnet
    // bootstrap accounts used one-byte placeholder ciphertext; reject those
    // before asking for a password that can never decrypt them.
    if (
      backup.ciphertext.length < 80
      || backup.iv.length !== 12
      || backup.salt.length !== 16
      || backup.kdfSalt.length !== 16
    ) {
      console.warn("[GAME_STATE:vault_backup] invalid legacy backup payload");
      this.vaultBackupDecryptFailed = true;
      this.clearCachedVaultRecoveryPassphrase();
      this.options.onVaultRecoveryPassphraseRejected?.(this.provider.wallet.publicKey.toBase58());
      return null;
    }
    reportProgress?.("Restoring vault from encrypted on-chain backup...");
    let vault: Keypair;
    try {
      vault = await this.decryptVaultSecretKey(backup);
    } catch (err) {
      // Wrong password or corrupted backup — mark the flag so the UI can
      // show a "wrong password" recovery option rather than a generic error.
      console.warn("[GAME_STATE:vault_backup] decryption failed", err);
      this.vaultBackupDecryptFailed = true;
      this.clearCachedVaultRecoveryPassphrase();
      this.options.onVaultRecoveryPassphraseRejected?.(this.provider.wallet.publicKey.toBase58());
      return null;
    }
    this.vaultBackupDecryptFailed = false;
    // Recovery must remain read-only. Funding here forces an unexpected wallet
    // signature and can hide an otherwise valid vault when the top-up fails.
    this.vaultKeypair = vault;
    console.log("[GAME_STATE:vault_backup] restored", { vault: vault.publicKey.toBase58() });
    return vault;
  }

  // ── Vault setup ─────────────────────────────────────────────────────────────
  async ensureVault(reportProgress?: ProgressReporter): Promise<Keypair> {
    const restored = await this.tryRestoreVaultFromBackup(reportProgress);
    if (restored) return restored;

    const vault = Keypair.generate();
    reportProgress?.("Signing with wallet: funding fresh vault keypair");
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.provider.wallet.publicKey,
        toPubkey: vault.publicKey,
        lamports: VAULT_TARGET_BALANCE_LAMPORTS,
      }),
    );
    await this.provider.sendAndConfirm(fundTx, [], { commitment: "confirmed" });
    this.vaultKeypair = vault;
    return vault;
  }

  // ── Instruction senders ──────────────────────────────────────────────────────
  private async sendInstruction(
    instructions: TransactionInstruction[],
    extraSigners: Keypair[] = [],
  ): Promise<string> {
    try {
      if (this.gameplayVaultExecutor && extraSigners.length === 0) {
        return this.gameplayVaultExecutor.execute(instructions, "passkey");
      }
      const fullInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: DEFAULT_TX_COMPUTE_UNITS }),
        ...instructions,
      ];
      if (DEFAULT_PRIORITY_FEE_MICROLAMPORTS > 0) {
        fullInstructions.splice(
          1,
          0,
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: DEFAULT_PRIORITY_FEE_MICROLAMPORTS,
          }),
        );
      }

      const tx = new Transaction().add(...fullInstructions);

      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash("confirmed");

      tx.recentBlockhash = blockhash;

      if (extraSigners.length > 0) {
        tx.feePayer = extraSigners[0].publicKey;
        tx.sign(...extraSigners);

        const sig = await this.connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });

        await this.connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed",
        );

        return sig;
      }

      tx.feePayer = this.provider.wallet.publicKey;
      return this.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
    } catch (err) {
      if (err instanceof SendTransactionError) {
        let logs = err.logs ?? [];
        try {
          logs = (await err.getLogs(this.connection)) ?? logs;
        } catch {
          // Keep the original error if logs cannot be fetched.
        }
        throw new Error(mapSendTransactionError(err.message, logs));
      }
      throw err;
    }
  }

  async sendAuthorityInstructions(instructions: TransactionInstruction[]): Promise<string> {
    return this.sendInstruction(instructions);
  }

  async sendUfoInstructions(commander: PublicKey, instructions: TransactionInstruction[]): Promise<string> {
    if (!commander.equals(this.provider.wallet.publicKey)) throw new Error('UFO utility requires the active game commander.');
    if (this.gameplayVaultExecutor) return this.gameplayVaultExecutor.execute(instructions, 'session');
    return this.sendInstruction(instructions);
  }

  private activeVaultPublicKey(): PublicKey | null {
    if (!this.preferVaultSigning) return null;
    return this.gameplayVaultExecutor?.vaultPublicKey ?? this.vaultKeypair?.publicKey ?? null;
  }

  private async sendVaultInstruction(
    instructions: TransactionInstruction[],
    authorization: GameplayVaultAuthorization = "session",
  ): Promise<string> {
    if (this.gameplayVaultExecutor) {
      return this.gameplayVaultExecutor.execute(instructions, authorization);
    }
    if (!this.vaultKeypair) {
      throw new Error("Gameplay vault is locked or not authorized.");
    }
    return this.sendInstruction(instructions, [this.vaultKeypair]);
  }

  // ── Player / vault initialization ────────────────────────────────────────────
  private async initializeVaultForExistingPlayer(reportProgress?: ProgressReporter): Promise<Keypair> {
    const authority = this.provider.wallet.publicKey;
    const vault = await this.ensureVault(reportProgress);
    const encrypted = await this.encryptVaultSecretKey(vault);

    reportProgress?.("Signing with wallet: creating vault authorization for your marketplace planet");

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: derivePlayerProfilePda(authority), isSigner: false, isWritable: false },
        { pubkey: deriveAuthorizedVaultPda(authority), isSigner: false, isWritable: true },
        { pubkey: deriveVaultBackupPda(authority), isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(
        IX.initializeVaultForExistingPlayer,
        encodeInitializePlayerArgs(
          vault.publicKey,
          0,
          VAULT_BACKUP_VERSION,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.salt,
          encrypted.kdfSalt,
        ),
      ),
    });

    await this.sendInstruction([ix]);
    this.vaultKeypair = vault;
    return vault;
  }

  async initializePlayer(reportProgress?: ProgressReporter): Promise<void> {
    const authority = this.provider.wallet.publicKey;
    const profilePda = derivePlayerProfilePda(authority);
    const authorizedVaultPda = deriveAuthorizedVaultPda(authority);
    const vaultBackupPda = deriveVaultBackupPda(authority);

    const existing = await this.connection.getAccountInfo(profilePda, "confirmed");
    if (existing) {
      const authorizedVault = await this.fetchAuthorizedVault(authority);
      if (!authorizedVault) {
        await this.initializeVaultForExistingPlayer(reportProgress);
        return;
      }
      const restored = await this.restoreAuthorizedVaultForExistingProfile(authority, reportProgress);
      this.vaultKeypair = restored;
      return;
    }

    reportProgress?.("Signing with wallet: generating vault keypair");
    const vault = await this.ensureVault(reportProgress);
    const encrypted = await this.encryptVaultSecretKey(vault);

    reportProgress?.("Signing with wallet: creating player profile, vault authorization, and vault backup");

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority,          isSigner: true,  isWritable: true  },
        { pubkey: profilePda,         isSigner: false, isWritable: true  },
        { pubkey: authorizedVaultPda, isSigner: false, isWritable: true  },
        { pubkey: vaultBackupPda,     isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(
        IX.initializePlayer,
        encodeInitializePlayerArgs(
          vault.publicKey,
          0,
          VAULT_BACKUP_VERSION,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.salt,
          encrypted.kdfSalt,
        ),
      ),
    });

    await this.sendInstruction([ix]);
  }

  /**
   * Registers the configured smart-wallet vault PDA as this player's gameplay
   * signer. The connected Solana wallet remains the permanent player/recovery
   * authority and is the only signer allowed to replace this authorization.
   *
    * Version 2 backups contain only a non-secret marker: a PDA has no private
    * key to encrypt, export, or recover.
   */
  async activateGameplayVault(reportProgress?: ProgressReporter): Promise<void> {
    const executor = this.gameplayVaultExecutor;
    if (!executor) throw new Error("Connect a LazorKit passkey wallet first.");

    const authority = this.provider.wallet.publicKey;
    const vault = executor.vaultPublicKey;
    const profilePda = derivePlayerProfilePda(authority);
    const authorizedVaultPda = deriveAuthorizedVaultPda(authority);
    const vaultBackupPda = deriveVaultBackupPda(authority);
    const [profile, authorized] = await Promise.all([
      this.fetchPlayerProfile(authority),
      this.fetchAuthorizedVault(authority),
    ]);

    const emptyCiphertext = new Uint8Array([PASSKEY_VAULT_BACKUP_VERSION]);
    const emptyIv = new Uint8Array(12);
    const emptySalt = new Uint8Array(16);
    const emptyKdfSalt = new Uint8Array(16);
    let ix: TransactionInstruction | null = null;

    if (!profile) {
      reportProgress?.("Authorizing with passkey: creating the player profile");
      ix = new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: profilePda, isSigner: false, isWritable: true },
          { pubkey: authorizedVaultPda, isSigner: false, isWritable: true },
          { pubkey: vaultBackupPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: encodeInstruction(
          IX.initializePlayer,
          encodeInitializePlayerArgs(
            vault,
            0,
            PASSKEY_VAULT_BACKUP_VERSION,
            emptyCiphertext,
            emptyIv,
            emptySalt,
            emptyKdfSalt,
          ),
        ),
      });
    } else if (!authorized) {
      reportProgress?.("Authorizing with passkey: attaching the gameplay wallet");
      ix = new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: profilePda, isSigner: false, isWritable: false },
          { pubkey: authorizedVaultPda, isSigner: false, isWritable: true },
          { pubkey: vaultBackupPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: encodeInstruction(
          IX.initializeVaultForExistingPlayer,
          encodeInitializePlayerArgs(
            vault,
            0,
            PASSKEY_VAULT_BACKUP_VERSION,
            emptyCiphertext,
            emptyIv,
            emptySalt,
            emptyKdfSalt,
          ),
        ),
      });
    } else if (!authorized.vault.equals(vault) || authorized.revoked) {
      reportProgress?.("Authorizing with passkey: updating the gameplay wallet");
      ix = new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: authorizedVaultPda, isSigner: false, isWritable: true },
          { pubkey: vaultBackupPda, isSigner: false, isWritable: true },
        ],
        data: encodeInstruction(
          IX.rotateVault,
          encodeRotateVaultArgs(
            vault,
            0,
            PASSKEY_VAULT_BACKUP_VERSION,
            emptyCiphertext,
            emptyIv,
            emptySalt,
            emptyKdfSalt,
          ),
        ),
      });
    }

    if (ix) await this.sendInstruction([ix]);
    this.vaultKeypair = null;
    this.vaultBackupDecryptFailed = false;
    this.preferVaultSigning = true;
  }





  async rotateVault(reportProgress?: ProgressReporter): Promise<void> {
    const authority = this.provider.wallet.publicKey;
    const authorizedVaultPda = deriveAuthorizedVaultPda(authority);
    const vaultBackupPda = deriveVaultBackupPda(authority);

    const newVault = Keypair.generate();
    reportProgress?.("Signing with wallet: funding new vault keypair");
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority,
        toPubkey: newVault.publicKey,
        lamports: VAULT_TARGET_BALANCE_LAMPORTS,
      }),
    );
    await this.provider.sendAndConfirm(fundTx, [], { commitment: "confirmed" });

    const encrypted = await this.encryptVaultSecretKey(newVault);

    reportProgress?.("Signing with wallet: rotating vault on-chain");
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority,          isSigner: true,  isWritable: true  },
        { pubkey: authorizedVaultPda, isSigner: false, isWritable: true  },
        { pubkey: vaultBackupPda,     isSigner: false, isWritable: true  },
      ],
      data: encodeInstruction(
        IX.rotateVault,
        encodeRotateVaultArgs(
          newVault.publicKey,
          0,
          VAULT_BACKUP_VERSION,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.salt,
          encrypted.kdfSalt,
        ),
      ),
    });

    await this.sendInstruction([ix]);
    this.vaultKeypair = newVault;
  }

  /**
   * Emergency vault recovery — generates a brand new vault keypair and updates
   * the on-chain backup, even if the current vault keypair is lost or the
   * existing backup can't be decrypted.
   *
   * Requires one wallet signature. Use this when:
   * - The vault account SOL was drained and the keypair is no longer accessible
   * - The recovery password was forgotten and the backup can't be decrypted
   * - The vault keypair was compromised
   *
   * After this call the old vault keypair (if any) is abandoned. Its remaining
   * SOL is NOT recovered — the user should withdraw before calling this if
   * they still have access to the old vault.
   */
  async initializeGameConfig(antimatterMint: PublicKey): Promise<string> {
    const admin = this.provider.wallet.publicKey;
    const gameConfigPda = deriveGameConfigPda();

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: admin, isSigner: true, isWritable: true },
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.initializeGameConfig, encodePubkeyArg(antimatterMint)),
    });

    return this.sendInstruction([ix]);
  }

  async updateAntimatterMint(antimatterMint: PublicKey): Promise<string> {
    const admin = this.provider.wallet.publicKey;
    const gameConfigPda = deriveGameConfigPda();

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: admin, isSigner: true, isWritable: true },
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.updateAntimatterMint, encodePubkeyArg(antimatterMint)),
    });

    return this.sendInstruction([ix]);
  }

  private async accelerateWithAntimatter(
    entityPda: PublicKey,
    discriminator: Buffer,
  ): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    await this.ensureQuestProgress();
    await this.ensureQuestRewardTargets(authority);
    const gameConfigPda = deriveGameConfigPda();
    const config = await this.getGameConfig();
    if (!config) {
      throw new Error("Game config is not initialized.");
    }

    const antimatterMint = new PublicKey(config.antimatterMint);
    const userAntimatterAccount = await this.findUserTokenAccountForMint(authority, antimatterMint);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: gameConfigPda, isSigner: false, isWritable: false },
        { pubkey: entityPda, isSigner: false, isWritable: true },
        { pubkey: antimatterMint, isSigner: false, isWritable: true },
        { pubkey: userAntimatterAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: deriveQuestProgressPda(authority), isSigner: false, isWritable: true },
        { pubkey: deriveQuestRewardTargetsPda(authority), isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(discriminator),
    });

    return this.sendInstruction([ix]);
  }

  async accelerateBuildWithAntimatter(entityPda: PublicKey): Promise<string> {
    return this.accelerateWithAntimatter(entityPda, IX.accelerateBuildWithAntimatter);
  }

  async accelerateResearchWithAntimatter(entityPda: PublicKey): Promise<string> {
    return this.accelerateWithAntimatter(entityPda, IX.accelerateResearchWithAntimatter);
  }

  async accelerateShipBuildWithAntimatter(entityPda: PublicKey): Promise<string> {
    return this.accelerateWithAntimatter(entityPda, IX.accelerateShipBuildWithAntimatter);
  }

  async accelerateDefenseBuildWithAntimatter(entityPda: PublicKey): Promise<string> {
    return this.accelerateWithAntimatter(entityPda, IX.accelerateDefenseBuildWithAntimatter);
  }

  async accelerateMissionWithAntimatter(entityPda: PublicKey, slot: number, leg: number): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    await this.ensureQuestProgress();
    await this.ensureQuestRewardTargets(authority);
    const gameConfigPda = deriveGameConfigPda();
    const config = await this.getGameConfig();
    if (!config) throw new Error("Game config is not initialized.");
    const antimatterMint = new PublicKey(config.antimatterMint);
    const userAntimatterAccount = await this.findUserTokenAccountForMint(authority, antimatterMint);
    const writer = new BorshWriter();
    writer.writeU8(slot);
    writer.writeU8(leg);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: gameConfigPda, isSigner: false, isWritable: false },
        { pubkey: entityPda, isSigner: false, isWritable: true },
        { pubkey: antimatterMint, isSigner: false, isWritable: true },
        { pubkey: userAntimatterAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: deriveQuestProgressPda(authority), isSigner: false, isWritable: true },
        { pubkey: deriveQuestRewardTargetsPda(authority), isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.accelerateMissionWithAntimatter, writer.toBuffer()),
    });
    return this.sendInstruction([ix]);
  }

  async purchaseStorePack(entityPda: PublicKey, period: number, packId: number): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    await this.ensureQuestProgress();
    await this.ensureQuestRewardTargets(authority);
    const config = await this.getStoreConfig();
    if (!config) throw new Error("Store is not initialized yet.");
    if (!config.enabled) throw new Error("Store is currently disabled.");
    const usdcMint = new PublicKey(config.usdcMint);
    const userUsdcAccount = await this.findUserTokenAccountForMint(
      authority,
      usdcMint,
      storePackPriceUsdc(period, packId),
    );
    const writer = new BorshWriter();
    writer.writeU8(period);
    writer.writeU8(packId);
    const purchaseStatePda = deriveStorePurchaseStatePda(authority);
    const rentInstruction = await this.buildSponsoredRentInstruction(authority, [
      { pubkey: purchaseStatePda, space: ACCOUNT_SPACE.storePurchaseState },
    ]);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: deriveStoreConfigPda(), isSigner: false, isWritable: false },
        { pubkey: purchaseStatePda, isSigner: false, isWritable: true },
        { pubkey: entityPda, isSigner: false, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: userUsdcAccount, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(config.treasuryUsdcAccount), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: deriveQuestProgressPda(authority), isSigner: false, isWritable: true },
        { pubkey: deriveQuestRewardTargetsPda(authority), isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.purchaseStorePack, writer.toBuffer()),
    });
    return this.sendInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  async forceRotateVault(reportProgress?: ProgressReporter): Promise<void> {
    const authority = this.provider.wallet.publicKey;
    const authorizedVaultPda = deriveAuthorizedVaultPda(authority);
    const vaultBackupPda = deriveVaultBackupPda(authority);

    this.vaultKeypair = null;
    this.vaultBackupDecryptFailed = false;
    this.clearCachedVaultRecoveryPassphrase();

    const newVault = Keypair.generate();
    reportProgress?.("Signing with wallet: funding new vault keypair");
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority,
        toPubkey: newVault.publicKey,
        lamports: VAULT_TARGET_BALANCE_LAMPORTS,
      }),
    );
    await this.provider.sendAndConfirm(fundTx, [], { commitment: "confirmed" });

    const encrypted = await this.encryptVaultSecretKey(newVault);

    reportProgress?.("Signing with wallet: updating vault on-chain");
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority,          isSigner: true,  isWritable: true  },
        { pubkey: authorizedVaultPda, isSigner: false, isWritable: true  },
        { pubkey: vaultBackupPda,     isSigner: false, isWritable: true  },
      ],
      data: encodeInstruction(
        IX.rotateVault,
        encodeRotateVaultArgs(
          newVault.publicKey,
          0,
          VAULT_BACKUP_VERSION,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.salt,
          encrypted.kdfSalt,
        ),
      ),
    });

    await this.sendInstruction([ix]);
    this.vaultKeypair = newVault;
    reportProgress?.("Vault recovered successfully.");
  }

  /**
   * Retry vault restoration with a fresh password attempt.
   * Call this when the user wants to try a different password after a
   * `wrong_password` status. Clears the in-memory passphrase and retries
   * `tryRestoreVaultFromBackup`.
   */
  async retryVaultPassword(reportProgress?: ProgressReporter): Promise<boolean> {
    this.clearCachedVaultRecoveryPassphrase();
    this.vaultBackupDecryptFailed = false;
    const restored = await this.tryRestoreVaultFromBackup(reportProgress);
    return restored !== null;
  }
  private async fetchPlayerProfile(walletPubkey: PublicKey): Promise<PlayerProfileAccount | null> {
    const profilePda = derivePlayerProfilePda(walletPubkey);
    const account = await this.connection.getAccountInfo(profilePda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializePlayerProfile(Buffer.from(account.data)); }
    catch { return null; }
  }

  private async getMultipleAccountsInfoBatched(pubkeys: PublicKey[]) {
    const accounts: Array<Awaited<ReturnType<Connection["getAccountInfo"]>>> = [];
    for (let offset = 0; offset < pubkeys.length; offset += RPC_ACCOUNT_BATCH_SIZE) {
      const batch = pubkeys.slice(offset, offset + RPC_ACCOUNT_BATCH_SIZE);
      accounts.push(...await this.connection.getMultipleAccountsInfo(batch, "confirmed"));
    }
    return accounts;
  }

  async getPlayerPlanetCount(walletPubkey: PublicKey = this.provider.wallet.publicKey): Promise<number> {
    return (await this.fetchPlayerProfile(walletPubkey))?.planetCount ?? 0;
  }

  async findPlanetOwnerIndexPda(authority: PublicKey, planetPda: PublicKey): Promise<PublicKey | null> {
    const count = await this.getPlayerPlanetCount(authority);
    if (count <= 0) return null;
    const indexPdas = Array.from({ length: count }, (_, i) => derivePlanetOwnerIndexPda(authority, i));
    const accounts = await this.getMultipleAccountsInfoBatched(indexPdas);
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) continue;
      try {
        const index = deserializePlanetOwnerIndex(Buffer.from(account.data));
        if (index.active && index.authority.equals(authority) && index.planet.equals(planetPda)) {
          return indexPdas[i];
        }
      } catch { /* skip malformed */ }
    }
    return null;
  }

  async getQuestState(authority: PublicKey = this.provider.wallet.publicKey): Promise<QuestStateAccount | null> {
    const questPda = deriveQuestStatePda(authority);
    const account = await this.connection.getAccountInfo(questPda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeQuestState(Buffer.from(account.data)); }
    catch { return null; }
  }

  async getQuestProgress(authority: PublicKey = this.provider.wallet.publicKey): Promise<QuestProgressStateAccount | null> {
    const progressPda = deriveQuestProgressPda(authority);
    const account = await this.connection.getAccountInfo(progressPda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeQuestProgressState(Buffer.from(account.data)); }
    catch { return null; }
  }

  async getQuestRewardTargets(authority: PublicKey = this.provider.wallet.publicKey): Promise<QuestRewardTargetStateAccount | null> {
    const targetsPda = deriveQuestRewardTargetsPda(authority);
    const account = await this.connection.getAccountInfo(targetsPda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeQuestRewardTargetState(Buffer.from(account.data)); }
    catch { return null; }
  }

  async hasTutorialQuestRewardTargets(authority: PublicKey = this.provider.wallet.publicKey): Promise<boolean> {
    const tutorialQuestRewardTargetsPda = deriveQuestTutorialRewardTargetsPda(authority);
    const account = await this.connection.getAccountInfo(tutorialQuestRewardTargetsPda, "confirmed");
    return !!account && account.owner.equals(GAME_STATE_PROGRAM_ID);
  }

  async getAllianceMembership(authority: PublicKey = this.provider.wallet.publicKey): Promise<AllianceMembershipAccount | null> {
    const membershipPda = deriveAllianceMembershipPda(authority);
    const account = await this.connection.getAccountInfo(membershipPda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeAllianceMembership(Buffer.from(account.data)); }
    catch { return null; }
  }

  async getAlliance(alliancePda: PublicKey): Promise<AllianceStateAccount | null> {
    const account = await this.connection.getAccountInfo(alliancePda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return this.withAllianceMetadata(deserializeAllianceState(alliancePda, Buffer.from(account.data))); }
    catch { return null; }
  }

  async getAllianceMetadata(alliancePda: PublicKey): Promise<AllianceMetadataAccount | null> {
    const metadataPda = deriveAllianceMetadataPda(alliancePda);
    const account = await this.connection.getAccountInfo(metadataPda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeAllianceMetadata(metadataPda, Buffer.from(account.data)); }
    catch { return null; }
  }

  private async withAllianceMetadata(alliance: AllianceStateAccount): Promise<AllianceStateAccount> {
    const metadata = await this.getAllianceMetadata(new PublicKey(alliance.publicKey));
    if (!metadata) return alliance;
    return {
      ...alliance,
      tag: metadata.tag,
      imageUrl: metadata.imageUrl,
    };
  }

  async getAllianceTreasury(alliancePda: PublicKey): Promise<AllianceTreasuryStateAccount | null> {
    const treasuryPda = deriveAllianceTreasuryPda(alliancePda);
    const account = await this.connection.getAccountInfo(treasuryPda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeAllianceTreasuryState(treasuryPda, Buffer.from(account.data)); }
    catch { return null; }
  }

  async getSystemSovereignty(galaxy: number, system: number): Promise<SystemSovereigntyAccount | null> {
    const sovereigntyPda = deriveSystemSovereigntyPda(galaxy, system);
    const account = await this.connection.getAccountInfo(sovereigntyPda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeSystemSovereignty(sovereigntyPda, Buffer.from(account.data)); }
    catch { return null; }
  }

  async getAllianceByFounder(founder: PublicKey): Promise<AllianceStateAccount | null> {
    return this.getAlliance(deriveAlliancePda(founder));
  }

  async getMyAlliance(): Promise<{ alliance: AllianceStateAccount; membership: AllianceMembershipAccount } | null> {
    const membership = await this.getAllianceMembership();
    if (!membership || membership.role === 0) return null;
    const alliance = await this.getAlliance(new PublicKey(membership.alliance));
    if (!alliance) return null;
    return { alliance, membership };
  }

  async fetchAlliances(): Promise<AllianceStateAccount[]> {
    return fetchAllianceDirectory(this.connection);
  }

  async fetchAllianceMembers(alliancePda: PublicKey): Promise<AllianceMembershipAccount[]> {
    const allianceKey = alliancePda.toBase58();
    const accounts = await this.connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [{ dataSize: 130 }],
    });
    const members: AllianceMembershipAccount[] = [];
    for (const { account } of accounts) {
      try {
        const member = deserializeAllianceMembership(Buffer.from(account.data));
        if (member.alliance === allianceKey && member.role > 0) members.push(member);
      } catch {
        /* skip non-membership accounts */
      }
    }
    return members.sort((a, b) => a.joinedAt - b.joinedAt);
  }

  async fetchAllianceJoinRequests(alliancePda: PublicKey): Promise<AllianceJoinRequestAccount[]> {
    const allianceKey = alliancePda.toBase58();
    const accounts = await this.connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [{ dataSize: 81 }],
    });
    const requests: AllianceJoinRequestAccount[] = [];
    for (const { pubkey, account } of accounts) {
      try {
        const request = deserializeAllianceJoinRequest(pubkey, Buffer.from(account.data));
        if (request.alliance === allianceKey) requests.push(request);
      } catch {
        /* skip non-request accounts */
      }
    }
    return requests.sort((a, b) => a.createdAt - b.createdAt);
  }

  async getAllianceJoinRequest(alliancePda: PublicKey, applicant: PublicKey = this.provider.wallet.publicKey): Promise<AllianceJoinRequestAccount | null> {
    const requestPda = deriveAllianceJoinRequestPda(alliancePda, applicant);
    const account = await this.connection.getAccountInfo(requestPda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeAllianceJoinRequest(requestPda, Buffer.from(account.data)); }
    catch { return null; }
  }

  async createAlliance(name: string, tag: string, imageUrl: string): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const alliancePda = deriveAlliancePda(authority);
    const metadataPda = deriveAllianceMetadataPda(alliancePda);
    const membershipPda = deriveAllianceMembershipPda(authority);
    const gameConfig = await this.getGameConfig();
    if (!gameConfig) throw new Error("Game config is not initialized yet.");
    const storeConfig = await this.getStoreConfig();
    if (!storeConfig) throw new Error("Store config is not initialized yet.");
    if (!storeConfig.enabled) throw new Error("Store is currently disabled on-chain.");
    const antimatterMint = new PublicKey(gameConfig.antimatterMint);
    const usdcMint = new PublicKey(storeConfig.usdcMint);
    const userAntimatterAccount = await this.findUserTokenAccountForMint(
      authority,
      antimatterMint,
      ALLIANCE_CREATE_ANTIMATTER_COST,
    );
    const userUsdcAccount = await this.findUserTokenAccountForMint(
      authority,
      usdcMint,
      ALLIANCE_CREATE_USDC_COST,
    );
    const treasuryAntimatterAccount = deriveAssociatedTokenAccount(new PublicKey(storeConfig.admin), antimatterMint);
    const treasuryAntimatterInfo = await this.connection.getAccountInfo(treasuryAntimatterAccount, "confirmed");
    if (!treasuryAntimatterInfo) {
      throw new Error("DAO ANTIMATTER treasury token account is not initialized yet.");
    }
    const writer = new BorshWriter();
    writer.writeString(name.trim());
    writer.writeString(tag.trim().toUpperCase());
    writer.writeString(imageUrl.trim());
    const rentInstruction = await this.buildSponsoredRentInstruction(authority, [
      { pubkey: alliancePda, space: ACCOUNT_SPACE.allianceState },
      { pubkey: metadataPda, space: ACCOUNT_SPACE.allianceMetadata },
      { pubkey: membershipPda, space: ACCOUNT_SPACE.allianceMembership },
    ]);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: derivePlayerProfilePda(authority), isSigner: false, isWritable: false },
        { pubkey: alliancePda, isSigner: false, isWritable: true },
        { pubkey: metadataPda, isSigner: false, isWritable: true },
        { pubkey: membershipPda, isSigner: false, isWritable: true },
        { pubkey: deriveGameConfigPda(), isSigner: false, isWritable: false },
        { pubkey: deriveStoreConfigPda(), isSigner: false, isWritable: false },
        { pubkey: antimatterMint, isSigner: false, isWritable: true },
        { pubkey: userAntimatterAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryAntimatterAccount, isSigner: false, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: userUsdcAccount, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(storeConfig.treasuryUsdcAccount), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.createAlliance, writer.toBuffer()),
    });
    return this.sendInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  async joinAlliance(founder: PublicKey): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const membershipPda = deriveAllianceMembershipPda(authority);
    const rentInstruction = await this.buildSponsoredRentInstruction(authority, [
      { pubkey: membershipPda, space: ACCOUNT_SPACE.allianceMembership },
    ]);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: derivePlayerProfilePda(authority), isSigner: false, isWritable: false },
        { pubkey: deriveAlliancePda(founder), isSigner: false, isWritable: true },
        { pubkey: membershipPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.joinAlliance),
    });
    return this.sendInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  async requestJoinAlliance(alliancePda: PublicKey): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const vault = await this.prepareVaultSigningForAuthority(authority);
    if (!vault) throw new Error("Passkey vault is not active.");
    const joinRequestPda = deriveAllianceJoinRequestPda(alliancePda, authority);
    const rentInstruction = await this.buildSponsoredRentInstruction(vault, [
      { pubkey: joinRequestPda, space: ACCOUNT_SPACE.allianceJoinRequest },
    ]);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: vault, isSigner: true, isWritable: true },
        { pubkey: authority, isSigner: false, isWritable: false },
        { pubkey: deriveAuthorizedVaultPda(authority), isSigner: false, isWritable: false },
        { pubkey: derivePlayerProfilePda(authority), isSigner: false, isWritable: false },
        { pubkey: alliancePda, isSigner: false, isWritable: false },
        { pubkey: joinRequestPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.requestJoinAllianceVault),
    });
    return this.sendVaultInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  async approveJoinRequest(applicant: PublicKey): Promise<string> {
    const leader = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(leader);
    if (!membership) throw new Error("Join or create an alliance first.");
    if (membership.role !== 2) throw new Error("Only the alliance leader can approve join requests.");
    const alliancePda = new PublicKey(membership.alliance);
    const applicantMembershipPda = deriveAllianceMembershipPda(applicant);
    const rentInstruction = await this.buildSponsoredRentInstruction(leader, [
      { pubkey: applicantMembershipPda, space: ACCOUNT_SPACE.allianceMembership },
    ]);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: leader, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: true },
        { pubkey: deriveAllianceMembershipPda(leader), isSigner: false, isWritable: false },
        { pubkey: applicant, isSigner: false, isWritable: true },
        { pubkey: deriveAllianceJoinRequestPda(alliancePda, applicant), isSigner: false, isWritable: true },
        { pubkey: applicantMembershipPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.approveJoinRequest),
    });
    return this.sendInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  async rejectJoinRequest(applicant: PublicKey): Promise<string> {
    const leader = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(leader);
    if (!membership) throw new Error("Join or create an alliance first.");
    if (membership.role !== 2) throw new Error("Only the alliance leader can reject join requests.");
    const alliancePda = new PublicKey(membership.alliance);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: leader, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: false },
        { pubkey: deriveAllianceMembershipPda(leader), isSigner: false, isWritable: false },
        { pubkey: applicant, isSigner: false, isWritable: false },
        { pubkey: deriveAllianceJoinRequestPda(alliancePda, applicant), isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.rejectJoinRequest),
    });
    return this.sendInstruction([ix]);
  }

  async expelAllianceMember(target: PublicKey): Promise<string> {
    const leader = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(leader);
    if (!membership) throw new Error("Join or create an alliance first.");
    if (membership.role !== 2) throw new Error("Only the alliance leader can expel members.");
    const alliancePda = new PublicKey(membership.alliance);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: leader, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: true },
        { pubkey: deriveAllianceMembershipPda(leader), isSigner: false, isWritable: false },
        { pubkey: target, isSigner: false, isWritable: true },
        { pubkey: deriveAllianceMembershipPda(target), isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.expelAllianceMember),
    });
    return this.sendInstruction([ix]);
  }

  async transferAllianceLeadership(newLeader: PublicKey): Promise<string> {
    const leader = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(leader);
    if (!membership) throw new Error("Join or create an alliance first.");
    if (membership.role !== 2) throw new Error("Only the alliance leader can transfer leadership.");
    const alliancePda = new PublicKey(membership.alliance);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: leader, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: true },
        { pubkey: deriveAllianceMembershipPda(leader), isSigner: false, isWritable: true },
        { pubkey: newLeader, isSigner: false, isWritable: false },
        { pubkey: deriveAllianceMembershipPda(newLeader), isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.transferAllianceLeadership),
    });
    return this.sendInstruction([ix]);
  }

  async leaveAlliance(): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(authority);
    if (!membership) throw new Error("You are not in an alliance.");
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(membership.alliance), isSigner: false, isWritable: true },
        { pubkey: deriveAllianceMembershipPda(authority), isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.leaveAlliance),
    });
    return this.sendInstruction([ix]);
  }

  async initializeAllianceTreasury(): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(authority);
    if (!membership) throw new Error("Join or create an alliance first.");
    const alliancePda = new PublicKey(membership.alliance);
    const existing = await this.getAllianceTreasury(alliancePda);
    if (existing) return "";
    const vault = await this.prepareVaultSigningForAuthority(authority);
    const treasuryPda = deriveAllianceTreasuryPda(alliancePda);
    if (vault) {
      const rentInstruction = await this.buildSponsoredRentInstruction(vault, [
        { pubkey: treasuryPda, space: ACCOUNT_SPACE.allianceTreasury },
      ]);
      const ix = new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: vault, isSigner: true, isWritable: true },
          { pubkey: authority, isSigner: false, isWritable: false },
          { pubkey: deriveAuthorizedVaultPda(authority), isSigner: false, isWritable: false },
          { pubkey: alliancePda, isSigner: false, isWritable: false },
          { pubkey: deriveAllianceMembershipPda(authority), isSigner: false, isWritable: false },
          { pubkey: treasuryPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: encodeInstruction(IX.initializeAllianceTreasuryVault),
      });
      return this.sendVaultInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
    }
    const rentInstruction = await this.buildSponsoredRentInstruction(authority, [
      { pubkey: treasuryPda, space: ACCOUNT_SPACE.allianceTreasury },
    ]);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: false },
        { pubkey: deriveAllianceMembershipPda(authority), isSigner: false, isWritable: false },
        { pubkey: treasuryPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.initializeAllianceTreasury),
    });
    return this.sendInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  private async getOrCreateVaultTokenAccountInstructions(owner: PublicKey, mint: PublicKey, minAmount: bigint): Promise<{ tokenAccount: PublicKey; setupInstructions: TransactionInstruction[] }> {
    const ata = deriveAssociatedTokenAccount(owner, mint);
    const account = await this.connection.getAccountInfo(ata, "confirmed");
    const setupInstructions: TransactionInstruction[] = [];
    if (!account) {
      const payer = this.preferVaultSigning
        ? this.activeVaultPublicKey() ?? this.provider.wallet.publicKey
        : this.provider.wallet.publicKey;
      setupInstructions.push(createAssociatedTokenAccountInstruction(payer, owner, mint));
      if (minAmount > 0n) {
        throw new Error(`Vault ANTIMATTER account does not exist yet. Created account can be used after it receives ${minAmount.toString()} raw ANTIMATTER.`);
      }
      return { tokenAccount: ata, setupInstructions };
    }
    if (minAmount > 0n) {
      await this.findUserTokenAccountForMint(owner, mint, minAmount);
    }
    return { tokenAccount: ata, setupInstructions };
  }

  async depositAllianceResources(
    entityPda: PublicKey,
    period: number,
    missionId: number,
    amounts: { metal?: bigint | number; crystal?: bigint | number; deuterium?: bigint | number; antimatter?: bigint | number },
  ): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(authority);
    if (!membership) throw new Error("Join or create an alliance first.");
    const gameConfig = await this.getGameConfig();
    if (!gameConfig) throw new Error("Game config is not initialized yet.");
    const storeConfig = await this.getStoreConfig();
    if (!storeConfig) throw new Error("Store config is not initialized yet.");
    const alliancePda = new PublicKey(membership.alliance);
    if (!(await this.getAllianceTreasury(alliancePda))) {
      await this.initializeAllianceTreasury();
    }
    const antimatterMint = new PublicKey(gameConfig.antimatterMint);
    const antimatterRaw = BigInt(amounts.antimatter ?? 0);
    const preparedVault = this.preferVaultSigning && antimatterRaw === 0n
      ? await this.prepareVaultSigningForAuthority(authority)
      : null;
    const useVault = preparedVault !== null && antimatterRaw === 0n;
    if (this.preferVaultSigning && preparedVault === null && antimatterRaw === 0n) {
      throw new Error("Vault is locked or not ready. Unlock the vault before depositing alliance resources.");
    }
    if (useVault) await this.ensureVaultLamports(preparedVault, VAULT_MIN_BALANCE_LAMPORTS);
    const tokenOwner = useVault ? preparedVault : authority;
    const tokenSetup = useVault
      ? await this.getOrCreateVaultTokenAccountInstructions(tokenOwner, antimatterMint, antimatterRaw)
      : { tokenAccount: await this.findUserTokenAccountForMint(authority, antimatterMint, antimatterRaw), setupInstructions: [] as TransactionInstruction[] };
    const treasuryAntimatterAccount = deriveAssociatedTokenAccount(new PublicKey(storeConfig.admin), antimatterMint);
    const writer = new BorshWriter();
    writer.writeU8(period);
    writer.writeU8(missionId);
    writer.writeU64(amounts.metal ?? 0n);
    writer.writeU64(amounts.crystal ?? 0n);
    writer.writeU64(amounts.deuterium ?? 0n);
    writer.writeU64(antimatterRaw);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: useVault ? [
        { pubkey: preparedVault!, isSigner: true, isWritable: true },
        { pubkey: authority, isSigner: false, isWritable: false },
        { pubkey: deriveAuthorizedVaultPda(authority), isSigner: false, isWritable: false },
        { pubkey: alliancePda, isSigner: false, isWritable: true },
        { pubkey: deriveAllianceMembershipPda(authority), isSigner: false, isWritable: true },
        { pubkey: deriveAllianceTreasuryPda(alliancePda), isSigner: false, isWritable: true },
        { pubkey: entityPda, isSigner: false, isWritable: true },
        { pubkey: deriveGameConfigPda(), isSigner: false, isWritable: false },
        { pubkey: deriveStoreConfigPda(), isSigner: false, isWritable: false },
        { pubkey: antimatterMint, isSigner: false, isWritable: false },
        { pubkey: tokenSetup.tokenAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryAntimatterAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ] : [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: true },
        { pubkey: deriveAllianceMembershipPda(authority), isSigner: false, isWritable: true },
        { pubkey: deriveAllianceTreasuryPda(alliancePda), isSigner: false, isWritable: true },
        { pubkey: entityPda, isSigner: false, isWritable: true },
        { pubkey: deriveGameConfigPda(), isSigner: false, isWritable: false },
        { pubkey: deriveStoreConfigPda(), isSigner: false, isWritable: false },
        { pubkey: antimatterMint, isSigner: false, isWritable: false },
        { pubkey: tokenSetup.tokenAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryAntimatterAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(useVault ? IX.depositAllianceResourcesVault : IX.depositAllianceResources, writer.toBuffer()),
    });
    return useVault
      ? this.sendVaultInstruction([...tokenSetup.setupInstructions, ix])
      : this.sendInstruction([...tokenSetup.setupInstructions, ix]);
  }

  async upgradeAllianceBuilding(buildingId: number): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(authority);
    if (!membership) throw new Error("Join or create an alliance first.");
    const alliancePda = new PublicKey(membership.alliance);
    if (!(await this.getAllianceTreasury(alliancePda))) {
      await this.initializeAllianceTreasury();
    }
    const writer = new BorshWriter();
    writer.writeU8(buildingId);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: true },
        { pubkey: deriveAllianceMembershipPda(authority), isSigner: false, isWritable: false },
        { pubkey: deriveAllianceTreasuryPda(alliancePda), isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.upgradeAllianceBuilding, writer.toBuffer()),
    });
    return this.sendInstruction([ix]);
  }

  async getAllianceGovernanceConfig(alliancePda: PublicKey): Promise<AllianceGovernanceConfigAccount | null> {
    const account = await this.connection.getAccountInfo(deriveAllianceGovernancePda(alliancePda), "confirmed");
    if (!account) return null;
    if (!account.owner.equals(GAME_STATE_PROGRAM_ID)) throw new Error("Alliance governance account has an unexpected owner.");
    return deserializeAllianceGovernanceConfig(deriveAllianceGovernancePda(alliancePda), Buffer.from(account.data));
  }

  async getGamesolGovernanceConfig(): Promise<GamesolGovernanceConfigAccount | null> {
    if (!GAMESOL_GOVERNANCE_ROOT_ENABLED) return null;
    const governancePda = deriveGamesolGovernancePda();
    const account = await this.connection.getAccountInfo(governancePda, "confirmed");
    if (!account) return null;
    if (!account.owner.equals(GAME_STATE_PROGRAM_ID)) throw new Error("GAMESOL governance account has an unexpected owner.");
    return deserializeGamesolGovernanceConfig(governancePda, Buffer.from(account.data));
  }

  async enrollAllianceInGamesolGovernance(): Promise<string> {
    this.requireGamesolGovernanceRoot();
    const leader = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(leader);
    if (!membership || membership.role !== 2) throw new Error("Only the alliance leader can join GAMESOL governance.");
    const alliancePda = new PublicKey(membership.alliance);
    const governancePda = deriveAllianceGovernancePda(alliancePda);
    const rentInstruction = await this.buildSponsoredRentInstruction(leader, [
      { pubkey: governancePda, space: ACCOUNT_SPACE.allianceGovernanceConfig },
    ]);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: leader, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: false },
        { pubkey: deriveAllianceMembershipPda(leader), isSigner: false, isWritable: false },
        { pubkey: deriveGamesolGovernancePda(), isSigner: false, isWritable: false },
        { pubkey: governancePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.enrollAllianceInGamesolGovernance),
    });
    return this.sendInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  async syncAllianceGamesolGovernance(): Promise<string> {
    this.requireGamesolGovernanceRoot();
    const leader = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(leader);
    if (!membership || membership.role !== 2) throw new Error("Only the alliance leader can sync GAMESOL governance.");
    const alliancePda = new PublicKey(membership.alliance);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: leader, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: false },
        { pubkey: deriveAllianceMembershipPda(leader), isSigner: false, isWritable: false },
        { pubkey: deriveGamesolGovernancePda(), isSigner: false, isWritable: false },
        { pubkey: deriveAllianceGovernancePda(alliancePda), isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.syncAllianceGamesolGovernance),
    });
    return this.sendInstruction([ix]);
  }

  async fetchAllianceDecisions(alliancePda: PublicKey): Promise<AllianceDecisionAccount[]> {
    const { decisions } = await fetchAllianceGovernance(this.connection);
    return decisions.filter((decision) => decision.alliance === alliancePda.toBase58());
  }

  async createAllianceDecision(params: {
    externalProposal: PublicKey;
    action: number;
    targetPlanet: PublicKey;
    galaxy: number;
    system: number;
    specialization: number;
    vulnerabilityHourUtc: number;
    expiresAt: number;
  }): Promise<string> {
    this.requireSovereigntyWrites();
    const proposer = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(proposer);
    if (!membership || membership.role === 0) throw new Error("Join an alliance before creating an action proposal.");
    const alliancePda = new PublicKey(membership.alliance);
    const governance = await this.getAllianceGovernanceConfig(alliancePda);
    if (!governance?.enabled) throw new Error("This alliance has not enabled ANTIMATTER governance.");
    const existingDecisions = await this.fetchAllianceDecisions(alliancePda);
    if (existingDecisions.some((decision) => decision.externalProposal === params.externalProposal.toBase58())) {
      throw new Error("This Futarchy proposal is already bound to an alliance action.");
    }

    const futarchyProgramValue = env.VITE_FUTARCHY_PROGRAM_ID?.trim();
    if (!futarchyProgramValue) throw new Error("The Futarchy program is not configured in this build.");
    const externalAccount = await this.connection.getAccountInfo(params.externalProposal, "confirmed");
    if (!externalAccount || !externalAccount.owner.equals(new PublicKey(futarchyProgramValue))) {
      throw new Error("The external proposal is not owned by the configured MetaDAO Futarchy program.");
    }
    if (!Number.isInteger(params.galaxy) || params.galaxy < 1 || params.galaxy > 999 ||
        !Number.isInteger(params.system) || params.system < 1 || params.system > 999) {
      throw new Error("Galaxy and system must be between 1 and 999.");
    }
    if (!Number.isInteger(params.action) || params.action < 0 || params.action > 2) throw new Error("Unsupported alliance action.");
    if (!Number.isInteger(params.specialization) || params.specialization < 0 || params.specialization > 3) throw new Error("Unsupported system specialization.");
    if (!Number.isInteger(params.vulnerabilityHourUtc) || params.vulnerabilityHourUtc < 0 || params.vulnerabilityHourUtc > 23) {
      throw new Error("Vulnerability hour must be between 0 and 23 UTC.");
    }
    if (!Number.isInteger(params.expiresAt) || params.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new Error("The external proposal decision window has already closed.");
    }

    const proposalId = governance.proposalCount;
    const writer = new BorshWriter();
    writer.writeU64(proposalId);
    writer.writeFixedBytes(params.externalProposal.toBuffer());
    writer.writeU8(params.action);
    writer.writeFixedBytes(params.targetPlanet.toBuffer());
    writer.writeU16(params.galaxy);
    writer.writeU16(params.system);
    writer.writeU8(params.specialization);
    writer.writeU8(params.vulnerabilityHourUtc);
    writer.writeI64(params.expiresAt);
    const decisionPda = deriveAllianceDecisionPda(alliancePda, proposalId);
    const rentInstruction = await this.buildSponsoredRentInstruction(proposer, [
      { pubkey: decisionPda, space: ACCOUNT_SPACE.allianceDecision },
    ]);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: proposer, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: false },
        { pubkey: deriveAllianceMembershipPda(proposer), isSigner: false, isWritable: false },
        { pubkey: deriveAllianceGovernancePda(alliancePda), isSigner: false, isWritable: true },
        { pubkey: decisionPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.createAllianceDecision, writer.toBuffer()),
    });
    return this.sendInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  buildExecuteAllianceDecisionInstruction(decision: AllianceDecisionAccount, claimantAuthority: PublicKey): TransactionInstruction {
    const executor = this.provider.wallet.publicKey;
    const alliancePda = new PublicKey(decision.alliance);
    const proposalId = decision.id;
    const writer = new BorshWriter();
    writer.writeU64(proposalId);
    writer.writeU16(decision.galaxy);
    writer.writeU16(decision.system);
    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: executor, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: false },
        { pubkey: deriveGameConfigPda(), isSigner: false, isWritable: false },
        { pubkey: deriveAllianceGovernancePda(alliancePda), isSigner: false, isWritable: false },
        { pubkey: deriveAllianceDecisionPda(alliancePda, proposalId), isSigner: false, isWritable: true },
        { pubkey: deriveAllianceTreasuryPda(alliancePda), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(decision.targetPlanet), isSigner: false, isWritable: false },
        { pubkey: deriveAllianceMembershipPda(claimantAuthority), isSigner: false, isWritable: false },
        { pubkey: deriveSystemSovereigntyPda(decision.galaxy, decision.system), isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.executeAllianceDecision, writer.toBuffer()),
    });
  }
  private requireSovereigntyWrites(): void {
    if (!SOVEREIGNTY_WRITES_ENABLED) {
      throw new Error("Sovereignty writes are locked until the experimental devnet program upgrade is active.");
    }
  }

  private requireGamesolGovernanceRoot(): void {
    this.requireSovereigntyWrites();
    if (!GAMESOL_GOVERNANCE_ROOT_ENABLED) {
      throw new Error("The shared GAMESOL governance upgrade is not active in this environment.");
    }
  }

  async claimSystemSovereignty(
    planetPda: PublicKey,
    galaxy: number,
    system: number,
    specialization: number,
    vulnerabilityHourUtc: number,
  ): Promise<string> {
    this.requireSovereigntyWrites();
    const authority = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(authority);
    if (!membership || membership.role !== 2) throw new Error("Only the alliance leader can claim a system.");
    const alliancePda = new PublicKey(membership.alliance);
    if (!(await this.getAllianceTreasury(alliancePda))) throw new Error("Initialize the alliance treasury first.");
    const writer = new BorshWriter();
    writer.writeU16(galaxy);
    writer.writeU16(system);
    writer.writeU8(specialization);
    writer.writeU8(vulnerabilityHourUtc);
    const sovereigntyPda = deriveSystemSovereigntyPda(galaxy, system);
    const rentInstruction = await this.buildSponsoredRentInstruction(authority, [
      { pubkey: sovereigntyPda, space: ACCOUNT_SPACE.systemSovereignty },
    ]);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: false },
        { pubkey: deriveAllianceMembershipPda(authority), isSigner: false, isWritable: false },
        { pubkey: deriveAllianceTreasuryPda(alliancePda), isSigner: false, isWritable: true },
        { pubkey: planetPda, isSigner: false, isWritable: false },
        { pubkey: sovereigntyPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.claimSystemSovereignty, writer.toBuffer()),
    });
    return this.sendInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  async fundSystemSovereignty(galaxy: number, system: number): Promise<string> {
    this.requireSovereigntyWrites();
    const authority = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(authority);
    if (!membership || membership.role === 0) throw new Error("Join the controlling alliance first.");
    const alliancePda = new PublicKey(membership.alliance);
    const writer = new BorshWriter();
    writer.writeU16(galaxy);
    writer.writeU16(system);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: false },
        { pubkey: deriveAllianceMembershipPda(authority), isSigner: false, isWritable: false },
        { pubkey: deriveAllianceTreasuryPda(alliancePda), isSigner: false, isWritable: true },
        { pubkey: deriveSystemSovereigntyPda(galaxy, system), isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.fundSystemSovereignty, writer.toBuffer()),
    });
    return this.sendInstruction([ix]);
  }

  async setSystemSovereigntySpecialization(galaxy: number, system: number, specialization: number): Promise<string> {
    this.requireSovereigntyWrites();
    const authority = this.provider.wallet.publicKey;
    const membership = await this.getAllianceMembership(authority);
    if (!membership || membership.role !== 2) throw new Error("Only the alliance leader can change specialization.");
    const alliancePda = new PublicKey(membership.alliance);
    const writer = new BorshWriter();
    writer.writeU16(galaxy);
    writer.writeU16(system);
    writer.writeU8(specialization);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: alliancePda, isSigner: false, isWritable: false },
        { pubkey: deriveAllianceMembershipPda(authority), isSigner: false, isWritable: false },
        { pubkey: deriveAllianceTreasuryPda(alliancePda), isSigner: false, isWritable: true },
        { pubkey: deriveSystemSovereigntyPda(galaxy, system), isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.setSystemSovereigntySpecialization, writer.toBuffer()),
    });
    return this.sendInstruction([ix]);
  }

  async initializeQuestState(): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const existing = await this.getQuestState(authority);
    if (existing) return "";
    const questStatePda = deriveQuestStatePda(authority);
    const rentInstruction = await this.buildSponsoredRentInstruction(authority, [
      { pubkey: questStatePda, space: ACCOUNT_SPACE.questState },
    ]);

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: derivePlayerProfilePda(authority), isSigner: false, isWritable: false },
        { pubkey: questStatePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.initializeQuestState),
    });
    return this.sendInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  async initializeQuestProgress(): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const existing = await this.getQuestProgress(authority);
    if (existing) return "";
    const questProgressPda = deriveQuestProgressPda(authority);
    const rentInstruction = await this.buildSponsoredRentInstruction(authority, [
      { pubkey: questProgressPda, space: ACCOUNT_SPACE.questProgress },
    ]);

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: derivePlayerProfilePda(authority), isSigner: false, isWritable: false },
        { pubkey: questProgressPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.initializeQuestProgress),
    });
    return this.sendInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  async initializeQuestRewardTargets(): Promise<string> {
    const authority = this.provider.wallet.publicKey;
    const existing = await this.getQuestRewardTargets(authority);
    const hasTutorialTargets = await this.hasTutorialQuestRewardTargets(authority);
    if (existing && hasTutorialTargets) return "";
    const questRewardTargetsPda = deriveQuestRewardTargetsPda(authority);
    const tutorialQuestRewardTargetsPda = deriveQuestTutorialRewardTargetsPda(authority);
    const rentInstruction = await this.buildSponsoredRentInstruction(authority, [
      { pubkey: questRewardTargetsPda, space: ACCOUNT_SPACE.questRewardTargets },
      { pubkey: tutorialQuestRewardTargetsPda, space: ACCOUNT_SPACE.tutorialQuestRewardTargets },
    ]);

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: derivePlayerProfilePda(authority), isSigner: false, isWritable: false },
      { pubkey: questRewardTargetsPda, isSigner: false, isWritable: true },
      { pubkey: tutorialQuestRewardTargetsPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeInstruction(IX.initializeQuestRewardTargets),
  });
    return this.sendInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
  }

  private async ensureQuestState(): Promise<void> {
    if (!(await this.getQuestState())) {
      await this.initializeQuestState();
    }
  }

  private async ensureQuestProgress(): Promise<void> {
    if (!(await this.getQuestProgress())) {
      await this.initializeQuestProgress();
    }
  }

  private async ensureQuestRewardTargets(authority: PublicKey = this.provider.wallet.publicKey): Promise<void> {
    const hasTargets = !!(await this.getQuestRewardTargets(authority));
    const hasTutorialTargets = await this.hasTutorialQuestRewardTargets(authority);
    if (!hasTargets || !hasTutorialTargets) {
      await this.initializeQuestRewardTargets();
    }
  }

  /**
   * Builds and sends an `initialize_homeworld` or `initialize_colony` tx
   * for explicit coordinates. Does NOT retry — caller decides on collision.
   *
   * Returns the planet_state PDA on success.
   * Throws if the tx fails (e.g. coords already occupied).
   */
  private async sendInitializePlanetTx(opts: {
    isHomeworld: boolean;
    authority: PublicKey;
    vault: PublicKey;
    playerProfilePda: PublicKey;
    authorizedVaultPda: PublicKey;
    nextIndex?: number;
    galaxy: number;
    system: number;
    position: number;
    planetName: string;
    now: number;
    reportProgress?: ProgressReporter;
    /** Only for colony */
    mission?: Mission;
  }): Promise<PublicKey> {
    const {
      isHomeworld, authority, vault, playerProfilePda, authorizedVaultPda,
      nextIndex, galaxy, system, position, planetName, now, reportProgress, mission,
    } = opts;
    void mission;

    if (!isHomeworld) {
      throw new Error("Colony creation must use resolveColonize so the mission slot is proven on-chain.");
    }

    if (!this.gameplayVaultExecutor) {
      await this.ensureVaultLamports(vault, VAULT_MIN_BALANCE_LAMPORTS, reportProgress);
    }

    const latestProfile = await this.fetchPlayerProfile(authority);
    const currentIndex = latestProfile?.planetCount ?? nextIndex ?? 0;
    const planetStatePda = derivePlanetStatePda(authority, currentIndex);
    const planetCoordsPda = derivePlanetCoordsPda(galaxy, system, position);
    const ownerIndexPda = derivePlanetOwnerIndexPda(authority, currentIndex);
    const ownershipRegistryPda = derivePlanetOwnershipRegistryPda(planetStatePda);
    const questStatePda = deriveQuestStatePda(authority);
    const questProgressPda = deriveQuestProgressPda(authority);
    const questRewardTargetsPda = deriveQuestRewardTargetsPda(authority);
    const tutorialQuestRewardTargetsPda = deriveQuestTutorialRewardTargetsPda(authority);
    const rentInstruction = await this.buildSponsoredRentInstruction(vault, [
      { pubkey: planetStatePda, space: ACCOUNT_SPACE.planetState },
      { pubkey: planetCoordsPda, space: ACCOUNT_SPACE.planetCoords },
      { pubkey: ownerIndexPda, space: ACCOUNT_SPACE.planetOwnerIndex },
      { pubkey: ownershipRegistryPda, space: ACCOUNT_SPACE.planetOwnershipRegistry },
      { pubkey: questStatePda, space: ACCOUNT_SPACE.questState },
      { pubkey: questProgressPda, space: ACCOUNT_SPACE.questProgress },
      { pubkey: questRewardTargetsPda, space: ACCOUNT_SPACE.questRewardTargets },
      { pubkey: tutorialQuestRewardTargetsPda, space: ACCOUNT_SPACE.tutorialQuestRewardTargets },
    ]);

    const args = encodeHomeworldArgs(now, planetName.trim() || "Homeworld", galaxy, system, position);

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: vault,              isSigner: true,  isWritable: true  }, // vault_signer (payer)
        { pubkey: authority,          isSigner: false, isWritable: false }, // authority
        { pubkey: authorizedVaultPda, isSigner: false, isWritable: false }, // authorized_vault
        { pubkey: playerProfilePda,   isSigner: false, isWritable: true  }, // player_profile
        { pubkey: planetStatePda,     isSigner: false, isWritable: true  }, // planet_state
        { pubkey: planetCoordsPda,    isSigner: false, isWritable: true  }, // planet_coords
        { pubkey: questStatePda,      isSigner: false, isWritable: true  }, // quest_state
        { pubkey: questProgressPda,   isSigner: false, isWritable: true  }, // quest_progress
        { pubkey: questRewardTargetsPda, isSigner: false, isWritable: true }, // quest_reward_targets
        { pubkey: tutorialQuestRewardTargetsPda, isSigner: false, isWritable: true }, // tutorial_quest_reward_targets
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ownerIndexPda, isSigner: false, isWritable: true },
        { pubkey: ownershipRegistryPda, isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.initializeHomeworld, args),
    });

    await this.sendVaultInstruction(rentInstruction ? [rentInstruction, ix] : [ix]);
    return planetStatePda;
  }

  /**
   * Initialize a homeworld planet.
   *
   * Flow:
   * 1. Try the deterministic coords derived from the wallet pubkey (matching on-chain logic).
   * 2. If that slot is occupied, retry with random coords up to HOMEWORLD_MAX_COORD_ATTEMPTS.
   * 3. Each attempt verifies the coord PDA off-chain first to avoid burning a tx fee on a known collision.
   * 4. Attempt the tx; if it still fails (race condition), retry with the next candidate.
   */
  async initializePlanet(planetName = "Homeworld", reportProgress?: ProgressReporter): Promise<PlayerState> {
    const authority = this.provider.wallet.publicKey;

    const profile = await this.fetchPlayerProfile(authority);
    let vault: PublicKey;
    if (this.gameplayVaultExecutor) {
      await this.activateGameplayVault(reportProgress);
      vault = this.gameplayVaultExecutor.vaultPublicKey;
    } else if (!profile) {
      await this.initializePlayer(reportProgress);
      if (!this.vaultKeypair) {
        throw new Error("Vault setup failed before homeworld creation.");
      }
      vault = this.vaultKeypair.publicKey;
    } else {
      vault = (await this.restoreAuthorizedVaultForExistingProfile(authority, reportProgress)).publicKey;
    }

    const playerProfilePda = derivePlayerProfilePda(authority);
    const authorizedVaultPda = deriveAuthorizedVaultPda(authority);
    const now = Math.floor(Date.now() / 1000);

    // Build candidate list: deterministic first, then random fallbacks
    const deterministicCoords = deriveHomeworldCoordsFromWallet(authority);
    const candidates: Array<{ galaxy: number; system: number; position: number }> = [
      deterministicCoords,
    ];
    for (let i = 1; i < HOMEWORLD_MAX_COORD_ATTEMPTS; i++) {
      candidates.push(randomCoords());
    }

    let lastError: unknown = new Error("All coordinate candidates were occupied.");

    for (const coords of candidates) {
      const { galaxy, system, position } = coords;

      // Fast off-chain check — skip if already occupied
      const occupied = await isCoordOccupied(this.connection, galaxy, system, position);
      if (occupied) {
        console.log(`[GAME_STATE:homeworld] slot ${galaxy}:${system}:${position} occupied, trying next`);
        continue;
      }

      reportProgress?.(`Vault signing: creating homeworld at [${galaxy}:${system}:${position}]`);

      try {
        const planetStatePda = await this.sendInitializePlanetTx({
          isHomeworld: true,
          authority,
          vault,
          playerProfilePda,
          authorizedVaultPda,
          galaxy,
          system,
          position,
          planetName,
          now,
          reportProgress,
        });

        const planetAccount = await this.connection.getAccountInfo(planetStatePda, "confirmed");
        if (!planetAccount || !planetAccount.owner.equals(GAME_STATE_PROGRAM_ID)) {
          throw new Error("Planet created but public account could not be loaded.");
        }
        return adaptPlanetState(planetStatePda, deserializePlanetState(Buffer.from(planetAccount.data)));
      } catch (err) {
        // Tx failed — could be a race condition where someone else claimed the slot.
        // Log and try the next candidate.
        const message = describeTxError(err);
        if (isNonRetryableHomeworldError(message)) {
          throw err;
        }
        console.warn(`[GAME_STATE:homeworld] tx failed for ${galaxy}:${system}:${position}:`, message);
        lastError = err;
      }
    }

    throw lastError;
  }

  // ── Planet loading ───────────────────────────────────────────────────────────
  private stateFromOwnedPlanetAccount(
    planetPda: PublicKey,
    account: { owner: PublicKey; data: Buffer | Uint8Array },
    authority?: PublicKey,
  ): PlayerState | null {
    if (!account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    const data = Buffer.from(account.data);
    const discriminator = data.slice(0, 8);
    if (discriminator.equals(PUBLIC_PLANET_STATE_DISCRIMINATOR)) {
      const planet = deserializePublicPlanetState(data);
      if (authority && !planet.authority.equals(authority)) return null;
      return stateFromPublicPlanet(planetPda, planet);
    }
    if (discriminator.equals(PLANET_STATE_DISCRIMINATOR)) {
      const planet = deserializePlanetState(data);
      if (authority && !planet.authority.equals(authority)) return null;
      return adaptPlanetState(planetPda, planet);
    }
    return null;
  }

  private async loadPlanetStateByPda(planetPda: PublicKey): Promise<PlayerState | null> {
    const account = await this.connection.getAccountInfo(planetPda, "confirmed");
    if (!account) return null;
    return this.stateFromOwnedPlanetAccount(planetPda, account);
  }

  async getPlanetStateByPda(planetPda: PublicKey): Promise<PlayerState | null> {
    return this.loadPlanetStateByPda(planetPda);
  }

  async getPlanetStateByCoordinates(galaxy: number, system: number, position: number): Promise<PlayerState | null> {
    const planetPda = await this.findPlanetByCoordinates(galaxy, system, position);
    return planetPda ? this.loadPlanetStateByPda(planetPda) : null;
  }

  async findPlanets(walletPubkey: PublicKey): Promise<PlayerState[]> {
    const profile = await this.fetchPlayerProfile(walletPubkey);
    if (!profile) return [];
    const byPda = new Map<string, PlayerState>();

    const ownerIndexPdas = Array.from({ length: profile.planetCount }, (_, i) => derivePlanetOwnerIndexPda(walletPubkey, i));
    const ownerIndexAccounts = await this.getMultipleAccountsInfoBatched(ownerIndexPdas);
    const indexedPlanetPdas: PublicKey[] = [];
    for (const account of ownerIndexAccounts) {
      if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) continue;
      try {
        const ownerIndex = deserializePlanetOwnerIndex(Buffer.from(account.data));
        if (!ownerIndex.active || !ownerIndex.authority.equals(walletPubkey)) continue;
        indexedPlanetPdas.push(ownerIndex.planet);
      } catch { /* skip malformed */ }
    }
    const indexedPlanetAccounts = indexedPlanetPdas.length
      ? await this.getMultipleAccountsInfoBatched(indexedPlanetPdas)
      : [];
    indexedPlanetAccounts.forEach((account, idx) => {
      if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return;
      try {
        const state = this.stateFromOwnedPlanetAccount(indexedPlanetPdas[idx], account, walletPubkey);
        if (state) byPda.set(state.planetPda, state);
      } catch { /* skip malformed */ }
    });

    const legacyPdas = Array.from({ length: profile.planetCount }, (_, i) => derivePlanetStatePda(walletPubkey, i));
    const legacyAccounts = await this.getMultipleAccountsInfoBatched(legacyPdas);
    const states = legacyAccounts.map((account, idx) => {
      if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
      const discriminator = account.data.slice(0, 8);
      if (discriminator.equals(PLANET_STATE_DISCRIMINATOR)) {
        const planet = deserializePlanetState(Buffer.from(account.data));
        if (!planet.authority.equals(walletPubkey)) return null;
        return adaptPlanetState(legacyPdas[idx], planet);
      }
      return null;
    });
    states.filter((s): s is PlayerState => !!s).forEach(s => byPda.set(s.planetPda, s));

    const publicPdas = Array.from({ length: profile.planetCount }, (_, i) => derivePublicPlanetStatePda(walletPubkey, i));
    const publicAccounts = await this.getMultipleAccountsInfoBatched(publicPdas);
    const publicStates = publicAccounts.map((account, idx) => {
      if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
      if (account.data.slice(0, 8).equals(PUBLIC_PLANET_STATE_DISCRIMINATOR)) {
        const planet = deserializePublicPlanetState(Buffer.from(account.data));
        if (!planet.authority.equals(walletPubkey)) return null;
        return stateFromPublicPlanet(publicPdas[idx], planet);
      }
      return null;
    });
    publicStates.filter((s): s is PlayerState => !!s).forEach(s => byPda.set(s.planetPda, s));

    const ownedPlanetAccounts = await this.connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [
        { memcmp: { offset: 0, bytes: bs58.encode(PLANET_STATE_DISCRIMINATOR) } },
        { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } },
      ],
    });
    for (const account of ownedPlanetAccounts) {
      try {
        if (!account.account.data.slice(0, 8).equals(PLANET_STATE_DISCRIMINATOR)) continue;
        const state = adaptPlanetState(account.pubkey, deserializePlanetState(Buffer.from(account.account.data)));
        byPda.set(state.planetPda, state);
      } catch { /* skip malformed */ }
    }

    return Array.from(byPda.values())
      .sort((a, b) => a.planet.planetIndex - b.planet.planetIndex);
  }

  async findPlanet(walletPubkey: PublicKey): Promise<PlayerState | null> {
    const planets = await this.findPlanets(walletPubkey);
    return planets[0] ?? null;
  }

  private async fetchAuthorizedVault(authority: PublicKey): Promise<AuthorizedVaultAccount | null> {
    const account = await this.connection.getAccountInfo(deriveAuthorizedVaultPda(authority), "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeAuthorizedVault(Buffer.from(account.data)); }
    catch { return null; }
  }

  private async restoreAuthorizedVaultForExistingProfile(
    authority: PublicKey,
    reportProgress?: ProgressReporter,
  ): Promise<Keypair> {
    const restored = await this.tryRestoreVaultFromBackup(reportProgress);
    if (!restored) {
      throw new Error("This wallet already has a player profile. Restore the saved vault password before creating a homeworld.");
    }

    const authorizedVault = await this.fetchAuthorizedVault(authority);
    if (authorizedVault && !authorizedVault.vault.equals(restored.publicKey)) {
      throw new Error("Vault authorization mismatch. Please retry; if it persists, restore the vault with the saved password.");
    }

    this.vaultKeypair = restored;
    return restored;
  }

  private async prepareVaultSigningForAuthority(
    authority: PublicKey,
    reportProgress?: ProgressReporter,
  ): Promise<PublicKey | null> {
    if (!this.preferVaultSigning) return null;

    if (this.gameplayVaultExecutor) {
      const vault = this.gameplayVaultExecutor.vaultPublicKey;
      const authorizedVault = await this.fetchAuthorizedVault(authority);
      if (
        !authorizedVault
        || authorizedVault.revoked
        || !authorizedVault.vault.equals(vault)
      ) {
        throw new Error("Passkey vault is not authorized for this player. Activate it from the wallet panel.");
      }
      return vault;
    }

    if (this.vaultKeypair) {
      const authorizedVault = await this.fetchAuthorizedVault(authority);
      if (!authorizedVault) {
        this.vaultKeypair = null;
        throw new Error("Vault authorization is missing. Reconnect the wallet and restore the saved vault password.");
      }
      if (!authorizedVault.vault.equals(this.vaultKeypair.publicKey)) {
        this.vaultKeypair = null;
        throw new Error("Vault authorization mismatch. Restore the saved vault password before sending this action.");
      }
      await this.ensureVaultLamports(this.vaultKeypair, VAULT_MIN_BALANCE_LAMPORTS, reportProgress);
      return this.vaultKeypair.publicKey;
    }

    const vault = await this.restoreAuthorizedVaultForExistingProfile(authority, reportProgress);
    await this.ensureVaultLamports(vault, VAULT_MIN_BALANCE_LAMPORTS, reportProgress);
    return vault.publicKey;
  }

  async getSystemPlanets(galaxy: number, system: number): Promise<PublicPlanetInfo[]> {
    const accounts = await this.connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, { commitment: "confirmed" });
    const bySlot = new Map<number, PublicPlanetInfo>();
    const authoritativeSlots = new Set<number>();
    for (const account of accounts) {
      const discriminator = account.account.data.slice(0, 8);
      try {
        if (discriminator.equals(PUBLIC_PLANET_STATE_DISCRIMINATOR)) {
          const s = deserializePublicPlanetState(Buffer.from(account.account.data));
          if (s.galaxy === galaxy && s.system === system && !authoritativeSlots.has(s.position)) {
            bySlot.set(s.position, publicPlanetInfoFromPublicState(account.pubkey, s));
          }
        } else if (discriminator.equals(PLANET_STATE_DISCRIMINATOR)) {
          const s = deserializePlanetState(Buffer.from(account.account.data));
          if (s.galaxy === galaxy && s.system === system) {
            authoritativeSlots.add(s.position);
            bySlot.set(s.position, publicPlanetInfoFromState(account.pubkey, s));
          }
        }
      } catch { /* ignore */ }
    }
    return Array.from(bySlot.values()).sort((a, b) => a.position - b.position);
  }

  async getAllPublicPlanets(): Promise<PublicPlanetInfo[]> {
    return fetchAllPublicPlanets(this.connection);
  }

  async getPublicPlanetInfoByCoordinates(
    galaxy: number,
    system: number,
    position: number,
  ): Promise<PublicPlanetInfo | null> {
    const planetPda = await this.findPlanetByCoordinates(galaxy, system, position);
    if (!planetPda) return null;
    const account = await this.connection.getAccountInfo(planetPda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    const discriminator = account.data.slice(0, 8);
    if (discriminator.equals(PUBLIC_PLANET_STATE_DISCRIMINATOR)) {
      return publicPlanetInfoFromPublicState(planetPda, deserializePublicPlanetState(Buffer.from(account.data)));
    }
    if (discriminator.equals(PLANET_STATE_DISCRIMINATOR)) {
      return publicPlanetInfoFromState(planetPda, deserializePlanetState(Buffer.from(account.data)));
    }
    return null;
  }

  /**
   * Check if a coordinate slot is free without sending a tx.
   * Useful for the colonize UI to show occupied/free before the player commits.
   */
  async isCoordFree(galaxy: number, system: number, position: number): Promise<boolean> {
    return !(await isCoordOccupied(this.connection, galaxy, system, position));
  }

  // ── Vault-signed planet mutation helper ──────────────────────────────────────
  private buildVaultMutationInstruction(
    vaultDiscriminator: Buffer,
    walletDiscriminator: Buffer,
    planetPda: PublicKey,
    planetAuthority: PublicKey,
    args: Buffer,
    extraKeys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [],
  ): TransactionInstruction {
    const questProgressPda = deriveQuestProgressPda(planetAuthority);
    const questRewardTargetsPda = deriveQuestRewardTargetsPda(planetAuthority);
    const vault = this.activeVaultPublicKey();
    if (vault) {
      const authorizedVaultPda = deriveAuthorizedVaultPda(planetAuthority);
      return new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: vault,                         isSigner: true,  isWritable: true  },
          { pubkey: authorizedVaultPda,           isSigner: false, isWritable: false },
          { pubkey: planetPda,                    isSigner: false, isWritable: true  },
          ...extraKeys,
        ],
        data: encodeInstruction(vaultDiscriminator, args),
      });
    }

    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: this.provider.wallet.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: planetPda,                       isSigner: false, isWritable: true  },
        ...extraKeys,
      ],
      data: encodeInstruction(walletDiscriminator, args),
    });
  }

  private async activeSovereigntyBonusKeys(
    state: PlayerState | null,
    authority: PublicKey,
  ): Promise<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]> {
    if (!state) return [];
    const membership = await this.getAllianceMembership(authority);
    if (!membership || membership.role === 0) return [];
    const sovereignty = await this.getSystemSovereignty(state.planet.galaxy, state.planet.system);
    if (
      !sovereignty
      || sovereignty.alliance !== membership.alliance
      || sovereignty.upkeepPaidUntil <= Math.floor(Date.now() / 1000)
      || sovereignty.specialization === 0
    ) return [];
    return [
      { pubkey: deriveSystemSovereigntyPda(state.planet.galaxy, state.planet.system), isSigner: false, isWritable: false },
      { pubkey: deriveAllianceMembershipPda(authority), isSigner: false, isWritable: false },
    ];
  }

  private buildQuestInstruction(
    vaultDiscriminator: Buffer,
    walletDiscriminator: Buffer,
    planetPda: PublicKey,
    authority: PublicKey,
    args?: Buffer,
    includeRewardTargets = false,
  ): TransactionInstruction {
    const questPda = deriveQuestStatePda(authority);
    const questProgressPda = deriveQuestProgressPda(authority);
    const questRewardTargetsPda = deriveQuestRewardTargetsPda(authority);
    const tutorialQuestRewardTargetsPda = deriveQuestTutorialRewardTargetsPda(authority);
    const vault = this.activeVaultPublicKey();
    if (vault) {
      const authorizedVaultPda = deriveAuthorizedVaultPda(authority);
      const keys = [
        { pubkey: vault,                         isSigner: true,  isWritable: true  },
        { pubkey: authority,                   isSigner: false, isWritable: false },
        { pubkey: authorizedVaultPda,           isSigner: false, isWritable: false },
        { pubkey: questPda,                     isSigner: false, isWritable: true  },
        { pubkey: planetPda,                    isSigner: false, isWritable: true  },
        { pubkey: questProgressPda,             isSigner: false, isWritable: true  },
      ];
      if (includeRewardTargets) {
        keys.push({ pubkey: questRewardTargetsPda, isSigner: false, isWritable: true });
        keys.push({ pubkey: tutorialQuestRewardTargetsPda, isSigner: false, isWritable: true });
      }
      return new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys,
        data: encodeInstruction(vaultDiscriminator, args),
      });
    }

    const keys = [
      { pubkey: authority,  isSigner: true,  isWritable: true  },
      { pubkey: questPda,   isSigner: false, isWritable: true  },
      { pubkey: planetPda,  isSigner: false, isWritable: true  },
      { pubkey: questProgressPda, isSigner: false, isWritable: true },
    ];
    if (includeRewardTargets) {
      keys.push({ pubkey: questRewardTargetsPda, isSigner: false, isWritable: true });
      keys.push({ pubkey: tutorialQuestRewardTargetsPda, isSigner: false, isWritable: true });
    }
    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys,
      data: encodeInstruction(walletDiscriminator, args),
    });
  }

  private buildVaultTransportInstruction(
    sourcePlanetPda: PublicKey,
    destinationPlanetPda: PublicKey,
    planetAuthority: PublicKey,
    args: Buffer,
  ): TransactionInstruction {
    const questProgressPda = deriveQuestProgressPda(planetAuthority);
    const questRewardTargetsPda = deriveQuestRewardTargetsPda(planetAuthority);
    const vault = this.activeVaultPublicKey();
    if (vault) {
      const authorizedVaultPda = deriveAuthorizedVaultPda(planetAuthority);
      return new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: vault,                         isSigner: true,  isWritable: true  },
          { pubkey: authorizedVaultPda,           isSigner: false, isWritable: false },
          { pubkey: sourcePlanetPda,              isSigner: false, isWritable: true  },
          { pubkey: destinationPlanetPda,         isSigner: false, isWritable: true  },
          { pubkey: questProgressPda,             isSigner: false, isWritable: true  },
          { pubkey: questRewardTargetsPda,        isSigner: false, isWritable: true  },
        ],
        data: encodeInstruction(IX.resolveTransportVault, args),
      });
    }

    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: this.provider.wallet.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: sourcePlanetPda,                isSigner: false, isWritable: true  },
        { pubkey: destinationPlanetPda,           isSigner: false, isWritable: true  },
        { pubkey: questProgressPda,               isSigner: false, isWritable: true  },
        { pubkey: questRewardTargetsPda,          isSigner: false, isWritable: true  },
      ],
      data: encodeInstruction(IX.resolveTransport, args),
    });
  }

  private buildVaultAttackInstruction(
    sourcePlanetPda: PublicKey,
    destinationPlanetPda: PublicKey,
    destinationCoordsPda: PublicKey,
    planetAuthority: PublicKey,
    args: Buffer,
  ): TransactionInstruction {
    const questProgressPda = deriveQuestProgressPda(planetAuthority);
    const questRewardTargetsPda = deriveQuestRewardTargetsPda(planetAuthority);
    const vault = this.activeVaultPublicKey();
    if (vault) {
      const authorizedVaultPda = deriveAuthorizedVaultPda(planetAuthority);
      return new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: vault,                         isSigner: true,  isWritable: true  },
          { pubkey: authorizedVaultPda,           isSigner: false, isWritable: false },
          { pubkey: sourcePlanetPda,              isSigner: false, isWritable: true  },
          { pubkey: destinationPlanetPda,         isSigner: false, isWritable: true  },
          { pubkey: destinationCoordsPda,         isSigner: false, isWritable: true  },
          { pubkey: questProgressPda,             isSigner: false, isWritable: true  },
          { pubkey: questRewardTargetsPda,        isSigner: false, isWritable: true  },
        ],
        data: encodeInstruction(IX.resolveAttackVault, args),
      });
    }

    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: this.provider.wallet.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: sourcePlanetPda,                isSigner: false, isWritable: true  },
        { pubkey: destinationPlanetPda,           isSigner: false, isWritable: true  },
        { pubkey: destinationCoordsPda,           isSigner: false, isWritable: true  },
        { pubkey: questProgressPda,               isSigner: false, isWritable: true  },
        { pubkey: questRewardTargetsPda,          isSigner: false, isWritable: true  },
      ],
      data: encodeInstruction(IX.resolveAttack, args),
    });
  }


  // ── Gameplay actions ─────────────────────────────────────────────────────────
  private buildVaultEspionageInstruction(
    sourcePlanetPda: PublicKey,
    destinationPlanetPda: PublicKey,
    destinationCoordsPda: PublicKey,
    planetAuthority: PublicKey,
    args: Buffer,
  ): TransactionInstruction {
    const questProgressPda = deriveQuestProgressPda(planetAuthority);
    const questRewardTargetsPda = deriveQuestRewardTargetsPda(planetAuthority);
    const vault = this.activeVaultPublicKey();
    if (vault) {
      const authorizedVaultPda = deriveAuthorizedVaultPda(planetAuthority);
      return new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: vault,                         isSigner: true,  isWritable: true  },
          { pubkey: authorizedVaultPda,           isSigner: false, isWritable: false },
          { pubkey: sourcePlanetPda,              isSigner: false, isWritable: true  },
          { pubkey: destinationPlanetPda,         isSigner: false, isWritable: true  },
          { pubkey: destinationCoordsPda,         isSigner: false, isWritable: true  },
          { pubkey: questProgressPda,             isSigner: false, isWritable: true  },
          { pubkey: questRewardTargetsPda,        isSigner: false, isWritable: true  },
        ],
        data: encodeInstruction(IX.resolveEspionageVault, args),
      });
    }

    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: this.provider.wallet.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: sourcePlanetPda,                isSigner: false, isWritable: true  },
        { pubkey: destinationPlanetPda,           isSigner: false, isWritable: true  },
        { pubkey: destinationCoordsPda,           isSigner: false, isWritable: true  },
        { pubkey: questProgressPda,               isSigner: false, isWritable: true  },
        { pubkey: questRewardTargetsPda,          isSigner: false, isWritable: true  },
      ],
      data: encodeInstruction(IX.resolveEspionage, args),
    });
  }

  async dailyCheckIn(entityPda: PublicKey): Promise<string> {
    await this.ensureQuestState();
    await this.ensureQuestProgress();
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.prepareVaultSigningForAuthority(authority);
    return this.sendVaultInstruction(
      [this.buildQuestInstruction(IX.dailyCheckInVault, IX.dailyCheckIn, entityPda, authority)],
    );
  }

  async claimQuest(entityPda: PublicKey, period: number, questId: number): Promise<string> {
    await this.ensureQuestState();
    await this.ensureQuestProgress();
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.ensureQuestRewardTargets(authority);
    await this.prepareVaultSigningForAuthority(authority);
    const writer = new BorshWriter();
    writer.writeU8(period);
    writer.writeU8(questId);
    return this.sendVaultInstruction(
      [this.buildQuestInstruction(IX.claimQuestVault, IX.claimQuest, entityPda, authority, writer.toBuffer(), true)],
    );
  }

  async startBuild(entityPda: PublicKey, buildingIdx: number): Promise<string> {
    const writer = new BorshWriter();
    writer.writeU8(buildingIdx);
    writer.writeI64(Math.floor(Date.now() / 1000));
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.prepareVaultSigningForAuthority(authority);
    const sovereigntyKeys = await this.activeSovereigntyBonusKeys(state, authority);
    return this.sendVaultInstruction(
      [this.buildVaultMutationInstruction(IX.startBuildVault, IX.startBuild, entityPda, authority, writer.toBuffer(), sovereigntyKeys)],
    );
  }

  async finishBuild(entityPda: PublicKey): Promise<string> {
    const state = await this.loadPlanetStateByPda(entityPda);
    if (!state || state.planet.buildFinishTs <= 0 || state.planet.buildQueueItem === 255) {
      return "";
    }
    const writer = new BorshWriter();
    writer.writeI64(Math.floor(Date.now() / 1000));
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.prepareVaultSigningForAuthority(authority);
    return this.sendVaultInstruction(
      [this.buildVaultMutationInstruction(IX.finishBuildVault, IX.finishBuild, entityPda, authority, writer.toBuffer())],
    );
  }

  async startResearch(entityPda: PublicKey, techIdx: number): Promise<string> {
    const writer = new BorshWriter();
    writer.writeU8(techIdx);
    writer.writeI64(Math.floor(Date.now() / 1000));
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.prepareVaultSigningForAuthority(authority);
    const sovereigntyKeys = await this.activeSovereigntyBonusKeys(state, authority);
    return this.sendVaultInstruction(
      [this.buildVaultMutationInstruction(IX.startResearchVault, IX.startResearch, entityPda, authority, writer.toBuffer(), sovereigntyKeys)],
    );
  }

  async finishResearch(entityPda: PublicKey): Promise<string> {
    const writer = new BorshWriter();
    writer.writeI64(Math.floor(Date.now() / 1000));
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.prepareVaultSigningForAuthority(authority);
    return this.sendVaultInstruction(
      [this.buildVaultMutationInstruction(IX.finishResearchVault, IX.finishResearch, entityPda, authority, writer.toBuffer())],
    );
  }

  async buildShip(entityPda: PublicKey, shipType: number, quantity: number): Promise<string> {
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.prepareVaultSigningForAuthority(authority);
    const sovereigntyKeys = await this.activeSovereigntyBonusKeys(state, authority);
    return this.sendVaultInstruction(
      [this.buildVaultMutationInstruction(
        IX.buildShipVault,
        IX.buildShip,
        entityPda,
        authority,
        encodeBuildShipArgs(shipType, quantity, Math.floor(Date.now() / 1000)),
        sovereigntyKeys,
      )],
    );
  }

  async finishShipBuild(entityPda: PublicKey): Promise<string> {
    const writer = new BorshWriter();
    writer.writeI64(Math.floor(Date.now() / 1000));
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.prepareVaultSigningForAuthority(authority);
    return this.sendVaultInstruction(
      [this.buildVaultMutationInstruction(
        IX.finishShipBuildVault,
        IX.finishShipBuild,
        entityPda,
        authority,
        writer.toBuffer(),
      )],
    );
  }

  async buildDefense(entityPda: PublicKey, defenseType: number, quantity: number): Promise<string> {
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.prepareVaultSigningForAuthority(authority);
    const sovereigntyKeys = await this.activeSovereigntyBonusKeys(state, authority);
    return this.sendVaultInstruction(
      [this.buildVaultMutationInstruction(
        IX.buildDefenseVault,
        IX.buildDefense,
        entityPda,
        authority,
        encodeBuildDefenseArgs(defenseType, quantity, Math.floor(Date.now() / 1000)),
        sovereigntyKeys,
      )],
    );
  }

  async finishDefenseBuild(entityPda: PublicKey): Promise<string> {
    const writer = new BorshWriter();
    writer.writeI64(Math.floor(Date.now() / 1000));
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.prepareVaultSigningForAuthority(authority);
    return this.sendVaultInstruction(
      [this.buildVaultMutationInstruction(
        IX.finishDefenseBuildVault,
        IX.finishDefenseBuild,
        entityPda,
        authority,
        writer.toBuffer(),
      )],
    );
  }

  async launchFleet(
    entityPda: PublicKey,
    ships: { lf?: number; hf?: number; cr?: number; bs?: number; bc?: number; bm?: number; ds?: number; de?: number; sc?: number; lc?: number; rec?: number; ep?: number; col?: number },
    cargo: { metal?: bigint; crystal?: bigint; deuterium?: bigint },
    missionType: number,
    speedFactor = 100,
    target?: LaunchFleetTarget,
  ): Promise<string> {
    if (!target) throw new Error("Launch target is required.");
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.prepareVaultSigningForAuthority(authority);

    return this.sendVaultInstruction(
      [this.buildVaultMutationInstruction(
        IX.launchFleetVault,
        IX.launchFleet,
        entityPda,
        authority,
        encodeLaunchFleetArgs(
          ships,
          cargo,
          missionType,
          speedFactor,
          Math.floor(Date.now() / 1000),
          target,
        ),
      )],
    );
  }

  private async findPlanetByCoordinates(galaxy: number, system: number, position: number): Promise<PublicKey | null> {
    // Fast path: look up via planet_coords PDA.
    const coordsPda = derivePlanetCoordsPda(galaxy, system, position);
    const coordsAccount = await this.connection.getAccountInfo(coordsPda, "confirmed");
    if (coordsAccount && coordsAccount.owner.equals(GAME_STATE_PROGRAM_ID) && coordsAccount.data.length >= 8 + 5 + 32 + 32 + 1) {
      if (coordsAccount.data.slice(0, 8).equals(PLANET_COORDS_DISCRIMINATOR)) {
        // planet field is at offset 8 (disc) + 2 + 2 + 1 (galaxy/system/position) = offset 13
        return new PublicKey(coordsAccount.data.slice(13, 13 + 32));
      }
    }

    // Fallback: scan all program accounts (slow, kept for safety)
    const accounts = await this.connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, { commitment: "confirmed" });
    for (const account of accounts) {
      if (!account.account.data.slice(0, 8).equals(PLANET_STATE_DISCRIMINATOR)) continue;
      try {
        const s = deserializePlanetState(Buffer.from(account.account.data));
        if (s.galaxy === galaxy && s.system === system && s.position === position) return account.pubkey;
      } catch { /* ignore */ }
    }
    return null;
  }

  async resolveTransport(sourceEntityPda: PublicKey, mission: Mission, slot: number): Promise<string> {
    const destinationPlanetPda = await this.findPlanetByCoordinates(
      mission.targetGalaxy, mission.targetSystem, mission.targetPosition,
    );
    const state = await this.loadPlanetStateByPda(sourceEntityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.ensureQuestProgress();
    await this.ensureQuestRewardTargets(authority);
    await this.prepareVaultSigningForAuthority(authority);
    const writer = new BorshWriter();
    writer.writeU8(slot);
    writer.writeI64(Math.floor(Date.now() / 1000));

    if (!destinationPlanetPda) {
      const destinationCoordsPda = derivePlanetCoordsPda(
        mission.targetGalaxy,
        mission.targetSystem,
        mission.targetPosition,
      );
      const questProgressPda = deriveQuestProgressPda(authority);
      const questRewardTargetsPda = deriveQuestRewardTargetsPda(authority);
      const ix = this.buildVaultMutationInstruction(
        IX.resolveTransportEmptyVault,
        IX.resolveTransportEmpty,
        sourceEntityPda,
        authority,
        writer.toBuffer(),
      );
      ix.keys.push(
        { pubkey: destinationCoordsPda, isSigner: false, isWritable: false },
        { pubkey: questProgressPda, isSigner: false, isWritable: true },
        { pubkey: questRewardTargetsPda, isSigner: false, isWritable: true },
      );
      return this.sendVaultInstruction([ix]);
    }

    return this.sendVaultInstruction(
      [this.buildVaultTransportInstruction(sourceEntityPda, destinationPlanetPda, authority, writer.toBuffer())],
    );
  }

  async resolveAttack(sourceEntityPda: PublicKey, mission: Mission, slot: number): Promise<string> {
    const destinationPlanetPda = await this.findPlanetByCoordinates(
      mission.targetGalaxy, mission.targetSystem, mission.targetPosition,
    );
    if (!destinationPlanetPda) {
      throw new Error("Target planet not found for attack resolution.");
    }

    const destinationCoordsPda = derivePlanetCoordsPda(
      mission.targetGalaxy,
      mission.targetSystem,
      mission.targetPosition,
    );
    const state = await this.loadPlanetStateByPda(sourceEntityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.ensureQuestProgress();
    await this.ensureQuestRewardTargets(authority);
    await this.prepareVaultSigningForAuthority(authority);
    const writer = new BorshWriter();
    writer.writeU8(slot);
    writer.writeI64(Math.floor(Date.now() / 1000));

    return this.sendVaultInstruction(
      [this.buildVaultAttackInstruction(
        sourceEntityPda,
        destinationPlanetPda,
        destinationCoordsPda,
        authority,
        writer.toBuffer(),
      )],
    );
  }

  async resolveEspionage(sourceEntityPda: PublicKey, mission: Mission, slot: number): Promise<string> {
    const destinationPlanetPda = await this.findPlanetByCoordinates(
      mission.targetGalaxy, mission.targetSystem, mission.targetPosition,
    );
    if (!destinationPlanetPda) {
      throw new Error("Target planet not found for espionage resolution.");
    }

    const destinationCoordsPda = derivePlanetCoordsPda(
      mission.targetGalaxy,
      mission.targetSystem,
      mission.targetPosition,
    );
    const state = await this.loadPlanetStateByPda(sourceEntityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    await this.ensureQuestProgress();
    await this.ensureQuestRewardTargets(authority);
    await this.prepareVaultSigningForAuthority(authority);
    const writer = new BorshWriter();
    writer.writeU8(slot);
    writer.writeI64(Math.floor(Date.now() / 1000));

    return this.sendVaultInstruction(
      [this.buildVaultEspionageInstruction(
        sourceEntityPda,
        destinationPlanetPda,
        destinationCoordsPda,
        authority,
        writer.toBuffer(),
      )],
    );
  }

  /**
   * Resolve a colonize mission.
   *
   * Flow:
   * 1. Create the colony planet + coord lock (initialize_colony) — vault pays rent.
   * 2. Resolve the colonize mission on the source planet — clears the mission slot.
   *
   * Both steps use the vault keypair, no wallet popup needed.
   */
  async resolveColonize(
    sourceEntityPda: PublicKey,
    mission: Mission,
    slot: number,
    now = Math.floor(Date.now() / 1000),
    reportProgress?: ProgressReporter,
  ): Promise<{ entityPda: PublicKey; planetPda: PublicKey }> {
    const authority = this.provider.wallet.publicKey;
    await this.ensureQuestProgress();
    await this.ensureQuestRewardTargets(authority);
    const vault = await this.prepareVaultSigningForAuthority(authority, reportProgress);
    if (!vault) throw new Error("Vault signing must be enabled to create a colony.");

    const occupied = await isCoordOccupied(
      this.connection,
      mission.targetGalaxy,
      mission.targetSystem,
      mission.targetPosition,
    );
    if (occupied) {
      throw new Error(
        `Colony slot [${mission.targetGalaxy}:${mission.targetSystem}:${mission.targetPosition}] is already occupied.`,
      );
    }

    const profile = await this.fetchPlayerProfile(authority);
    const nextIndex = profile?.planetCount ?? 0;
    const playerProfilePda = derivePlayerProfilePda(authority);
    const authorizedVaultPda = deriveAuthorizedVaultPda(authority);
    const colonyPda = derivePlanetStatePda(authority, nextIndex);
    const colonyCoordsPda = derivePlanetCoordsPda(
      mission.targetGalaxy,
      mission.targetSystem,
      mission.targetPosition,
    );
    const ownerIndexPda = derivePlanetOwnerIndexPda(authority, nextIndex);
    const ownershipRegistryPda = derivePlanetOwnershipRegistryPda(colonyPda);
    const questStatePda = deriveQuestStatePda(authority);
    const questProgressPda = deriveQuestProgressPda(authority);
    const questRewardTargetsPda = deriveQuestRewardTargetsPda(authority);
    const tutorialQuestRewardTargetsPda = deriveQuestTutorialRewardTargetsPda(authority);
    const rentInstruction = await this.buildSponsoredRentInstruction(vault, [
      { pubkey: colonyPda, space: ACCOUNT_SPACE.planetState },
      { pubkey: colonyCoordsPda, space: ACCOUNT_SPACE.planetCoords },
      { pubkey: ownerIndexPda, space: ACCOUNT_SPACE.planetOwnerIndex },
      { pubkey: ownershipRegistryPda, space: ACCOUNT_SPACE.planetOwnershipRegistry },
      { pubkey: questStatePda, space: ACCOUNT_SPACE.questState },
      { pubkey: questProgressPda, space: ACCOUNT_SPACE.questProgress },
      { pubkey: questRewardTargetsPda, space: ACCOUNT_SPACE.questRewardTargets },
      { pubkey: tutorialQuestRewardTargetsPda, space: ACCOUNT_SPACE.tutorialQuestRewardTargets },
    ]);

    reportProgress?.("Vault signing: creating colony from mission");

    const initIx = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: vault,              isSigner: true,  isWritable: true  },
        { pubkey: authority,          isSigner: false, isWritable: false },
        { pubkey: authorizedVaultPda, isSigner: false, isWritable: false },
        { pubkey: playerProfilePda,   isSigner: false, isWritable: true  },
        { pubkey: sourceEntityPda,    isSigner: false, isWritable: true  },
        { pubkey: colonyPda,          isSigner: false, isWritable: true  },
        { pubkey: colonyCoordsPda,    isSigner: false, isWritable: true  },
        { pubkey: questStatePda,      isSigner: false, isWritable: true  },
        { pubkey: questProgressPda,   isSigner: false, isWritable: true  },
        { pubkey: questRewardTargetsPda, isSigner: false, isWritable: true },
        { pubkey: tutorialQuestRewardTargetsPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        // Remaining accounts: recurring reward targets, owner index, registry.
        { pubkey: questRewardTargetsPda, isSigner: false, isWritable: true },
        { pubkey: ownerIndexPda, isSigner: false, isWritable: true },
        { pubkey: ownershipRegistryPda, isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.initializeColony, encodeColonyArgs(now, mission, slot)),
    });

    await this.sendVaultInstruction(rentInstruction ? [rentInstruction, initIx] : [initIx]);

    return { entityPda: colonyPda, planetPda: colonyPda };
  }
  /**
   * Transfer ownership of a single planet to a new wallet.
   *
   * The new wallet must have already called initialize_player.
   * After transfer, vault-signed gameplay by the new wallet works immediately.
   * The planet PDA address does not change.
   *
   * This is a wallet-signed instruction — requires one wallet popup.
   * Use this during a hack recovery: transfer all planets to a clean wallet
   * before the attacker can do anything with them.
   */
  async transferPlanet(
    planetPda: PublicKey,
    newAuthority: PublicKey,
  ): Promise<string> {
    const authority = this.provider.wallet.publicKey;

    // Load the planet to get its index for seed verification and get coords
    const state = await this.loadPlanetStateByPda(planetPda);
    if (!state) throw new Error("Planet not found.");
    if (state.planet.owner !== authority.toBase58()) throw new Error("You do not own this planet.");

    const coordsPda = derivePlanetCoordsPda(
      state.planet.galaxy,
      state.planet.system,
      state.planet.position,
    );
    await this.ensurePlanetOwnershipRegistry(planetPda);

    const newPlayerProfilePda = derivePlayerProfilePda(newAuthority);
    const newProfile = await this.fetchPlayerProfile(newAuthority);
    if (!newProfile) {
      throw new Error("Destination wallet must initialize the game client before receiving planets.");
    }
    const newOwnerIndexPda = derivePlanetOwnerIndexPda(newAuthority, newProfile.planetCount);
    const oldOwnerIndexPda =
      await this.findPlanetOwnerIndexPda(authority, planetPda)
      ?? derivePlanetOwnerIndexPda(authority, state.planet.planetIndex);
    const listingIndexPda = derivePlanetListingIndexPda(planetPda);
    const marketObligationPda = derivePlanetMarketObligationPda(planetPda);
    const ownershipRegistryPda = derivePlanetOwnershipRegistryPda(planetPda);

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority,           isSigner: true,  isWritable: true  }, // authority (current owner, signs)
        { pubkey: newAuthority,        isSigner: false, isWritable: false }, // new_authority
        { pubkey: newPlayerProfilePda, isSigner: false, isWritable: true  }, // new_player_profile (verified on-chain)
        { pubkey: planetPda,           isSigner: false, isWritable: true  }, // planet_state
        { pubkey: coordsPda,           isSigner: false, isWritable: true  }, // planet_coords
        { pubkey: ownershipRegistryPda, isSigner: false, isWritable: true }, // canonical ownership
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        { pubkey: newOwnerIndexPda,    isSigner: false, isWritable: true  }, // new owner index
        { pubkey: oldOwnerIndexPda,    isSigner: false, isWritable: true  }, // old owner index
        { pubkey: listingIndexPda,     isSigner: false, isWritable: false }, // market listing index
        { pubkey: marketObligationPda, isSigner: false, isWritable: false }, // market resource obligations
      ],
      data: encodeInstruction(IX.transferPlanet),
    });

    // Transfer is wallet-signed — use provider path directly
    return this.sendInstruction([ix]);
  }

  async ensurePlanetOwnershipRegistry(
    planetPda: PublicKey,
    reportProgress?: ProgressReporter,
  ): Promise<PublicKey> {
    const authority = this.provider.wallet.publicKey;
    const registryPda = derivePlanetOwnershipRegistryPda(planetPda);
    if (await this.connection.getAccountInfo(registryPda, "confirmed")) return registryPda;

    const profile = await this.fetchPlayerProfile(authority);
    if (!profile) throw new Error("Player profile is not initialized.");
    const ownerIndexPda = await this.findPlanetOwnerIndexPda(authority, planetPda);
    if (!ownerIndexPda) throw new Error("Planet owner index is missing. Refresh the planet index before listing it.");

    let ownerSlot = -1;
    for (let slot = 0; slot < profile.planetCount; slot += 1) {
      if (derivePlanetOwnerIndexPda(authority, slot).equals(ownerIndexPda)) {
        ownerSlot = slot;
        break;
      }
    }
    if (ownerSlot < 0) throw new Error("Planet owner index slot could not be verified.");

    const vault = await this.prepareVaultSigningForAuthority(authority, reportProgress);
    if (!vault) throw new Error("Vault signing must be enabled to migrate planet ownership.");
    await this.ensureVaultLamports(vault, VAULT_MIN_BALANCE_LAMPORTS, reportProgress);

    const slotArg = Buffer.alloc(4);
    slotArg.writeUInt32LE(ownerSlot, 0);
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: vault, isSigner: true, isWritable: true },
        { pubkey: authority, isSigner: false, isWritable: false },
        { pubkey: deriveAuthorizedVaultPda(authority), isSigner: false, isWritable: false },
        { pubkey: derivePlayerProfilePda(authority), isSigner: false, isWritable: true },
        { pubkey: planetPda, isSigner: false, isWritable: false },
        { pubkey: ownerIndexPda, isSigner: false, isWritable: true },
        { pubkey: registryPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.syncPlanetOwnerIndexVault, slotArg),
    });
    await this.sendVaultInstruction([ix]);
    return registryPda;
  }

  /**
   * Transfer ALL planets owned by this wallet to a new authority in sequence.
   * Each transfer is a separate tx (one wallet popup each, or use wallet auto-approve).
   *
   * Intended for hack recovery: call this immediately to move all planets to a
   * clean wallet before the attacker acts.
   */
  async transferAllPlanets(
    newAuthority: PublicKey,
    reportProgress?: ProgressReporter,
  ): Promise<string[]> {
    const planets = await this.findPlanets(this.provider.wallet.publicKey);
    if (planets.length === 0) throw new Error("No planets to transfer.");

    const sigs: string[] = [];
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      reportProgress?.(`Transferring planet ${i + 1}/${planets.length}: ${p.planet.name}...`);
      const sig = await this.transferPlanet(new PublicKey(p.planetPda), newAuthority);
      sigs.push(sig);
    }
    return sigs;
  }

  async findPlayerByWallet(walletPubkey: PublicKey): Promise<{ entityPda: string } | null> {
    const state = await this.findPlanet(walletPubkey);
    if (!state) return null;
    return { entityPda: state.entityPda };
  }
}

const PUBLIC_PLANET_CACHE_MS = 60_000;
const publicPlanetCache = new Map<string, { expiresAt: number; planets: PublicPlanetInfo[] }>();
const publicPlanetRequests = new Map<string, Promise<PublicPlanetInfo[]>>();

const UNIVERSE_PLANET_CACHE_MS = 30_000;
const universePlanetCache = new Map<string, { expiresAt: number; planets: UniverseMapPlanetInfo[] }>();
const universePlanetRequests = new Map<string, Promise<UniverseMapPlanetInfo[]>>();

const emptyMissionFleet = {
  smallCargo: 0, largeCargo: 0, lightFighter: 0, heavyFighter: 0,
  cruiser: 0, battleship: 0, battlecruiser: 0, bomber: 0, destroyer: 0,
  deathstar: 0,
};

function planetSnapshotFromState(planetPda: PublicKey, account: PlanetStateAccount): UniverseMapPlanetInfo {
  const base = {
    entity: planetPda.toBase58(),
    owner: account.authority.toBase58(),
    name: account.name,
    galaxy: account.galaxy,
    system: account.system,
    position: account.position,
    planetIndex: account.planetIndex,
    diameter: account.diameter,
    temperature: account.temperature,
    maxFields: account.maxFields,
    createdAt: account.createdAt,
    protectionUntilTs: account.protectionUntilTs,
    lastAttackedTs: account.lastAttackedTs,
    metal: account.metal,
    crystal: account.crystal,
    deuterium: account.deuterium,
    smallCargo: account.smallCargo,
    largeCargo: account.largeCargo,
    lightFighter: account.lightFighter,
    heavyFighter: account.heavyFighter,
    cruiser: account.cruiser,
    battleship: account.battleship,
    battlecruiser: account.battlecruiser,
    bomber: account.bomber,
    destroyer: account.destroyer,
    deathstar: account.deathstar,
    missions: account.missions,
  };
  return base;
}

function planetSnapshotFromPublicState(planetPda: PublicKey, account: PublicPlanetStateAccount): UniverseMapPlanetInfo {
  const meta = derivePrivatePlanetDisplayMeta(account);
  return {
    entity: planetPda.toBase58(),
    owner: account.authority.toBase58(),
    name: account.name,
    galaxy: account.galaxy,
    system: account.system,
    position: account.position,
    planetIndex: account.planetIndex,
    diameter: meta.diameter,
    temperature: meta.temperature,
    maxFields: meta.maxFields,
    createdAt: account.createdAt,
    protectionUntilTs: 0,
    lastAttackedTs: 0,
    metal: 0n,
    crystal: 0n,
    deuterium: 0n,
    ...emptyMissionFleet,
    missions: [],
  };
}

export function fetchAllPublicPlanets(connection: Connection): Promise<PublicPlanetInfo[]> {
  const endpoint = connection.rpcEndpoint;
  const cached = publicPlanetCache.get(endpoint);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.planets);

  const inFlight = publicPlanetRequests.get(endpoint);
  if (inFlight) return inFlight;

  const request = (async () => {
    const accounts = await connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, { commitment: "confirmed" });
    const planets = new Map<string, PublicPlanetInfo>();
    for (const account of accounts) {
      const discriminator = account.account.data.slice(0, 8);
      try {
        let planet: PublicPlanetInfo | null = null;
        let authoritative = false;
        if (discriminator.equals(PUBLIC_PLANET_STATE_DISCRIMINATOR)) {
          planet = publicPlanetInfoFromPublicState(account.pubkey, deserializePublicPlanetState(Buffer.from(account.account.data)));
        } else if (discriminator.equals(PLANET_STATE_DISCRIMINATOR)) {
          planet = publicPlanetInfoFromState(account.pubkey, deserializePlanetState(Buffer.from(account.account.data)));
          authoritative = true;
        }
        if (!planet) continue;
        const key = `${planet.galaxy}:${planet.system}:${planet.position}`;
        const current = planets.get(key);
        if (!current || authoritative) planets.set(key, planet);
      } catch { /* skip unrelated or malformed program accounts */ }
    }
    const result = Array.from(planets.values()).sort((a, b) => a.galaxy - b.galaxy || a.system - b.system || a.position - b.position);
    publicPlanetCache.set(endpoint, { planets: result, expiresAt: Date.now() + PUBLIC_PLANET_CACHE_MS });
    return result;
  })();

  publicPlanetRequests.set(endpoint, request);
  void request.then(
    () => publicPlanetRequests.delete(endpoint),
    () => publicPlanetRequests.delete(endpoint),
  );
  return request;
}

export function fetchUniverseMapData(connection: Connection): Promise<UniverseMapPlanetInfo[]> {
  const endpoint = connection.rpcEndpoint;
  const cached = universePlanetCache.get(endpoint);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.planets);

  const inFlight = universePlanetRequests.get(endpoint);
  if (inFlight) return inFlight;

  const request = (async () => {
    const accounts = await connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, { commitment: "confirmed" });
    const planets = new Map<string, UniverseMapPlanetInfo>();
    for (const account of accounts) {
      const discriminator = account.account.data.slice(0, 8);
      try {
        let planet: UniverseMapPlanetInfo | null = null;
        let authoritative = false;
        if (discriminator.equals(PLANET_STATE_DISCRIMINATOR)) {
          planet = planetSnapshotFromState(account.pubkey, deserializePlanetState(Buffer.from(account.account.data)));
          authoritative = true;
        } else if (discriminator.equals(PUBLIC_PLANET_STATE_DISCRIMINATOR)) {
          planet = planetSnapshotFromPublicState(account.pubkey, deserializePublicPlanetState(Buffer.from(account.account.data)));
        }
        if (!planet) continue;
        const key = `${planet.galaxy}:${planet.system}:${planet.position}`;
        const existing = planets.get(key);
        if (!existing || authoritative) planets.set(key, planet);
      } catch { /* skip unrelated or malformed program accounts */ }
    }
    const result = Array.from(planets.values()).sort((a, b) => a.galaxy - b.galaxy || a.system - b.system || a.position - b.position);
    universePlanetCache.set(endpoint, { planets: result, expiresAt: Date.now() + UNIVERSE_PLANET_CACHE_MS });
    return result;
  })();

  universePlanetRequests.set(endpoint, request);
  void request.then(
    () => universePlanetRequests.delete(endpoint),
    () => universePlanetRequests.delete(endpoint),
  );
  return request;
}

/** Reads only program-owned sovereignty accounts from the configured Solana cluster. */
export async function fetchSystemSovereignties(connection: Connection): Promise<SystemSovereigntyAccount[]> {
  const accounts = await connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, {
    commitment: "confirmed",
    filters: [
      { dataSize: 104 },
      { memcmp: { offset: 0, bytes: bs58.encode(SYSTEM_SOVEREIGNTY_DISCRIMINATOR) } },
    ],
  });
  const sovereignties: SystemSovereigntyAccount[] = [];
  for (const { pubkey, account } of accounts) {
    try {
      sovereignties.push(deserializeSystemSovereignty(pubkey, Buffer.from(account.data)));
    } catch {
      /* The exact size and discriminator filters should make this exceptional. */
    }
  }

  return sovereignties.sort((a, b) => a.galaxy - b.galaxy || a.system - b.system);
}

/** Public alliance directory for discovery surfaces; reads only program-owned accounts and optional metadata PDAs. */
export async function fetchAllianceDirectory(connection: Connection): Promise<AllianceStateAccount[]> {
  const accounts = await connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, {
    commitment: "confirmed",
    filters: [{ dataSize: 103 }],
  });
  const baseAlliances = accounts.flatMap(({ pubkey, account }) => {
    try { return [deserializeAllianceState(pubkey, Buffer.from(account.data))]; }
    catch { return []; }
  });
  const metadataKeys = baseAlliances.map((alliance) => deriveAllianceMetadataPda(new PublicKey(alliance.publicKey)));
  const metadataAccounts = metadataKeys.length > 0
    ? await connection.getMultipleAccountsInfo(metadataKeys, "confirmed")
    : [];
  const alliances = baseAlliances.map((alliance, index) => {
    const account = metadataAccounts[index];
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return alliance;
    try {
      const metadata = deserializeAllianceMetadata(metadataKeys[index], Buffer.from(account.data));
      return { ...alliance, tag: metadata.tag, imageUrl: metadata.imageUrl };
    } catch {
      return alliance;
    }
  });
  return alliances.sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    return a.createdAt - b.createdAt;
  });
}

/** Reads real program-owned alliance governance and proposal records; returns empty arrays before configuration. */
export async function fetchAllianceGovernance(connection: Connection): Promise<{
  configs: AllianceGovernanceConfigAccount[];
  decisions: AllianceDecisionAccount[];
}> {
  // Public devnet RPCs throttle bursts of getProgramAccounts requests. These
  // two records are required for market discovery, so read them sequentially
  // rather than allowing an avoidable 429 to hide every live market.
  const configAccounts = await connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, {
    commitment: "confirmed",
    filters: [
      { dataSize: 147 },
      { memcmp: { offset: 0, bytes: bs58.encode(ALLIANCE_GOVERNANCE_CONFIG_DISCRIMINATOR) } },
    ],
  });
  const decisionAccounts = await connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, {
    commitment: "confirmed",
    filters: [
      { dataSize: 178 },
      { memcmp: { offset: 0, bytes: bs58.encode(ALLIANCE_DECISION_DISCRIMINATOR) } },
    ],
  });
  const configs = configAccounts.flatMap(({ pubkey, account }) => {
    try { return [deserializeAllianceGovernanceConfig(pubkey, Buffer.from(account.data))]; }
    catch { return []; }
  });
  const decisions = decisionAccounts.flatMap(({ pubkey, account }) => {
    try { return [deserializeAllianceDecision(pubkey, Buffer.from(account.data))]; }
    catch { return []; }
  });
  decisions.sort((a, b) => Number(b.id - a.id));
  return { configs, decisions };
}

// ─── Game Data Constants ──────────────────────────────────────────────────────
export const BUILDINGS = [
  { idx: 0,  key: "metalMine",            name: "Metal Mine",             icon: "⬡",  desc: "Extracts metal from the planet crust." },
  { idx: 1,  key: "crystalMine",          name: "Crystal Mine",           icon: "◈",  desc: "Processes surface crystal formations." },
  { idx: 2,  key: "deuteriumSynthesizer", name: "Deuterium Synthesizer",  icon: "◉",  desc: "Extracts deuterium from the atmosphere." },
  { idx: 3,  key: "solarPlant",           name: "Solar Plant",            icon: "☀",  desc: "Converts sunlight to energy." },
  { idx: 4,  key: "fusionReactor",        name: "Fusion Reactor",         icon: "⚛",  desc: "Burns deuterium for high-yield energy." },
  { idx: 5,  key: "roboticsFactory",      name: "Robotics Factory",       icon: "🤖", desc: "Automated workers — halves build time." },
  { idx: 6,  key: "naniteFactory",        name: "Nanite Factory",         icon: "🔬", desc: "Nano assemblers — massive build speed." },
  { idx: 7,  key: "shipyard",             name: "Shipyard",               icon: "🚀", desc: "Constructs ships and defense units." },
  { idx: 8,  key: "metalStorage",         name: "Metal Storage",          icon: "🏗", desc: "Increases metal cap." },
  { idx: 9,  key: "crystalStorage",       name: "Crystal Storage",        icon: "🏗", desc: "Increases crystal cap." },
  { idx: 10, key: "deuteriumTank",        name: "Deuterium Tank",         icon: "🏗", desc: "Increases deuterium cap." },
  { idx: 11, key: "researchLab",          name: "Research Lab",           icon: "🔭", desc: "Required for all technology research." },
  { idx: 12, key: "missileSilo",          name: "Missile Silo",           icon: "🎯", desc: "Legacy missile infrastructure." },
] as const;

// Only these hulls contribute cargo capacity in the deployed launch rules.
export const TRANSPORT_CARGO_CAPACITY: Readonly<Record<string, number>> = {
  smallCargo: 5_000, largeCargo: 25_000, recycler: 20_000, cruiser: 800, battleship: 1_500,
};

export const SHIPS = [
  { key: "smallCargo",    name: "Small Cargo",    icon: "📦", atk: 5,      cargo: 5_000,    cost: { m: 2000,    c: 2000,    d: 0       } },
  { key: "largeCargo",    name: "Large Cargo",    icon: "🚛", atk: 5,      cargo: 25_000,   cost: { m: 6000,    c: 6000,    d: 0       } },
  { key: "lightFighter",  name: "Light Fighter",  icon: "✈",  atk: 50,     cargo: 50,       cost: { m: 3000,    c: 1000,    d: 0       } },
  { key: "heavyFighter",  name: "Heavy Fighter",  icon: "⚡",  atk: 150,    cargo: 100,      cost: { m: 6000,    c: 4000,    d: 0       } },
  { key: "cruiser",       name: "Cruiser",        icon: "🛸", atk: 400,    cargo: 800,      cost: { m: 20000,   c: 7000,    d: 2000    } },
  { key: "battleship",    name: "Battleship",     icon: "⚔",  atk: 1000,   cargo: 1500,     cost: { m: 45000,   c: 15000,   d: 0       } },
  { key: "battlecruiser", name: "Battlecruiser",  icon: "🔱", atk: 700,    cargo: 750,      cost: { m: 30000,   c: 40000,   d: 15000   } },
  { key: "bomber",        name: "Bomber",         icon: "💣", atk: 1000,   cargo: 500,      cost: { m: 50000,   c: 25000,   d: 15000   } },
  { key: "destroyer",     name: "Destroyer",      icon: "💥", atk: 2000,   cargo: 2000,     cost: { m: 60000,   c: 50000,   d: 15000   } },
  { key: "deathstar",     name: "Deathstar",      icon: "🌑", atk: 200000, cargo: 1000000,  cost: { m: 5000000, c: 4000000, d: 1000000 } },
  { key: "recycler",      name: "Recycler",       icon: "♻",  atk: 1,      cargo: 20_000,   cost: { m: 10000,   c: 6000,    d: 2000    } },
  { key: "espionageProbe",name: "Espionage Probe",icon: "👁", atk: 0,      cargo: 0,        cost: { m: 0,       c: 1000,    d: 0       } },
  { key: "colonyShip",    name: "Colony Ship",    icon: "🌍", atk: 50,     cargo: 7500,     cost: { m: 10000,   c: 20000,   d: 10000   } },
  { key: "solarSatellite",name: "Solar Satellite",icon: "🛰", atk: 1,      cargo: 0,        cost: { m: 0,       c: 2000,    d: 500     } },
] as const;

export const SHIP_TYPE_IDX: Record<string, number> = {
  smallCargo: 0, largeCargo: 1, lightFighter: 2, heavyFighter: 3, cruiser: 4,
  battleship: 5, battlecruiser: 6, bomber: 7, destroyer: 8, deathstar: 9,
  recycler: 10, espionageProbe: 11, colonyShip: 12, solarSatellite: 13,
};

export const MISSION_LABELS: Record<number, string> = { 1: "ATTACK", 2: "TRANSPORT", 5: "COLONIZE", 6: "ESPIONAGE" };

const BASE_COSTS: Record<number, [number, number, number]> = {
  0: [60, 15, 0], 1: [48, 24, 0], 2: [225, 75, 0], 3: [75, 30, 0],
  4: [900, 360, 900], 5: [400, 120, 200], 6: [1000000, 500000, 100000],
  7: [400, 200, 100], 8: [1000, 0, 0], 9: [1000, 500, 0],
  10: [1000, 1000, 0], 11: [200, 400, 200], 12: [20, 20, 0],
};

function pow15(n: number): number {
  let r = 1;
  for (let i = 0; i < n; i++) r *= 1.5;
  return r;
}

export function upgradeCost(idx: number, currentLevel: number): [number, number, number] {
  const [bm, bc, bd] = BASE_COSTS[idx] ?? [0, 0, 0];
  const mult = pow15(currentLevel);
  return [Math.floor(bm * mult), Math.floor(bc * mult), Math.floor(bd * mult)];
}

export function buildTimeSecs(idx: number, nextLevel: number, robotics: number): number {
  const [bm, bc] = BASE_COSTS[idx] ?? [0, 0];
  const total = (bm + bc) * pow15(nextLevel - 1);
  return Math.max(1, Math.floor(total / (5 * (1 + robotics))));
}

export function fmt(n: bigint | number): string {
  if (typeof n === "bigint") return n.toString();
  return Math.trunc(n).toLocaleString();
}

export function fmtCountdown(totalSecs: number): string {
  if (totalSecs <= 0) return "READY";
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function missionProgress(m: Mission, nowTs: number): number {
  if (m.applied) {
    const outboundDuration = Math.max(1, m.arriveTs - m.departTs);
    const returnStartTs = m.returnTs - outboundDuration;
    const total = m.returnTs - returnStartTs;
    const elapsed = nowTs - returnStartTs;
    return total <= 0 ? 100 : Math.min(100, Math.floor((elapsed / total) * 100));
  }
  const total = m.arriveTs - m.departTs;
  const elapsed = nowTs - m.departTs;
  return total <= 0 ? 100 : Math.min(100, Math.floor((elapsed / total) * 100));
}

export function energyEfficiency(res: Resources): number {
  if (res.energyConsumption === 0n) return 100;
  return Math.min(100, Number((res.energyProduction * 100n) / res.energyConsumption));
}
