import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createPortal } from "react-dom";
import { Html, Line, OrbitControls, PerspectiveCamera, useTexture } from "@react-three/drei";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as THREE from "three";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MapPin, Navigation2, TrendingUp, X, Zap, ZoomIn, ZoomOut } from "lucide-react";
import { createUniverseSnapshotFromChainData, orbitForSystemPosition, pointOnUniverseOrbit, snapshotFromPublicPlanets, type UniverseMission, type UniverseOrbit, type UniversePlanet, type UniverseSnapshot } from "./universe-data";
import { emptySystemDisplayOrbit, missionDestinationIsLocal, missionJourneyProgress, systemEntryPoint, readableFleetScale } from './mission-scene';
import { missionEndpoints, missionTrafficPoints, missionVisibleAtScale, missionRenderGroups, galaxyTravelEndpoints, trafficPointLabel, type MissionLocation, type TrafficPoint } from './mission-visibility';
import { fetchAllianceDirectory, fetchAllianceGovernance, fetchAllPublicPlanets, fetchSystemSovereignties, fetchUniverseMapData, SOVEREIGNTY_WRITES_ENABLED, type AllianceDecisionAccount, type AllianceGovernanceConfigAccount, type AllianceStateAccount, type SystemSovereigntyAccount } from "./game-state";
import { planetSurfaceStyleForSystem, type PlanetSurfaceStyle } from "./planet-style";
import { planetBiomeIndex, planetBiomeTexture } from "./planet-biome-assets";
import { useProceduralPlanetTexture } from "./procedural-planet-texture";
import { buyDecisionMarketSide, estimateDecisionMarketBuyMinimum, estimateDecisionMarketSellMinimum, fetchDecisionMarket, launchDecisionProposal, redeemDecisionMarketPositions, requestDecisionMarketFinalization, sellDecisionMarketSide, stakeToDecisionProposal, unstakeFromDecisionProposal, type DecisionMarketSide, type DecisionMarketSnapshot, type SponsoredTokenAccountBuilder } from "./futarchy-market";
import WalletConnectControl from "./WalletConnectControl";
import { GameButton, GameIconButton, GameEmptyState, GameWorkspace } from "./design-system/game-ui";
import "./universe-lab.css";
import "./system-command-polish.css";
import { SceneReady, SceneTransition, useSceneTransit, useCameraInputCancel } from './SceneTransition';
import { easeSceneProgress, motionDuration, sceneAspectDistanceScale } from './scene-motion';
import './game-polish.css';
import stellarCorona from "./assets/universe-lab/stellar-corona.webp";
import galaxyStellarFlare from "./assets/universe-lab/stellar-flare-v2.webp";
import { GALAXY_KINDS, galaxyKindForId, galaxySystemLayout, starForSystem, type GalaxyKind, type StarDefinition } from "./stellar-system";
import cinematicNebulaPanorama from "./assets/universe-lab/starless-deep-space-v4.webp";
import terranClouds from "./assets/planet-world/terran-clouds-v2.webp";
import gamesolMark from "./assets/ui/logobg.png";
import { strategicFleetScale } from './FleetVessel';
import { TravelFleetVessel, TravelCosmeticsProvider, useTravelCosmetics } from './TravelFleetVessel';
import { GAME_STATE_PROGRAM_ID } from './game-state';
import usdcCoin from "./assets/ui/usdc.svg";
import metalResource from "./assets/ui/metalMine.webp";
import crystalResource from "./assets/ui/crystalMine.webp";
import deuteriumResource from "./assets/ui/deuteriumSynthesizer.webp";

const FACTION_COLORS: Record<UniversePlanet["faction"], string> = { owned: "#44f7c3", allied: "#5fa9ff", unknown: "#a8b5c9", hostile: "#ff586d" };
type ZoomLevel = "universe" | "galaxy" | "system";
type GraphicsMode = "3d" | "compat";
const MAX_GALAXY = 999;
const SYSTEMS_PER_GALAXY = 999;
const PLANETS_PER_SYSTEM = 15;
const SYSTEM_PLANET_MIN_FOOTPRINT_MULTIPLIER = 20;
const SYSTEM_PLANET_MAX_FOOTPRINT_MULTIPLIER = 50;
const SYSTEM_ORBIT_PRESENTATION_SCALE = 3;

function systemPlanetLinearMagnification(position: number): number {
  const slotProgress = THREE.MathUtils.clamp((position - 1) / (PLANETS_PER_SYSTEM - 1), 0, 1);
  const footprintMultiplier = THREE.MathUtils.lerp(
    SYSTEM_PLANET_MIN_FOOTPRINT_MULTIPLIER,
    SYSTEM_PLANET_MAX_FOOTPRINT_MULTIPLIER,
    slotProgress,
  );
  return Math.sqrt(footprintMultiplier);
}

function occupiedSystemPlanetRadius(planet: UniversePlanet): number {
  const [galaxy, system, rawPosition] = planet.system.split(":").map(Number);
  const position = rawPosition || 1;
  const style = planetSurfaceStyleForSystem(position, galaxy || 1, system || 1);
  const baseRadius = (planet.faction === "owned" ? .92 : planet.faction === "allied" ? .84 : .78)
    * (style.className === "gas" ? 1.16 : 1);
  return baseRadius * systemPlanetLinearMagnification(position);
}

const GALAXY_SECTOR_SIZE = 128;
const SOVEREIGNTY_SPECIALIZATIONS = ["UNSPECIFIED", "INDUSTRIAL", "RESEARCH", "MILITARY"];
const SOVEREIGNTY_EFFECTS = [
  "NO ACTIVE BONUS",
  "10% FASTER PLANETARY CONSTRUCTION",
  "15% FASTER RESEARCH",
  "15% FASTER SHIP AND DEFENSE CONSTRUCTION",
];
const FUTARCHY_PROGRAM_ID = import.meta.env.VITE_FUTARCHY_PROGRAM_ID as string | undefined;
const FUTARCHY_DAO = import.meta.env.VITE_FUTARCHY_DAO as string | undefined;
const FUTARCHY_EXECUTOR = import.meta.env.VITE_FUTARCHY_EXECUTOR as string | undefined;
const FUTARCHY_PROPOSAL = import.meta.env.VITE_FUTARCHY_PROPOSAL as string | undefined;

function optionalPublicKey(value: string | undefined): PublicKey | null {
  if (!value) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

const FUTARCHY_PROGRAM_KEY = optionalPublicKey(FUTARCHY_PROGRAM_ID);
const FUTARCHY_DAO_KEY = optionalPublicKey(FUTARCHY_DAO);
const FUTARCHY_PROPOSAL_KEY = optionalPublicKey(FUTARCHY_PROPOSAL);

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
function formatUpkeepTime(until: number): string {
  const seconds = Math.max(0, until - Math.floor(Date.now() / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return `${days}D ${hours}H`;
}

function formatMarketTime(until: number): string {
  const seconds = Math.max(0, until - Math.floor(Date.now() / 1000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return seconds > 0 ? `${hours}H ${String(minutes).padStart(2, "0")}M` : "AWAITING FINALIZATION";
}

function marketPhase(market: DecisionMarketSnapshot, executed = false): "STAKING" | "TRADING" | "FINALIZING" | "PASSED" | "FAILED" | "EXECUTED" | "UNKNOWN" {
  if (executed) return "EXECUTED";
  if (market.state === "DRAFT") return "STAKING";
  if (market.state === "PENDING") return market.closesAt > Math.floor(Date.now() / 1000) ? "TRADING" : "FINALIZING";
  return market.state === "PASSED" || market.state === "FAILED" ? market.state : "UNKNOWN";
}

type LiveDecisionMarket = {
  decision: AllianceDecisionAccount;
  governance: AllianceGovernanceConfigAccount;
  alliance: AllianceStateAccount | null;
  market: DecisionMarketSnapshot;
};

async function mapSettledWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }));
  return results;
}

function decisionActionLabel(action: number): string {
  return action === 0 ? "CLAIM SYSTEM" : action === 1 ? "FUND UPKEEP" : action === 2 ? "SET SPECIALIZATION" : "ALLIANCE ACTION";
}

function decisionActionDetail(decision: AllianceDecisionAccount): string {
  const system = `G${decision.galaxy}:S${decision.system}`;
  if (decision.action === 0) return `Claim ${system} for the alliance · ${SOVEREIGNTY_SPECIALIZATIONS[decision.specialization] ?? "UNSPECIFIED"} specialization · vulnerability ${String(decision.vulnerabilityHourUtc).padStart(2, "0")}:00 UTC`;
  if (decision.action === 1) return `Extend ${system} sovereignty upkeep by 7 days`;
  if (decision.action === 2) return `Change ${system} specialization to ${SOVEREIGNTY_SPECIALIZATIONS[decision.specialization] ?? `TYPE ${decision.specialization}`}`;
  return `Apply alliance action ${decision.action} to ${system}`;
}

function decisionResourceCost(action: number): { metal: number; crystal: number; deuterium: number } | null {
  if (action === 0) return { metal: 100, crystal: 50, deuterium: 25 };
  if (action === 1) return { metal: 25, crystal: 15, deuterium: 10 };
  if (action === 2) return { metal: 20, crystal: 20, deuterium: 10 };
  return null;
}

function formatDecisionDate(timestamp: number): string {
  if (!timestamp) return "ON-CHAIN";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp * 1000)).toUpperCase();
}

function DecisionStakeControls({ market, daoAddress, proposalAddress, onRefresh }: { market: DecisionMarketSnapshot; daoAddress: string; proposalAddress: string; onRefresh: () => Promise<void> }) {
  const { connection } = useConnection();
  const { sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState<"STAKE" | "UNSTAKE" | "LAUNCH" | null>(null);
  const [status, setStatus] = useState("");
  const progress = market.requiredStake > 0 ? Math.min(100, market.totalStaked / market.requiredStake * 100) : 0;
  const thresholdReached = market.totalStakedRaw >= market.requiredStakeRaw;
  const transact = async (action: "STAKE" | "UNSTAKE" | "LAUNCH") => {
    if (!anchorWallet) return;
    setBusy(action);
    setStatus(`${action === "LAUNCH" ? "Preparing market launch" : `Preparing ${action.toLowerCase()}`}…`);
    try {
      const common = { connection, wallet: anchorWallet as any, sendTransaction, daoAddress, proposalAddress };
      const signature = action === "STAKE"
        ? await stakeToDecisionProposal({ ...common, amount })
        : action === "UNSTAKE"
          ? await unstakeFromDecisionProposal({ ...common, amount })
          : await launchDecisionProposal(common);
      setStatus(`${action} CONFIRMED · ${shortAddress(signature)}`);
      await onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${action} failed.`);
    } finally {
      setBusy(null);
    }
  };
  return <div className="market-stake-panel">
    <div className="market-stake-progress"><div><span>LAUNCH STAKE</span><b>{market.totalStaked.toFixed(2)} / {market.requiredStake.toFixed(2)} AM</b></div><div className="market-stake-track" aria-label={`${progress.toFixed(0)} percent funded`}><i style={{ width: `${progress}%` }} /></div><small>{thresholdReached ? "THRESHOLD REACHED · READY TO LAUNCH" : `${(market.requiredStake - market.totalStaked).toFixed(2)} AM REMAINING`}</small></div>
    <div className="market-stake-balances"><span>WALLET <b>{market.walletAntimatter.toFixed(2)} AM</b></span><span>YOUR STAKE <b>{market.walletStaked.toFixed(2)} AM</b></span></div>
    {anchorWallet ? <>
      <label className="market-stake-amount"><span>ANTIMATTER AMOUNT</span><input type="number" min="0.000001" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!!busy} /></label>
      <div className="market-stake-actions"><button className="stake" disabled={!!busy || market.state !== "DRAFT"} onClick={() => void transact("STAKE")}>{busy === "STAKE" ? "CONFIRMING…" : "STAKE AM"}</button><button className="unstake" disabled={!!busy || !market.canUnstake} onClick={() => void transact("UNSTAKE")}>{busy === "UNSTAKE" ? "CONFIRMING…" : "UNSTAKE"}</button>{thresholdReached && market.state === "DRAFT" && <button className="launch" disabled={!!busy} onClick={() => void transact("LAUNCH")}>{busy === "LAUNCH" ? "LAUNCHING…" : "LAUNCH MARKET"}</button>}</div>
    </> : <div className="market-hub-connect"><WalletConnectControl disconnectedLabel="ENTER WITH PASSKEY TO STAKE" connectingLabel="OPENING PASSKEY..." /></div>}
    <p className="market-stake-note">Stake helps this proposal reach MetaDAO's launch requirement. It is not a market trade, and your recorded stake can be withdrawn under the on-chain unstake rules.</p>
    {status && <p className={`market-hub-status${status.includes("CONFIRMED") ? " success" : ""}`}>{status}</p>}
  </div>;
}

function DecisionResolutionControls({ market, daoAddress, proposalAddress, onRefresh, sponsorTokenAccounts }: { market: DecisionMarketSnapshot; daoAddress: string; proposalAddress: string; onRefresh: () => Promise<void>; sponsorTokenAccounts?: SponsoredTokenAccountBuilder; onSceneReady?: () => void }) {
  const { connection } = useConnection();
  const { sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();
  const [redeeming, setRedeeming] = useState(false);
  const [status, setStatus] = useState("");
  const phase = marketPhase(market);
  const hasConditionalPosition = market.walletPassAntimatter > 0
    || market.walletFailAntimatter > 0
    || market.walletPassUsdc > 0
    || market.walletFailUsdc > 0;
  if (phase === "FINALIZING") return <div className="market-resolution is-finalizing"><TrendingUp /><div><b>TRADING CLOSED · AUTOMATIC FINALIZATION QUEUED</b><span>The keeper verifies Solana cluster time and retries until the MetaDAO TWAP can be finalized.</span></div></div>;
  if (phase !== "PASSED" && phase !== "FAILED") return null;
  const redeem = async () => {
    if (!anchorWallet) return;
    setRedeeming(true);
    setStatus("Preparing conditional position redemption…");
    try {
      const signature = await redeemDecisionMarketPositions({ connection, wallet: anchorWallet as any, sendTransaction, daoAddress, proposalAddress, sponsorTokenAccounts });
      setStatus(`REDEMPTION CONFIRMED · ${shortAddress(signature)}`);
      await onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Position redemption failed.");
    } finally {
      setRedeeming(false);
    }
  };
  return <div className={`market-resolution is-${phase.toLowerCase()}`}>
    <TrendingUp />
    <div><b>PROPOSAL {phase}</b><span>{phase === "PASSED" ? "The approved alliance action can continue through its configured Squads executor." : "The alliance action was rejected and must not execute."}</span></div>
    {hasConditionalPosition && (anchorWallet
      ? <button type="button" disabled={redeeming} onClick={() => void redeem()}>{redeeming ? "REDEEMING…" : "REDEEM POSITIONS"}</button>
      : <WalletConnectControl disconnectedLabel="CONNECT TO REDEEM" connectingLabel="OPENING WALLET…" />)}
    {status && <p className={status.includes("CONFIRMED") ? "success" : ""}>{status}</p>}
  </div>;
}

function DecisionMarketDirectoryCard({ entry, onVisitSystem, onRefresh, sponsorTokenAccounts }: { entry: LiveDecisionMarket; onVisitSystem: () => void; onRefresh: () => Promise<void>; sponsorTokenAccounts?: SponsoredTokenAccountBuilder; onSceneReady?: () => void }) {
  const { connection } = useConnection();
  const { sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();
  const [tradeMode, setTradeMode] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("1");
  const [slippage, setSlippage] = useState("2");
  const [tradeBusy, setTradeBusy] = useState<DecisionMarketSide | null>(null);
  const [tradeStatus, setTradeStatus] = useState("");
  const slippageBps = Math.round(Number(slippage) * 100);
  const estimate = (side: DecisionMarketSide) => {
    try { return tradeMode === "BUY" ? estimateDecisionMarketBuyMinimum(entry.market, side, amount, slippageBps) : estimateDecisionMarketSellMinimum(entry.market, side, amount, slippageBps); }
    catch { return null; }
  };
  const passEstimate = estimate("PASS");
  const failEstimate = estimate("FAIL");
  const trade = async (side: DecisionMarketSide) => {
    if (!anchorWallet) return;
    setTradeBusy(side);
    setTradeStatus(`Preparing ${tradeMode.toLowerCase()} ${side.toLowerCase()} trade...`);
    try {
      const executeTrade = tradeMode === "BUY" ? buyDecisionMarketSide : sellDecisionMarketSide;
      const result = await executeTrade({
        connection,
        wallet: anchorWallet as any,
        sendTransaction,
        daoAddress: entry.governance.dao,
        proposalAddress: entry.decision.externalProposal,
        side,
        amount,
        slippageBps,
        sponsorTokenAccounts,
      });
      setTradeStatus(`${tradeMode} ${side} confirmed · minimum ${result.minimumOutput.toFixed(4)} conditional ${tradeMode === "BUY" ? "AM" : "USDC"}`);
      await onRefresh();
    } catch (error) {
      setTradeStatus(error instanceof Error ? error.message : "Trade failed.");
    } finally {
      setTradeBusy(null);
    }
  };
  const allianceName = entry.alliance?.name || `Alliance ${shortAddress(entry.decision.alliance)}`;
  const allianceTag = entry.alliance?.tag ? `[${entry.alliance.tag}]` : "ON-CHAIN ALLIANCE";
  const phase = marketPhase(entry.market, entry.decision.executed);
  const tradingOpen = phase === "TRADING";
  const resolved = phase === "PASSED" || phase === "FAILED" || phase === "EXECUTED";
  const resourceCost = decisionResourceCost(entry.decision.action);
  const outcomeCopy = phase === "EXECUTED"
    ? `EXECUTED ${formatDecisionDate(entry.decision.executedAt)} · GAME STATE UPDATED ON-CHAIN`
    : phase === "PASSED"
      ? `APPROVED BY THE MARKET · CLOSED ${formatDecisionDate(entry.market.closesAt)} · AWAITING SQUADS/GAME EXECUTION`
      : phase === "FAILED"
        ? `REJECTED BY THE MARKET · CLOSED ${formatDecisionDate(entry.market.closesAt)} · NO GAME RESOURCES SPENT`
        : phase === "FINALIZING"
          ? `TRADING CLOSED ${formatDecisionDate(entry.market.closesAt)} · OUTCOME PENDING`
          : "PROPOSED ON-CHAIN ALLIANCE ACTION";
  return <article className="market-hub-card">
    <header>
      <div><span>{allianceTag}</span><h3>{decisionActionLabel(entry.decision.action)}</h3><p>{allianceName} · Proposal #{entry.decision.id.toString()}</p></div>
      <button onClick={onVisitSystem}><MapPin /> G{entry.decision.galaxy}:S{entry.decision.system}</button>
    </header>
    <div className={`market-action-record is-${phase.toLowerCase()}`}><span>{phase === "EXECUTED" ? "WHAT IT DID" : "BOUND ACTION"}</span><b>{decisionActionDetail(entry.decision)}</b><small>{outcomeCopy}</small>{resourceCost && <div className="market-action-cost" aria-label="Alliance treasury resource cost"><span><img src={metalResource} alt="Metal" />{resourceCost.metal}</span><span><img src={crystalResource} alt="Crystal" />{resourceCost.crystal}</span><span><img src={deuteriumResource} alt="Deuterium" />{resourceCost.deuterium}</span></div>}</div>
    {entry.market.state === "DRAFT" ? <DecisionStakeControls market={entry.market} daoAddress={entry.governance.dao} proposalAddress={entry.decision.externalProposal} onRefresh={onRefresh} /> : <>
    {resolved
      ? <div className="market-hub-prices market-hub-resolution"><div className={phase === "FAILED" ? "fail" : "pass"}><span>RESULT</span><b>{phase === "EXECUTED" ? "PASSED" : phase}</b></div><div><span>MARKET CLOSED</span><b>{formatDecisionDate(entry.market.closesAt)}</b></div><div><span>GAME EXECUTION</span><b>{phase === "EXECUTED" ? "COMPLETED" : phase === "PASSED" ? "AWAITING" : "NOT REQUIRED"}</b></div></div>
      : <div className="market-hub-prices"><div className="pass"><span>PASS</span><b>${entry.market.passPrice.toFixed(4)}</b></div><div className="fail"><span>FAIL</span><b>${entry.market.failPrice.toFixed(4)}</b></div><div><span>{phase === "TRADING" ? "CLOSES" : "CLOSED"}</span><b>{phase === "TRADING" ? formatMarketTime(entry.market.closesAt) : formatDecisionDate(entry.market.closesAt)}</b></div></div>}
    <div className="market-hub-balances"><span><img src={usdcCoin} alt="" />{entry.market.walletUsdc.toFixed(2)} USDC</span><span><Zap />{entry.market.walletAntimatter.toFixed(2)} AM</span><span className="pass">PASS {entry.market.walletPassAntimatter.toFixed(2)} AM · {entry.market.walletPassUsdc.toFixed(2)} USDC</span><span className="fail">FAIL {entry.market.walletFailAntimatter.toFixed(2)} AM · {entry.market.walletFailUsdc.toFixed(2)} USDC</span></div>
    {tradingOpen && (anchorWallet ? <div className="market-hub-order">
      <div className="market-trade-mode" role="group" aria-label="Trade direction"><button type="button" className={tradeMode === "BUY" ? "active" : ""} onClick={() => setTradeMode("BUY")} disabled={!!tradeBusy}>BUY</button><button type="button" className={tradeMode === "SELL" ? "active" : ""} onClick={() => setTradeMode("SELL")} disabled={!!tradeBusy}>SELL</button></div>
      <label><span>{tradeMode === "BUY" ? "SPEND DEVNET USDC" : "SELL CONDITIONAL AM"}</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!!tradeBusy} /></label>
      <label><span>MAX SLIPPAGE %</span><input type="number" min="0.1" max="10" step="0.1" inputMode="decimal" value={slippage} onChange={(event) => setSlippage(event.target.value)} disabled={!!tradeBusy} /></label>
      <div><button className="pass" disabled={!!tradeBusy || passEstimate === null} onClick={() => void trade("PASS")}><b>{tradeBusy === "PASS" ? "CONFIRMING..." : `${tradeMode} PASS`}</b><small>{passEstimate === null ? "CHECK AMOUNT" : `MIN ${passEstimate.toFixed(4)} ${tradeMode === "BUY" ? "AM" : "USDC"}`}</small></button><button className="fail" disabled={!!tradeBusy || failEstimate === null} onClick={() => void trade("FAIL")}><b>{tradeBusy === "FAIL" ? "CONFIRMING..." : `${tradeMode} FAIL`}</b><small>{failEstimate === null ? "CHECK AMOUNT" : `MIN ${failEstimate.toFixed(4)} ${tradeMode === "BUY" ? "AM" : "USDC"}`}</small></button></div>
    </div> : <div className="market-hub-connect"><WalletConnectControl disconnectedLabel="ENTER WITH PASSKEY TO TRADE" connectingLabel="OPENING PASSKEY..." /><small>Anyone can trade. Alliance membership is not required.</small></div>)}
    {!tradingOpen && <DecisionResolutionControls market={entry.market} daoAddress={entry.governance.dao} proposalAddress={entry.decision.externalProposal} onRefresh={onRefresh} sponsorTokenAccounts={sponsorTokenAccounts} />}
    {tradeStatus && <p className={`market-hub-status${tradeStatus.includes("confirmed") ? " success" : ""}`}>{tradeStatus}</p>}
    </>}
    <footer><span>{phase === "STAKING" ? "ON-CHAIN DRAFT · STAKING REQUIRED" : phase === "TRADING" ? "LIVE CONDITIONAL MARKET" : `${phase} · ON-CHAIN`}</span><a href={`https://explorer.solana.com/address/${entry.decision.externalProposal}?cluster=devnet`} target="_blank" rel="noreferrer">VERIFY PROPOSAL</a></footer>
  </article>;
}

function detectUniverseGraphicsMode(): GraphicsMode {
  if (typeof document === "undefined") return "compat";
  try {
    const canvas = document.createElement("canvas");
    // A software-backed but standards-compliant WebGL2 context can still run
    // the cinematic scene. Treating "major performance caveat" as a hard
    // failure incorrectly downgraded many Chrome/Windows players.
    const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" });
    if (!gl) return "compat";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return "3d";
  } catch {
    return "compat";
  }
}

const GALAXY_COLORS = ["#86d5ff", "#c597ff", "#ffbd72", "#9cf7d4", "#6d8dff", "#ff8bbf"];
type GalaxyDefinition = { id: string; label: string; position: [number, number, number]; density: number; kind: typeof GALAXY_KINDS[number]; tint: string; liveWorlds: number };
type GalaxySystem = { id: string; label: string; position: [number, number, number]; occupied: boolean; star: StarDefinition; planetCount: number };
export type UniverseOwnedPlanet = { entity: string; name: string; galaxy: number; system: number; position: number; activeJobs?: number; readyActions?: number; energyPercent?: number };

function EmpireWorldPortrait({ planet, index }: { planet: UniverseOwnedPlanet; index: number }) {
  const style = planetSurfaceStyleForSystem(planet.position, planet.galaxy, planet.system);
  const texture = planetBiomeTexture(style);
  const seed = style.variantSeed ?? 0;
  return <span
    className={`empire-world-portrait is-${style.className}${style.rings ? " has-rings" : ""}`}
    style={{
      backgroundColor: style.water,
      backgroundImage: `radial-gradient(circle at 31% 24%, rgba(255,255,255,.54), transparent 21%), linear-gradient(145deg, ${style.atmosphere}1f, ${style.water}38), url(${texture})`,
      backgroundPosition: `center, center, ${20 + seed % 61}% ${18 + (seed >>> 8) % 65}%`,
      backgroundSize: "auto, auto, 170%",
      backgroundBlendMode: "screen, color, normal",
      borderColor: style.atmosphere,
      boxShadow: `inset -7px -5px 11px rgba(0,0,0,.72), inset 3px 3px 6px rgba(255,255,255,.12), 0 0 13px ${style.atmosphere}35`,
    }}
    aria-hidden="true"
  ><i>{String(index).padStart(2, "0")}</i></span>;
}

function empireWorldDirective(planet: UniverseOwnedPlanet) {
  if ((planet.readyActions ?? 0) > 0) return {
    tone: "ready",
    eyebrow: "RESULTS READY",
    title: `${planet.readyActions} completed ${planet.readyActions === 1 ? "order" : "orders"}`,
    detail: "Review the result, then issue this world's next command.",
    action: "REVIEW WORLD",
  };
  if ((planet.energyPercent ?? 100) < 100) return {
    tone: "warning",
    eyebrow: "PRODUCTION THROTTLED",
    title: `${planet.energyPercent ?? 0}% power efficiency`,
    detail: "Restore energy before committing more resources to expansion.",
    action: "RESTORE POWER",
  };
  if ((planet.activeJobs ?? 0) > 0) return {
    tone: "active",
    eyebrow: "COMMANDS UNDERWAY",
    title: `${planet.activeJobs} active ${planet.activeJobs === 1 ? "operation" : "operations"}`,
    detail: "Track construction, research, fleet, and mission progress.",
    action: "TRACK PROGRESS",
  };
  return {
    tone: "stable",
    eyebrow: "WORLD READY",
    title: "Awaiting your next order",
    detail: "Develop production, advance technology, or prepare a fleet.",
    action: "OPEN COMMAND",
  };
}
// This is one rendered sector of the backend's 1-999 galaxy range. Additional
// sectors are generated from exactly the same deterministic coordinate seed.
function buildGalaxySector(firstGalaxy: number, populations: Map<number, number>): GalaxyDefinition[] {
  return Array.from({ length: GALAXY_SECTOR_SIZE }, (_, index) => {
  const column = index % 12;
  const row = Math.floor(index / 12);
  const galaxy = firstGalaxy + index;
    return { id: `g-${galaxy}`, label: galaxy.toString().padStart(3, "0"), position: [(column - 3.5) * 58 + Math.sin(galaxy * 2.7) * 8, (row - 3.5) * 48 + Math.cos(galaxy * 1.9) * 7, Math.sin(galaxy * 0.71) * 52 + Math.cos(galaxy * 1.27) * 18] as [number, number, number], density: 24 + ((galaxy * 37) % 128), kind: galaxyKindForId(galaxy), tint: GALAXY_COLORS[galaxy % GALAXY_COLORS.length], liveWorlds: populations.get(galaxy) ?? 0 };
  });
}
// Galaxy-map stars use a compact icon scale. Inside a system we use a much
// larger, compressed astronomical scale: the real Sun/Earth ratio (~109:1)
// would make planets unusable, but planets must never read as star-sized.
function heroStarScale(star: StarDefinition) { return THREE.MathUtils.clamp(4.4 + star.scale * 1.2, 4.85, 7.4); }
function systemStarSurfaceRadius(star: StarDefinition): number {
  switch (star.label) {
    case "Red Dwarf": return 14;
    case "Orange Dwarf": return 17;
    case "Yellow Dwarf": return 19;
    case "White Main Sequence": return 20;
    case "Blue Main Sequence": return 22;
    case "White Dwarf": return 9;
    case "Red Giant": return 26;
    case "Blue Giant": return 24;
    case "Red Supergiant": return 31;
    case "Blue Supergiant": return 33;
    case "Carbon Star": return 25;
    case "Wolf-Rayet Star": return 22;
    case "Neutron Star": return 6;
    case "Pulsar": return 6.5;
    case "Magnetar": return 7;
    case "Binary System": return 18;
    case "Supernova Remnant": return 22;
    default: return 18;
  }
}
function systemStarClearanceRadius(star: StarDefinition): number {
  const radius = systemStarSurfaceRadius(star);
  return star.binary ? radius * 1.08 : radius;
}
function systemStarOrbitOffset(star: StarDefinition): number {
  return Math.max(0, systemStarClearanceRadius(star) - 18) * .72;
}
function systemCameraDistance(star: StarDefinition): number {
  return THREE.MathUtils.clamp(118 + (systemStarClearanceRadius(star) - 17) * 3, 86, 162);
}
function systemSurveyCameraDistance(star: StarDefinition): number {
  // An unoccupied system opens as a survey rather than a close-up. The star
  // remains the visual anchor while enough orbital space is visible to make
  // empty worlds discoverable without compressing their collision-safe paths.
  return THREE.MathUtils.clamp(systemCameraDistance(star) * 1.34, 154, 224);
}
const SYSTEM_DEMO_ALLIANCES: Array<{ tag: string; name: string; faction: UniversePlanet["faction"] }> = [
  { tag: "[AMV]", name: "Antimatter Vanguard", faction: "owned" },
  { tag: "[NOVA]", name: "Nova Concord", faction: "allied" },
  { tag: "[RIFT]", name: "Rift Coalition", faction: "hostile" },
  { tag: "[HELIX]", name: "Helix Directorate", faction: "unknown" },
];
const SYSTEM_DEMO_WORLD_NAMES = ["Aegis", "Caelum", "Vesper", "Talos", "Ilyra", "Orison", "Khepri", "Nereid", "Cinder", "Eidolon", "Hyperion", "Morrow", "Arcadia", "Vanta", "Terminus"];

function createFullSystemVisualDemo(galaxy: number, system: number): UniverseSnapshot {
  const planets = Array.from({ length: PLANETS_PER_SYSTEM }, (_, index): UniversePlanet => {
    const position = index + 1;
    const alliance = SYSTEM_DEMO_ALLIANCES[index % SYSTEM_DEMO_ALLIANCES.length];
    const orbit = orbitForSystemPosition(position, galaxy * 1000 + system);
    return {
      id: `local-demo-${galaxy}-${system}-${position}`,
      name: `${SYSTEM_DEMO_WORLD_NAMES[index]} ${position}`,
      ownerLabel: `${alliance.tag} ${alliance.name}`,
      seedLabel: `DEMO-${String(position).padStart(2, "0")}`,
      coordinates: pointOnUniverseOrbit(orbit),
      orbit,
      system: `${galaxy}:${system}:${position}`,
      className: planetSurfaceStyleForSystem(position, galaxy, system).className,
      faction: alliance.faction,
      shielded: position % 4 === 0,
      metal: 18_000 + position * 3_700,
      crystal: 11_000 + position * 2_900,
      deuterium: 7_000 + position * 1_850,
      fleetPower: 9_500 + position * 6_250,
    };
  });
  const missions = Array.from({ length: 24 }, (_, index): UniverseMission => {
    const sourceIndex = index % planets.length;
    let destinationIndex = (index * 5 + 4) % planets.length;
    if (destinationIndex === sourceIndex) destinationIndex = (destinationIndex + 3) % planets.length;
    const external = index >= 18;
    const inbound = index >= 18 && index < 21;
    const externalAngle = .45 + (index - 18) * (Math.PI * 2 / 6);
    const externalCoordinates: [number, number, number] = [Math.cos(externalAngle) * 77, ((index % 3) - 1) * 5.5, Math.sin(externalAngle) * 69];
    return {
      id: `local-demo-fleet-${index + 1}`,
      sourceId: external && inbound ? `local-demo-external-source-${index}` : planets[sourceIndex].id,
      destinationId: external && !inbound ? `local-demo-external-destination-${index}` : planets[destinationIndex].id,
      sourceCoordinates: external && inbound ? externalCoordinates : undefined,
      destinationCoordinates: external && !inbound ? externalCoordinates : undefined,
      kind: (["transport", "attack", "espionage", "colonize"] as const)[index % 4],
      phase: "outbound",
      progress: (index * .137) % 1,
      etaSeconds: 900 + index * 173,
      durationSeconds: 5400 + index * 211,
    };
  });
  assertFullSystemDemoCollisionSafety(planets);
  return { sector: "LOCAL VISUAL SIMULATION", planets, missions };
}
function buildGalaxySystems(galaxy: number, planets: UniversePlanet[]): GalaxySystem[] {
  const systemsByNumber = new Map<number, number>();
  for (const planet of planets) {
    const coords = planet.system.split(":").map(Number);
    if (coords[0] !== galaxy) continue;
    const systemId = coords[1] || 0;
    systemsByNumber.set(systemId, (systemsByNumber.get(systemId) ?? 0) + 1);
  }
  return Array.from({ length: SYSTEMS_PER_GALAXY }, (_, index) => {
    const systemId = index + 1;
    const layout = galaxySystemLayout(galaxy, systemId);
    return {
      id: `s-${galaxy}-${systemId}`,
      label: systemId.toString().padStart(3, "0"),
      planetCount: systemsByNumber.get(systemId) ?? 0,
      position: layout.position,
      occupied: (systemsByNumber.get(systemId) ?? 0) > 0,
      star: starForSystem(galaxy, systemId),
    };
  });
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

function GalaxyNode({ galaxy, selected, onSelect }: { galaxy: GalaxyDefinition; selected: boolean; onSelect: () => void }) {
  const visual = useRef<THREE.Group>(null!);
  const galaxyTexture = useTexture(stellarCorona);
  galaxyTexture.colorSpace = THREE.SRGBColorSpace;
  const { stars, dust, core } = useMemo(() => {
    const random = seeded(Number(galaxy.label) * 971);
    const positions: number[] = [];
    const dustPositions: number[] = [];
    const corePositions: number[] = [];
    const count = 2600;
    for (let index = 0; index < count; index += 1) {
      const arm = index % (galaxy.kind === "spiral" ? 4 : galaxy.kind === "barred" ? 2 : 6);
      const radius = Math.pow(random(), 0.56) * 6.3 + 0.58;
      const base = arm * (Math.PI * 2 / (galaxy.kind === "barred" ? 2 : galaxy.kind === "elliptical" ? 6 : 4)) + radius * 1.62;
      const angle = base + (random() - 0.5) * (galaxy.kind === "elliptical" ? 2.9 : 0.7);
      const ellipse = galaxy.kind === "elliptical" ? 0.57 : galaxy.kind === "barred" ? 0.7 : 0.88;
      const x = Math.cos(angle) * radius;
      const y = (random() - 0.5) * (galaxy.kind === "elliptical" ? 0.72 : 0.15);
      const z = Math.sin(angle) * radius * ellipse;
      positions.push(x, y, z);
      if (index % 3 === 0) dustPositions.push(x * 1.04, y * 1.9, z * 1.04);
      if (index < 520 && index % 2 === 0) corePositions.push(x * 0.48, y * 0.7, z * 0.48);
    }
    return { stars: new Float32Array(positions), dust: new Float32Array(dustPositions), core: new Float32Array(corePositions) };
  }, [galaxy]);
  useFrame(({ clock }) => {
    if (visual.current) visual.current.rotation.y = clock.getElapsedTime() * (selected ? 0.018 : 0.009);
  });
  return <group position={galaxy.position} scale={2.1} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
    <group ref={visual} rotation={[0.18, Number(galaxy.label) * 0.12, 0]}>
      <sprite scale={[5.8, 5.8, 1]}><spriteMaterial map={galaxyTexture} color={galaxy.tint} transparent opacity={selected ? 0.27 : 0.14} blending={THREE.AdditiveBlending} depthWrite={false} /></sprite>
      <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[dust, 3]} /></bufferGeometry><pointsMaterial color={galaxy.tint} size={0.22} sizeAttenuation transparent opacity={selected ? 0.25 : 0.13} blending={THREE.AdditiveBlending} depthWrite={false} /></points>
      <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[stars, 3]} /></bufferGeometry><pointsMaterial color={galaxy.tint} size={0.13} sizeAttenuation transparent opacity={selected ? 1 : 0.82} blending={THREE.AdditiveBlending} depthWrite={false} /></points>
      <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[core, 3]} /></bufferGeometry><pointsMaterial color="#fff4d3" size={0.23} sizeAttenuation transparent opacity={selected ? 0.95 : 0.68} blending={THREE.AdditiveBlending} depthWrite={false} /></points>
    </group>
    <mesh><sphereGeometry args={[0.72 + galaxy.density / 500, 48, 48]} /><meshBasicMaterial color="#000000" /></mesh>
    <Html center distanceFactor={30} zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}><div className="galaxy-label"><b>GALAXY {galaxy.label}</b><span>{galaxy.liveWorlds} ON-CHAIN WORLDS</span></div></Html>
  </group>;
}

function DeepUniverseStarfield() {
  const { positions, colors } = useMemo(() => {
    const random = seeded(918_273);
    const starPositions: number[] = [];
    const starColors: number[] = [];
    const palette = [new THREE.Color("#dff7ff"), new THREE.Color("#87bdff"), new THREE.Color("#ffe5b0"), new THREE.Color("#d8c7ff")];
    // Keep the intergalactic background deliberately sparse. Galaxies must
    // read as immense structures suspended in darkness, not as more stars in
    // a uniformly noisy wallpaper.
    for (let index = 0; index < 3_200; index += 1) {
      const radius = 380 + Math.pow(random(), .72) * 2_050;
      const longitude = random() * Math.PI * 2;
      const latitude = Math.acos(2 * random() - 1);
      const flatten = .7 + random() * .55;
      starPositions.push(Math.sin(latitude) * Math.cos(longitude) * radius, Math.cos(latitude) * radius * flatten, Math.sin(latitude) * Math.sin(longitude) * radius);
      const tint = palette[Math.floor(random() * palette.length)].clone().lerp(new THREE.Color("#ffffff"), random() * .38);
      const intensity = .58 + random() * .42;
      starColors.push(tint.r * intensity, tint.g * intensity, tint.b * intensity);
    }
    return { positions: new Float32Array(starPositions), colors: new Float32Array(starColors) };
  }, []);
  return <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /><bufferAttribute attach="attributes-color" args={[colors, 3]} /></bufferGeometry><pointsMaterial vertexColors size={.68} sizeAttenuation transparent opacity={.34} blending={THREE.AdditiveBlending} depthWrite={false} /></points>;
}

function CinematicDepthField({ radius, count, opacity }: { radius: number; count: number; opacity: number }) {
  const { positions, colors, sizes } = useMemo(() => {
    const random = seeded(Math.round(radius * 31 + count * 17));
    const positionValues: number[] = [];
    const colorValues: number[] = [];
    const sizeValues: number[] = [];
    const palette = [new THREE.Color("#dff8ff"), new THREE.Color("#8ec9ff"), new THREE.Color("#ffe6b5")];
    for (let index = 0; index < count; index += 1) {
      const distance = radius * (.18 + Math.pow(random(), .54) * .82);
      const longitude = random() * Math.PI * 2;
      const latitude = Math.acos(2 * random() - 1);
      positionValues.push(
        Math.sin(latitude) * Math.cos(longitude) * distance,
        Math.cos(latitude) * distance,
        Math.sin(latitude) * Math.sin(longitude) * distance,
      );
      const tint = palette[Math.floor(random() * palette.length)];
      const strength = .48 + random() * .52;
      colorValues.push(tint.r * strength, tint.g * strength, tint.b * strength);
      sizeValues.push(.7 + Math.pow(random(), 4.4) * 3.8);
    }
    return {
      positions: new Float32Array(positionValues),
      colors: new Float32Array(colorValues),
      sizes: new Float32Array(sizeValues),
    };
  }, [count, radius]);
  return <points renderOrder={-2}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
    </bufferGeometry>
    <shaderMaterial
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      uniforms={{ fieldOpacity: { value: opacity } }}
      vertexShader={`
        attribute vec3 color;
        attribute float aSize;
        varying vec3 vColor;
        void main(){
          vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mvPosition;
          gl_PointSize=clamp(aSize*(82.0/max(28.0,-mvPosition.z)),1.0,5.5);
          vColor=color;
        }`}
      fragmentShader={`
        uniform float fieldOpacity;
        varying vec3 vColor;
        void main(){
          float radius=length(gl_PointCoord-.5)*2.0;
          if(radius>1.0) discard;
          float core=1.0-smoothstep(.0,.2,radius);
          float halo=pow(1.0-radius,2.8);
          gl_FragColor=vec4(mix(vColor,vec3(1.0),core*.5),(halo*.72+core*.6)*fieldOpacity);
        }`}
    />
  </points>;
}

function CinematicSpaceEnvironment({ radius, opacity = .78 }: { radius: number; opacity?: number }) {
  const panorama = useTexture(cinematicNebulaPanorama);
  panorama.colorSpace = THREE.SRGBColorSpace;
  panorama.wrapS = THREE.RepeatWrapping;
  return <mesh>
    <sphereGeometry args={[radius, 64, 32]} />
    <meshBasicMaterial map={panorama} color="#d9e8ff" transparent opacity={opacity} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
  </mesh>;
}

function GalaxyGlowField({ centers, populations, hoveredGalaxy }: { centers: Float32Array; populations: Map<number, number>; hoveredGalaxy: number | null }) {
  const { colors, sizes, kinds, seeds, activity } = useMemo(() => {
    const colorValues: number[] = [];
    const sizeValues: number[] = [];
    const kindValues: number[] = [];
    const seedValues: number[] = [];
    const activityValues: number[] = [];
    for (let galaxy = 1; galaxy <= MAX_GALAXY; galaxy += 1) {
      const liveWorlds = populations.get(galaxy) ?? 0;
      const hovered = galaxy === hoveredGalaxy;
      const tint = new THREE.Color(GALAXY_COLORS[galaxy % GALAXY_COLORS.length]);
      colorValues.push(tint.r, tint.g, tint.b);
      const visualRandom = seeded(galaxy * 6151 + 97);
      const scaleClass = Math.pow(visualRandom(), 2.15);
      const baseSize = liveWorlds > 0 ? 76 + Math.min(30, liveWorlds * 2.8) : 30 + scaleClass * 68;
      sizeValues.push(baseSize * (hovered ? 1.95 : 1));
      const kind = galaxyKindForId(galaxy);
      kindValues.push(kind === "spiral" ? 0 : kind === "barred" ? 1 : kind === "elliptical" ? 2 : kind === "lenticular" ? 3 : 4);
      seedValues.push(((galaxy * 73) % 997) / 997);
      activityValues.push(hovered ? 1.45 : liveWorlds > 0 ? 1 : .1 + visualRandom() * .2);
    }
    return {
      colors: new Float32Array(colorValues),
      sizes: new Float32Array(sizeValues),
      kinds: new Float32Array(kindValues),
      seeds: new Float32Array(seedValues),
      activity: new Float32Array(activityValues),
    };
  }, [hoveredGalaxy, populations]);
  return <points renderOrder={1}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[centers, 3]} />
      <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      <bufferAttribute attach="attributes-aKind" args={[kinds, 1]} />
      <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
      <bufferAttribute attach="attributes-aActivity" args={[activity, 1]} />
    </bufferGeometry>
    <shaderMaterial
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      vertexShader={`
        attribute vec3 color;
        attribute float aSize;
        attribute float aKind;
        attribute float aSeed;
        attribute float aActivity;
        varying vec3 vColor;
        varying float vKind;
        varying float vSeed;
        varying float vActivity;
        varying float vDepth;
        void main(){
          vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mvPosition;
          gl_PointSize=clamp(aSize*(2850.0/max(720.0,-mvPosition.z)),12.0,156.0);
          vColor=color; vKind=aKind; vSeed=aSeed; vActivity=aActivity;
          vDepth=clamp((-mvPosition.z-900.0)/4300.0,0.0,1.0);
        }`}
      fragmentShader={`
        varying vec3 vColor;
        varying float vKind;
        varying float vSeed;
        varying float vActivity;
        varying float vDepth;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){
          vec2 cell=floor(p);
          vec2 blend=fract(p);
          blend=blend*blend*(3.0-2.0*blend);
          float a=hash(cell);
          float b=hash(cell+vec2(1.0,0.0));
          float c=hash(cell+vec2(0.0,1.0));
          float d=hash(cell+vec2(1.0,1.0));
          return mix(mix(a,b,blend.x),mix(c,d,blend.x),blend.y);
        }
        void main(){
          vec2 p=(gl_PointCoord-.5)*2.0;
          float orientation=vSeed*6.28318;
          p=mat2(cos(orientation),-sin(orientation),sin(orientation),cos(orientation))*p;
          float inclination=.18+pow(fract(vSeed*7.31),.7)*.78;
          p.y/=inclination;
          float radius=length(p);
          if(radius>1.0) discard;
          float angle=atan(p.y,p.x)+vSeed*6.28318;
          float grain=.8+.2*noise(gl_PointCoord*54.0+vSeed*83.0);
          float core=exp(-radius*radius*21.0);
          float nucleus=exp(-radius*radius*72.0);
          float structure=.0;
          if(vKind<.5){
            float arms=.5+.5*cos(angle*4.0-radius*20.0);
            structure=pow(arms,8.0)*smoothstep(.98,.16,radius);
          }else if(vKind<1.5){
            float arms=.5+.5*cos(angle*2.0-radius*16.0);
            float bar=exp(-abs(p.y)*18.0)*(1.0-smoothstep(.08,.62,abs(p.x)));
            structure=max(pow(arms,8.0),bar*.86);
          }else if(vKind<2.5){
            structure=.34*(1.0-radius)+core*.45;
          }else if(vKind<3.5){
            float ring=pow(.5+.5*cos(radius*28.0),8.0);
            structure=.14+ring*.34;
          }else{
            structure=smoothstep(.48,.82,noise(p*7.0+vSeed*41.0));
          }
          float edge=1.0-smoothstep(.7,1.0,radius);
          float halo=exp(-radius*radius*2.0)*.24;
          float outerHalo=(1.0-smoothstep(.5,1.0,radius))*.07;
          float dustLane=.0;
          if(vKind<.5) dustLane=pow(.5+.5*cos(angle*4.0-radius*20.0+1.34),12.0)*smoothstep(.2,.92,radius);
          else if(vKind<1.5) dustLane=max(pow(.5+.5*cos(angle*2.0-radius*16.0+1.2),13.0),exp(-abs(p.y)*34.0)*(1.0-smoothstep(.16,.82,abs(p.x))));
          else if(vKind<3.5) dustLane=pow(.5+.5*cos(radius*31.0+vSeed*8.0),18.0)*smoothstep(.2,.9,radius);
          float distanceFade=mix(1.0,.31,vDepth);
          float laneTransmission=1.0-dustLane*(vKind<2.5?.68:.42);
          float alpha=edge*(halo+outerHalo+structure*.9+core*1.05+nucleus*.42)*(.16+vActivity*.82)*grain*distanceFade*laneTransmission;
          vec3 color=mix(vColor,vec3(1.0,.9,.72),core*.84+nucleus*.12);
          color=mix(color,vec3(.72,.84,1.0),structure*.18);
          color*=mix(.72,1.0,laneTransmission);
          gl_FragColor=vec4(color,alpha);
        }`}
    />
  </points>;
}

const UNIVERSE_SUPERCLUSTERS: ReadonlyArray<[number, number, number]> = [
  [-1540, 790, -1080], [-1030, -760, 460], [-470, 320, 1090],
  [150, -920, -360], [650, 620, 170], [1260, -270, -1010],
  [1580, 850, 750], [-1640, -920, -100], [120, 1030, -1320],
];

function universeGalaxyPosition(galaxy: number): [number, number, number] {
  const random = seeded(galaxy * 7919 + 104729);
  // A small population of field galaxies makes the gulf between clusters
  // legible without filling every part of the map.
  if (galaxy % 29 === 0) {
    return [(random() - .5) * 3_900, (random() - .5) * 2_550, (random() - .5) * 4_350];
  }
  const clusterIndex = (galaxy - 1) % UNIVERSE_SUPERCLUSTERS.length;
  const cluster = UNIVERSE_SUPERCLUSTERS[clusterIndex];
  const localIndex = Math.floor((galaxy - 1) / UNIVERSE_SUPERCLUSTERS.length);
  const normalizedIndex = (localIndex + 1) / Math.ceil(MAX_GALAXY / UNIVERSE_SUPERCLUSTERS.length);
  const filamentAngle = localIndex * 2.399963229728653 + clusterIndex * .71;
  const radial = 108 + Math.sqrt(normalizedIndex) * 585;
  const x = cluster[0] + Math.cos(filamentAngle) * radial * 1.14 + (random() - .5) * 42;
  const y = cluster[1] + Math.sin(filamentAngle * 1.73) * radial * .64 + (random() - .5) * 52;
  const z = cluster[2] + Math.sin(filamentAngle) * radial * .72 + (random() - .5) * 48;
  return [x, y, z];
}

function CosmicWebBackdrop() {
  const glow = useTexture(stellarCorona);
  glow.colorSpace = THREE.SRGBColorSpace;
  return <group renderOrder={0}>
    {UNIVERSE_SUPERCLUSTERS.map((position, index) => <sprite key={`cluster-${index}`} position={position} scale={[430 + (index % 3) * 70, 240 + (index % 2) * 45, 1]}>
      <spriteMaterial map={glow} color={GALAXY_COLORS[(index * 2) % GALAXY_COLORS.length]} transparent opacity={.025} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </sprite>)}
    {UNIVERSE_SUPERCLUSTERS.slice(0, -1).map((position, index) => <Line key={`filament-${index}`} points={[position, UNIVERSE_SUPERCLUSTERS[index + 1]]} color={index % 2 ? "#7d75b9" : "#527f9f"} transparent opacity={.018} lineWidth={.35} />)}
  </group>;
}

function FullUniverseOverview({ populations, onSelect }: { populations: Map<number, number>; onSelect: (galaxy: number) => void }) {
  const hitTargets = useRef<THREE.InstancedMesh>(null!);
  const [hoveredGalaxy, setHoveredGalaxy] = useState<number | null>(null);
  const centers = useMemo(() => {
    const centerPositions: number[] = [];
    for (let galaxy = 1; galaxy <= MAX_GALAXY; galaxy += 1) {
      centerPositions.push(...universeGalaxyPosition(galaxy));
    }
    return new Float32Array(centerPositions);
  }, []);
  useEffect(() => {
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < MAX_GALAXY; index += 1) {
      matrix.makeTranslation(centers[index * 3], centers[index * 3 + 1], centers[index * 3 + 2]);
      hitTargets.current.setMatrixAt(index, matrix);
    }
    hitTargets.current.instanceMatrix.needsUpdate = true;
  }, [centers]);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  return <group rotation={[-0.23, 0.4, -0.08]}>
    <CosmicWebBackdrop />
    <GalaxyGlowField centers={centers} populations={populations} hoveredGalaxy={hoveredGalaxy} />
    {hoveredGalaxy !== null && <Html
      center
      position={[centers[(hoveredGalaxy - 1) * 3], centers[(hoveredGalaxy - 1) * 3 + 1], centers[(hoveredGalaxy - 1) * 3 + 2]]}
      zIndexRange={[3, 0]}
      style={{ pointerEvents: "none" }}
    ><div className="universe-galaxy-hover"><span>GALAXY</span><b>{hoveredGalaxy}</b><small>{galaxyKindForId(hoveredGalaxy).toUpperCase()} · {populations.get(hoveredGalaxy) ?? 0} ON-CHAIN {(populations.get(hoveredGalaxy) ?? 0) === 1 ? "WORLD" : "WORLDS"}</small><em>CLICK TO ENTER</em></div></Html>}
    <instancedMesh
      ref={hitTargets}
      args={[undefined, undefined, MAX_GALAXY]}
      onPointerMove={(event) => {
        event.stopPropagation();
        if (typeof event.instanceId !== "number") return;
        const nextGalaxy = event.instanceId + 1;
        setHoveredGalaxy((current) => current === nextGalaxy ? current : nextGalaxy);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => { setHoveredGalaxy(null); document.body.style.cursor = ""; }}
      onClick={(event) => { event.stopPropagation(); document.body.style.cursor = ""; if (typeof event.instanceId === "number") onSelect(event.instanceId + 1); }}
    ><sphereGeometry args={[54, 10, 10]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></instancedMesh>
  </group>;
}

function GalaxyBlackHole({ galaxy, kind, color }: { galaxy: number; kind: GalaxyKind; color: string }) {
  const corona = useTexture(stellarCorona);
  corona.colorSpace = THREE.SRGBColorSpace;
  const rotation = ((galaxy * 53) % 360) * (Math.PI / 180);
  const compact = kind === "elliptical" ? 1.18 : kind === "irregular" ? .72 : .92;
  const diskColor = kind === "elliptical" ? "#ffd5a2" : color;
  return <group position={[kind === "irregular" ? 2.4 : 0, .18, kind === "irregular" ? -1.6 : 0]} rotation={[0, rotation, 0]}>
    <sprite scale={[compact * 8.5, compact * 5.2, 1]} renderOrder={0} raycast={() => null}>
      <spriteMaterial map={corona} color={diskColor} transparent opacity={kind === "elliptical" ? .22 : .14} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </sprite>
    <mesh rotation={[Math.PI / 2 + .1, 0, -.14]}>
      <ringGeometry args={[compact * 1.22, compact * 3.9, 112]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        uniforms={{ tint: { value: new THREE.Color(diskColor) }, seed: { value: (galaxy % 97) / 97 } }}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`
          uniform vec3 tint;
          uniform float seed;
          varying vec2 vUv;
          float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
          void main(){
            vec2 p=vUv-.5;
            float radius=length(p)*2.0;
            float angle=atan(p.y,p.x);
            float bands=.58+.42*sin(radius*49.0+angle*3.0+seed*18.0);
            float hot=pow(1.0-clamp(radius,0.0,1.0),2.7);
            float edge=smoothstep(.04,.2,radius)*(1.0-smoothstep(.72,1.0,radius));
            float grit=.72+hash(floor(p*180.0+seed*31.0))*.28;
            vec3 light=mix(tint,vec3(1.0,.9,.68),hot*.82);
            gl_FragColor=vec4(light,edge*(.045+hot*.31)*(.72+bands*.28)*grit);
          }`}
      />
    </mesh>
    <mesh><sphereGeometry args={[compact, 56, 56]} /><meshBasicMaterial color="#000000" /></mesh>
    <mesh scale={1.14}><sphereGeometry args={[compact, 36, 36]} /><meshBasicMaterial color={diskColor} transparent opacity={.075} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
  </group>;
}

function GalaxyNebulaCloud({ position, scale, rotation, color, opacity }: { position: [number, number, number]; scale: [number, number]; rotation: number; color: string; opacity: number }) {
  const tint = useMemo(() => new THREE.Color(color), [color]);
  return <mesh position={position} rotation={[-Math.PI / 2, 0, rotation]} scale={[scale[0], scale[1], 1]} renderOrder={-1}>
    <circleGeometry args={[1, 48]} />
    <shaderMaterial
      transparent
      depthWrite={false}
      side={THREE.DoubleSide}
      blending={THREE.AdditiveBlending}
      uniforms={{ tint: { value: tint }, cloudOpacity: { value: opacity } }}
      vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
      fragmentShader={`
        uniform vec3 tint;
        uniform float cloudOpacity;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
        float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        float fbm(vec2 p){ float v=0.0; float a=.5; for(int i=0;i<5;i++){ v+=noise(p)*a; p=p*2.03+vec2(3.7,8.1); a*=.5; } return v; }
        void main(){
          vec2 p=(vUv-.5)*2.0;
          float radial=1.0-smoothstep(.2,1.0,length(p));
          float structure=smoothstep(.34,.78,fbm(p*3.1+vec2(2.4,-1.8)));
          float filaments=smoothstep(.46,.76,fbm(p*7.4-vec2(4.1,2.7)));
          float alpha=radial*(structure*.72+filaments*.28)*cloudOpacity;
          gl_FragColor=vec4(tint,alpha);
        }`}
    />
  </mesh>;
}

function GalaxyDiskHaze({ galaxy, kind, color }: { galaxy: number; kind: GalaxyKind; color: string }) {
  const tint = useMemo(() => new THREE.Color(color), [color]);
  const kindCode = galaxyKindForId(galaxy) === "spiral" ? 0 : kind === "barred" ? 1 : kind === "elliptical" ? 2 : kind === "lenticular" ? 3 : 4;
  const twist = ((galaxy * 37) % 360) * (Math.PI / 180);
  return <mesh position={[0, -1.08, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[58, 58, 1]} renderOrder={-3}>
    <circleGeometry args={[1, 96]} />
    <shaderMaterial
      transparent
      depthWrite={false}
      side={THREE.DoubleSide}
      blending={THREE.AdditiveBlending}
      uniforms={{ tint: { value: tint }, morphology: { value: kindCode }, seedAngle: { value: twist } }}
      vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
      fragmentShader={`
        uniform vec3 tint;
        uniform float morphology;
        uniform float seedAngle;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(41.13,289.71)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        float fbm(vec2 p){ float value=0.0; float amp=.5; for(int i=0;i<4;i++){ value+=noise(p)*amp; p=p*2.07+vec2(2.7,5.9); amp*=.5; } return value; }
        void main(){
          vec2 p=(vUv-.5)*2.0;
          p.y/=.82;
          float radius=length(p);
          float angle=atan(p.y,p.x);
          float edge=1.0-smoothstep(.68,1.0,radius);
          float grain=.62+fbm(p*8.0)*.55;
          float core=exp(-radius*radius*12.0);
          float structure=0.0;
          if(morphology<.5){
            float arms=.5+.5*cos(angle*4.0-radius*21.0+seedAngle*4.0);
            structure=.038+pow(arms,7.0)*.22+core*.16;
          }else if(morphology<1.5){
            float arms=.5+.5*cos(angle*2.0-radius*17.0+seedAngle*2.0);
            float bar=exp(-abs(p.y*cos(seedAngle)-p.x*sin(seedAngle))*16.0)*(1.0-smoothstep(.08,.42,radius));
            structure=.034+pow(arms,7.0)*.21+bar*.23+core*.15;
          }else if(morphology<2.5){
            structure=.085*(1.0-radius)+core*.21;
          }else if(morphology<3.5){
            float rings=.5+.5*cos(radius*42.0);
            structure=.046+rings*rings*.052+core*.19;
          }else{
            float clumps=smoothstep(.53,.79,fbm(p*3.3+vec2(seedAngle*2.0,-seedAngle)));
            structure=.018+clumps*.24+core*.1;
          }
          vec3 warm=mix(tint,vec3(1.0,.72,.42),core*.7);
          gl_FragColor=vec4(warm,min(.34,structure*edge*grain*1.28));
        }`}
    />
  </mesh>;
}

function GalaxyEnvironment({ galaxy }: { galaxy: number }) {
  const kind = galaxyKindForId(galaxy);
  const tint = GALAXY_COLORS[galaxy % GALAXY_COLORS.length];
  const corona = useTexture(stellarCorona);
  corona.colorSpace = THREE.SRGBColorSpace;
  const { nebulae, gasPositions, gasColors, nurseryPositions, nurseryColors, nurserySizes, dustPositions, dustSizes, dustLanes, barLane } = useMemo(() => {
    const random = seeded(galaxy * 22_801 + 313);
    const cloudPalette = ["#6abfff", "#9f7cff", "#e46fae", "#56cbb8", "#d59b66"];
    const cloudCount = kind === "elliptical" ? 4 : kind === "lenticular" ? 6 : kind === "irregular" ? 13 : 10;
    const clouds = Array.from({ length: cloudCount }, (_, index) => {
      const anchor = galaxySystemLayout(galaxy, 1 + Math.floor(random() * SYSTEMS_PER_GALAXY)).position;
      const spread = kind === "elliptical" ? 8 : kind === "irregular" ? 11 : 14;
      return {
        position: [anchor[0] + (random() - .5) * spread, -.7 + (random() - .5) * 1.2, anchor[2] + (random() - .5) * spread] as [number, number, number],
        scale: [(kind === "irregular" ? 8 : 11) + random() * 13, 4 + random() * 8] as [number, number],
        rotation: random() * Math.PI,
        color: cloudPalette[(index + galaxy) % cloudPalette.length],
        opacity: (kind === "elliptical" ? .034 : .048) + random() * .04,
      };
    });
    const gas: number[] = [];
    const colors: number[] = [];
    for (let index = 0; index < 1800; index += 1) {
      const layout = galaxySystemLayout(galaxy, 1 + (index * 47) % SYSTEMS_PER_GALAXY);
      const position = layout.position;
      gas.push(position[0] + (random() - .5) * 5.5, position[1] * .55 + (random() - .5) * 1.4, position[2] + (random() - .5) * 5.5);
      const base = new THREE.Color(index % 7 < 2 ? "#79bfff" : index % 11 < 2 ? "#d878ae" : tint).lerp(new THREE.Color("#dceeff"), random() * .18);
      const strength = .28 + random() * .48;
      colors.push(base.r * strength, base.g * strength, base.b * strength);
    }
    const nurseries: number[] = [];
    const nurseryTints: number[] = [];
    const nurseryPointSizes: number[] = [];
    const nurseryPalette = [new THREE.Color("#79d6ff"), new THREE.Color("#bb8cff"), new THREE.Color("#ff7fb8"), new THREE.Color("#ecf8ff")];
    const nurseryAnchors = kind === "elliptical" ? 5 : kind === "lenticular" ? 8 : kind === "irregular" ? 17 : 14;
    for (let cluster = 0; cluster < nurseryAnchors; cluster += 1) {
      const anchor = galaxySystemLayout(galaxy, 1 + Math.floor(random() * SYSTEMS_PER_GALAXY)).position;
      const particles = kind === "elliptical" ? 12 : 24 + Math.floor(random() * 18);
      const clusterTint = nurseryPalette[(cluster + galaxy) % nurseryPalette.length];
      for (let particle = 0; particle < particles; particle += 1) {
        const radius = Math.pow(random(), 1.7) * (1.3 + random() * 2.8);
        const angle = random() * Math.PI * 2;
        nurseries.push(anchor[0] + Math.cos(angle) * radius, -.12 + (random() - .5) * 2.2, anchor[2] + Math.sin(angle) * radius * .72);
        const brightness = .56 + random() * .44;
        nurseryTints.push(clusterTint.r * brightness, clusterTint.g * brightness, clusterTint.b * brightness);
        nurseryPointSizes.push(5 + random() * 11 + (particle === 0 ? 9 : 0));
      }
    }
    const dust: number[] = [];
    const dustPointSizes: number[] = [];
    const dustCount = kind === "elliptical" ? 280 : kind === "irregular" ? 760 : 980;
    for (let index = 0; index < dustCount; index += 1) {
      const layout = galaxySystemLayout(galaxy, 1 + (index * 71) % SYSTEMS_PER_GALAXY).position;
      dust.push(layout[0] + (random() - .5) * 7.5, .18 + (random() - .5) * 1.35, layout[2] + (random() - .5) * 4.2);
      dustPointSizes.push(9 + random() * 23);
    }
    const lanes: Array<Array<[number, number, number]>> = [];
    const armCount = kind === "barred" ? 2 : kind === "spiral" ? 4 : 0;
    const twist = ((galaxy * 37) % 360) * (Math.PI / 180);
    for (let arm = 0; arm < armCount; arm += 1) {
      const points: Array<[number, number, number]> = [];
      for (let step = 0; step <= 72; step += 1) {
        const radius = 8 + step / 72 * 47;
        const angle = twist + arm * (Math.PI * 2 / armCount) + radius * (kind === "barred" ? .118 : .145) + .055;
        points.push([Math.cos(angle) * radius, .06, Math.sin(angle) * radius * .82]);
      }
      lanes.push(points);
    }
    const bar = kind === "barred" ? Array.from({ length: 25 }, (_, index): [number, number, number] => {
      const distance = -18 + index * 1.5;
      return [Math.cos(twist) * distance, .08, Math.sin(twist) * distance * .72];
    }) : null;
    return {
      nebulae: clouds,
      gasPositions: new Float32Array(gas),
      gasColors: new Float32Array(colors),
      nurseryPositions: new Float32Array(nurseries),
      nurseryColors: new Float32Array(nurseryTints),
      nurserySizes: new Float32Array(nurseryPointSizes),
      dustPositions: new Float32Array(dust),
      dustSizes: new Float32Array(dustPointSizes),
      dustLanes: lanes,
      barLane: bar,
    };
  }, [galaxy, kind, tint]);
  return <group>
    <GalaxyDiskHaze galaxy={galaxy} kind={kind} color={tint} />
    <sprite position={[0, -.8, 0]} scale={[kind === "elliptical" ? 34 : 26, kind === "elliptical" ? 24 : 18, 1]} renderOrder={-2}><spriteMaterial map={corona} color={kind === "elliptical" ? "#f4cfa6" : "#e7c5a0"} transparent opacity={kind === "elliptical" ? .18 : .105} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
    {nebulae.map((cloud, index) => <GalaxyNebulaCloud key={index} {...cloud} />)}
    <points renderOrder={-1}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[gasPositions, 3]} /><bufferAttribute attach="attributes-color" args={[gasColors, 3]} /></bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{ gasOpacity: { value: kind === "elliptical" ? .17 : .25 } }}
        vertexShader={`
          attribute vec3 color;
          varying vec3 vColor;
          void main(){
            vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
            gl_Position=projectionMatrix*mvPosition;
            gl_PointSize=clamp(68.0/max(32.0,-mvPosition.z),1.0,3.2);
            vColor=color;
          }`}
        fragmentShader={`
          uniform float gasOpacity;
          varying vec3 vColor;
          void main(){
            float radius=length(gl_PointCoord-.5)*2.0;
            if(radius>1.0) discard;
            gl_FragColor=vec4(vColor,pow(1.0-radius,1.7)*gasOpacity);
          }`}
      />
    </points>
    <points renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[nurseryPositions, 3]} />
        <bufferAttribute attach="attributes-color" args={[nurseryColors, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[nurserySizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={`
          attribute vec3 color;
          attribute float aSize;
          varying vec3 vColor;
          void main(){
            vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
            gl_Position=projectionMatrix*mvPosition;
            gl_PointSize=clamp(aSize*(88.0/max(40.0,-mvPosition.z)),2.2,19.0);
            vColor=color;
          }`}
        fragmentShader={`
          varying vec3 vColor;
          void main(){
            float radius=length(gl_PointCoord-.5)*2.0;
            if(radius>1.0) discard;
            float core=1.0-smoothstep(.0,.18,radius);
            float halo=pow(1.0-radius,2.4);
            gl_FragColor=vec4(mix(vColor,vec3(1.0),core*.72),halo*.68+core*.54);
          }`}
      />
    </points>
    <points renderOrder={0}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[dustPositions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[dustSizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        vertexShader={`
          attribute float aSize;
          void main(){
            vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
            gl_Position=projectionMatrix*mvPosition;
            gl_PointSize=clamp(aSize*(72.0/max(40.0,-mvPosition.z)),2.0,16.0);
          }`}
        fragmentShader={`
          void main(){
            float radius=length(gl_PointCoord-.5)*2.0;
            if(radius>1.0) discard;
            gl_FragColor=vec4(.002,.006,.014,pow(1.0-radius,2.2)*.16);
          }`}
      />
    </points>
    {dustLanes.map((points, index) => <Line key={index} points={points} color="#030711" transparent opacity={.24} lineWidth={1.55} depthWrite={false} />)}
    {barLane && <Line points={barLane} color="#030711" transparent opacity={.25} lineWidth={2.1} depthWrite={false} />}
  </group>;
}

function StellarSurface({ radius, color, seed }: { radius: number; color: string; seed: number }) {
  const material = useRef<THREE.ShaderMaterial>(null!);
  const stellarColor = useMemo(() => new THREE.Color(color), [color]);
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.time.value = clock.getElapsedTime();
  });
  return <group>
    <mesh>
      <sphereGeometry args={[radius, 80, 80]} />
      <shaderMaterial
        ref={material}
        toneMapped={false}
        uniforms={{ time: { value: 0 }, starColor: { value: stellarColor }, stellarSeed: { value: (seed % 997) / 997 } }}
        vertexShader={`varying vec3 vNormal; varying vec3 vPosition; void main(){ vNormal=normalize(normalMatrix*normal); vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`
          uniform float time;
          uniform float stellarSeed;
          uniform vec3 starColor;
          varying vec3 vNormal;
          varying vec3 vPosition;
          float hash(vec3 p){ p=fract(p*.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
          float noise(vec3 p){
            vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
          }
          float fbm(vec3 p){ float value=0.0; float amplitude=.5; for(int i=0;i<5;i++){ value+=noise(p)*amplitude; p=p*2.03+vec3(7.1,3.4,5.8); amplitude*=.5; } return value; }
          void main(){
            vec3 p=normalize(vPosition);
            vec3 identity=vec3(stellarSeed*19.7,stellarSeed*7.3,-stellarSeed*13.1);
            vec3 drift=vec3(time*.014,time*.006,-time*.011);
            float convection=fbm(p*(4.6+stellarSeed*1.8)+drift+identity);
            float granules=fbm(p*(17.0+stellarSeed*5.0)-drift*2.0+identity*1.7);
            float filaments=fbm(p*(8.2+stellarSeed*3.1)+vec3(convection*1.8)-drift-identity*.4);
            float hot=clamp(.24+convection*.58+granules*.24+filaments*.13,0.0,1.0);
            float spot=smoothstep(.70+stellarSeed*.07,.86,fbm(p*(2.8+stellarSeed*1.4)+identity+vec3(-time*.003,time*.002,0.0)));
            float facing=clamp(abs(vNormal.z),0.0,1.0);
            float limb=.48+.52*pow(facing,.42);
            vec3 hotColor=mix(starColor,vec3(1.0,.96,.84),.18+hot*.2);
            vec3 coolColor=starColor*.38;
            vec3 surface=mix(coolColor,hotColor,.24+hot*.76);
            surface*=.82+granules*.32;
            surface=mix(surface,starColor*.16,spot*.68)*limb;
            float edge=pow(1.0-facing,2.4);
            surface+=starColor*edge*.2;
            gl_FragColor=vec4(surface,1.0);
          }`}
      />
    </mesh>
    <mesh scale={1.045}>
      <sphereGeometry args={[radius, 64, 64]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        uniforms={{ glowColor: { value: stellarColor } }}
        vertexShader={`varying vec3 vNormal; void main(){ vNormal=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`uniform vec3 glowColor; varying vec3 vNormal; void main(){ float edge=pow(1.0-abs(vNormal.z),2.4); gl_FragColor=vec4(glowColor,edge*.16); }`}
      />
    </mesh>
  </group>;
}

function SystemDustField({ seed }: { seed: number }) {
  const { positions, colors } = useMemo(() => {
    const random = seeded(seed * 6151 + 73);
    const points: number[] = [];
    const tints: number[] = [];
    const warm = new THREE.Color("#c9985d");
    const cool = new THREE.Color("#5f87a6");
    for (let index = 0; index < 2400; index += 1) {
      const belt = index % 3;
      const radius = 15 + belt * 7 + (random() - .5) * (belt === 1 ? 4.5 : 2.4);
      const angle = random() * Math.PI * 2;
      const inclination = (belt - 1) * .035;
      points.push(Math.cos(angle) * radius, (random() - .5) * (1.2 + belt * .4) + Math.sin(angle) * radius * inclination, Math.sin(angle) * radius * .82);
      const tint = cool.clone().lerp(warm, random() * .7);
      const intensity = .35 + random() * .65;
      tints.push(tint.r * intensity, tint.g * intensity, tint.b * intensity);
    }
    return { positions: new Float32Array(points), colors: new Float32Array(tints) };
  }, [seed]);
  return <group rotation={[.035, 0, -.025]}><points><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /><bufferAttribute attach="attributes-color" args={[colors, 3]} /></bufferGeometry><pointsMaterial vertexColors size={.075} sizeAttenuation transparent opacity={.82} blending={THREE.AdditiveBlending} depthWrite={false} /></points></group>;
}

function SystemDebrisBelt({ seed }: { seed: number }) {
  const rocks = useRef<THREE.InstancedMesh>(null!);
  const transforms = useMemo(() => {
    const random = seeded(seed * 9173 + 211);
    return Array.from({ length: 180 }, (_, index) => {
      const angle = random() * Math.PI * 2;
      const radius = 23.2 + (random() - .5) * 3.1;
      return {
        position: new THREE.Vector3(Math.cos(angle) * radius, (random() - .5) * 1.05, Math.sin(angle) * radius * .78),
        rotation: new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI),
        scale: .045 + random() * (index % 17 === 0 ? .24 : .11),
        color: new THREE.Color(index % 9 === 0 ? "#8b7058" : index % 5 === 0 ? "#4f6976" : "#344550"),
      };
    });
  }, [seed]);
  useEffect(() => {
    if (!rocks.current) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    transforms.forEach((item, index) => {
      quaternion.setFromEuler(item.rotation);
      scale.setScalar(item.scale);
      matrix.compose(item.position, quaternion, scale);
      rocks.current.setMatrixAt(index, matrix);
      rocks.current.setColorAt(index, item.color);
    });
    rocks.current.instanceMatrix.needsUpdate = true;
    if (rocks.current.instanceColor) rocks.current.instanceColor.needsUpdate = true;
  }, [transforms]);
  return <group rotation={[.035, 0, -.025]}>
    <instancedMesh ref={rocks} args={[undefined, undefined, transforms.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial vertexColors color="#71808a" roughness={.94} metalness={.08} />
    </instancedMesh>
  </group>;
}

function SystemEclipticPlane({ color, seed }: { color: string; seed: number }) {
  const tint = useMemo(() => new THREE.Color(color).lerp(new THREE.Color("#5597c4"), .54), [color]);
  return <mesh rotation={[-Math.PI / 2, 0, (seed % 17) * .025]} position={[0, -.46, 0]} renderOrder={-2}>
    <circleGeometry args={[38, 128]} />
    <shaderMaterial
      transparent
      depthWrite={false}
      side={THREE.DoubleSide}
      blending={THREE.AdditiveBlending}
      uniforms={{ tint: { value: tint } }}
      vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
      fragmentShader={`uniform vec3 tint; varying vec2 vUv; void main(){ vec2 p=vUv-.5; float r=length(p)*2.0; float spokes=.5+.5*sin(atan(p.y,p.x)*18.0+r*34.0); float dust=(1.0-smoothstep(.08,1.0,r))*smoothstep(.03,.16,r); float bands=pow(.5+.5*sin(r*96.0),13.0); float alpha=dust*(.018+spokes*.012+bands*.028); gl_FragColor=vec4(tint,alpha); }`}
    />
  </mesh>;
}

function StellarLightVolume({ scale, color }: { scale: number; color: string }) {
  const flare = useRef<THREE.Group>(null!);
  const flareTexture = useTexture(stellarCorona);
  flareTexture.colorSpace = THREE.SRGBColorSpace;
  useFrame(({ camera }) => {
    if (!flare.current) return;
    flare.current.quaternion.copy(camera.quaternion);
  });
  return <group ref={flare} renderOrder={4}>
    <sprite scale={[scale * 4.3, scale * .2, 1]}><spriteMaterial map={flareTexture} color={color} transparent opacity={.19} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
    <sprite scale={[scale * 2.15, scale * .07, 1]} rotation={[0, 0, Math.PI / 2]}><spriteMaterial map={flareTexture} color="#dff5ff" transparent opacity={.1} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
  </group>;
}

function StellarCoronaShell({ radius, color, seed }: { radius: number; color: string; seed: number }) {
  const material = useRef<THREE.ShaderMaterial>(null!);
  const stellarColor = useMemo(() => new THREE.Color(color), [color]);
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.time.value = clock.getElapsedTime();
  });
  return <mesh scale={1.2} renderOrder={3}>
    <sphereGeometry args={[radius, 64, 64]} />
    <shaderMaterial
      ref={material}
      transparent
      depthWrite={false}
      side={THREE.BackSide}
      blending={THREE.AdditiveBlending}
      toneMapped={false}
      uniforms={{ time: { value: 0 }, coronaColor: { value: stellarColor }, seed: { value: (seed % 997) / 997 } }}
      vertexShader={`
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        varying vec3 vLocalPosition;
        void main(){
          vLocalPosition=position;
          vWorldNormal=normalize(mat3(modelMatrix)*normal);
          vec4 worldPosition=modelMatrix*vec4(position,1.0);
          vWorldPosition=worldPosition.xyz;
          gl_Position=projectionMatrix*viewMatrix*worldPosition;
        }`}
      fragmentShader={`
        uniform float time;
        uniform float seed;
        uniform vec3 coronaColor;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        varying vec3 vLocalPosition;
        float hash(vec3 p){ p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
        float noise(vec3 p){
          vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }
        void main(){
          vec3 viewDirection=normalize(cameraPosition-vWorldPosition);
          float rim=pow(1.0-max(0.0,dot(normalize(vWorldNormal),viewDirection)),2.1);
          vec3 p=normalize(vLocalPosition)*6.2+vec3(seed*17.0,time*.018,-time*.011);
          float turbulence=noise(p)*.58+noise(p*2.17+4.1)*.28+noise(p*4.03-2.7)*.14;
          float plume=smoothstep(.59,.91,turbulence+rim*.1);
          float alpha=rim*plume*.085;
          gl_FragColor=vec4(mix(coronaColor,vec3(1.0),plume*.12),alpha);
        }`}
    />
  </mesh>;
}

function SystemSolarWind({ seed, radius, color }: { seed: number; radius: number; color: string }) {
  const { positions, colors, sizes } = useMemo(() => {
    const random = seeded(seed * 1297 + 311);
    const positionValues: number[] = [];
    const colorValues: number[] = [];
    const sizeValues: number[] = [];
    const base = new THREE.Color(color);
    for (let index = 0; index < 460; index += 1) {
      const distance = radius * (1.55 + Math.pow(random(), 1.8) * 5.6);
      const longitude = random() * Math.PI * 2;
      const latitude = Math.acos(2 * random() - 1);
      positionValues.push(
        Math.sin(latitude) * Math.cos(longitude) * distance,
        Math.cos(latitude) * distance,
        Math.sin(latitude) * Math.sin(longitude) * distance,
      );
      const intensity = .3 + random() * .7;
      const tint = base.clone().lerp(new THREE.Color("#ffffff"), random() * .24);
      colorValues.push(tint.r * intensity, tint.g * intensity, tint.b * intensity);
      sizeValues.push(.65 + Math.pow(random(), 3.2) * 2.4);
    }
    return { positions: new Float32Array(positionValues), colors: new Float32Array(colorValues), sizes: new Float32Array(sizeValues) };
  }, [color, radius, seed]);
  return <points renderOrder={2}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
    </bufferGeometry>
    <shaderMaterial
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      uniforms={{ opacity: { value: .24 } }}
      vertexShader={`
        attribute vec3 color;
        attribute float aSize;
        varying vec3 vColor;
        void main(){
          vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mvPosition;
          gl_PointSize=clamp(aSize*(32.0/max(8.0,-mvPosition.z)),.65,3.0);
          vColor=color;
        }`}
      fragmentShader={`
        uniform float opacity;
        varying vec3 vColor;
        void main(){
          float d=length(gl_PointCoord-.5)*2.0;
          if(d>1.0) discard;
          float glow=pow(1.0-d,2.4);
          gl_FragColor=vec4(vColor,glow*opacity);
        }`}
    />
  </points>;
}

function SystemNebulaDepth({ seed, color }: { seed: number; color: string }) {
  const texture = useTexture(galaxyStellarFlare);
  texture.colorSpace = THREE.SRGBColorSpace;
  const clouds = useMemo(() => {
    const random = seeded(seed * 3571 + 83);
    const base = new THREE.Color(color);
    return Array.from({ length: 5 }, (_, index) => {
      const angle = random() * Math.PI * 2;
      const distance = 128 + random() * 118;
      const width = 54 + random() * 72;
      return {
        position: [Math.cos(angle) * distance, (random() - .5) * 92, Math.sin(angle) * distance] as [number, number, number],
        scale: [width, width * (.24 + random() * .22), 1] as [number, number, number],
        rotation: random() * Math.PI,
        opacity: .025 + random() * .045,
        tint: `#${base.clone().lerp(new THREE.Color(index % 2 ? "#6e8fc8" : "#8d5b92"), .64).getHexString()}`,
      };
    });
  }, [color, seed]);
  return <group renderOrder={-1}>{clouds.map((cloud, index) => <sprite key={index} position={cloud.position} scale={cloud.scale} rotation={[0, 0, cloud.rotation]}>
    <spriteMaterial map={texture} color={cloud.tint} transparent opacity={cloud.opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
  </sprite>)}</group>;
}

function StellarProminences({ radius, color, seed }: { radius: number; color: string; seed: number }) {
  const texture = useTexture(stellarCorona);
  texture.colorSpace = THREE.SRGBColorSpace;
  const prominences = useMemo(() => {
    const random = seeded(seed * 5107 + 197);
    return Array.from({ length: 5 }, (_, index) => {
      const angle = random() * Math.PI * 2;
      const latitude = (random() - .5) * .8;
      const distance = radius * (1.02 + random() * .09);
      return {
        position: [Math.cos(angle) * Math.cos(latitude) * distance, Math.sin(latitude) * distance, Math.sin(angle) * Math.cos(latitude) * distance] as [number, number, number],
        scale: [radius * (.42 + random() * .34), radius * (.12 + random() * .13), 1] as [number, number, number],
        rotation: angle + index * .37,
        opacity: .045 + random() * .055,
      };
    });
  }, [radius, seed]);
  return <group renderOrder={4}>{prominences.map((prominence, index) => <sprite key={index} position={prominence.position} scale={prominence.scale} rotation={[0, 0, prominence.rotation]} raycast={() => null}>
    <spriteMaterial map={texture} color={color} transparent opacity={prominence.opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
  </sprite>)}</group>;
}

function StellarAccretionFlow({ radius, color, seed }: { radius: number; color: string; seed: number }) {
  const material = useRef<THREE.ShaderMaterial>(null!);
  const tint = useMemo(() => new THREE.Color(color).lerp(new THREE.Color("#ffd49b"), .42), [color]);
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.time.value = clock.getElapsedTime();
  });
  return <group rotation={[Math.PI / 2.18, .16 + (seed % 17) * .018, 0]} renderOrder={4}>
    <mesh>
      <ringGeometry args={[radius * 1.34, radius * 2.82, 160, 8]} />
      <shaderMaterial
        ref={material}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        uniforms={{ time: { value: 0 }, tint: { value: tint }, seed: { value: (seed % 997) / 997 } }}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`
          uniform float time; uniform float seed; uniform vec3 tint; varying vec2 vUv;
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          void main(){
            vec2 p=vUv-.5; float r=length(p)*2.0; float a=atan(p.y,p.x);
            float spiral=.5+.5*sin(a*5.0-r*28.0-time*.18-seed*12.0);
            float bands=pow(.5+.5*sin(r*48.0+a*2.0),8.0);
            float grain=.72+.28*hash(floor(vUv*96.0)+seed*37.0);
            float edge=smoothstep(.14,.34,r)*(1.0-smoothstep(.78,1.0,r));
            float alpha=edge*(.032+spiral*.082+bands*.052)*grain;
            vec3 heated=mix(vec3(1.0,.42,.16),tint,smoothstep(.2,.88,r));
            gl_FragColor=vec4(heated,alpha);
          }`}
      />
    </mesh>
  </group>;
}

function RelativisticJets({ radius, color, magnetar }: { radius: number; color: string; magnetar: boolean }) {
  const length = radius * (magnetar ? 9.2 : 7.4);
  const tint = useMemo(() => new THREE.Color(color).lerp(new THREE.Color("#ffffff"), .28), [color]);
  const jetMaterial = <shaderMaterial
    transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false}
        uniforms={{ tint: { value: tint }, strength: { value: magnetar ? .15 : .18 } }}
    vertexShader={`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
    fragmentShader={`uniform vec3 tint;uniform float strength;varying vec2 vUv;void main(){float axis=1.0-smoothstep(.08,.5,abs(vUv.x-.5));float fade=sin(vUv.y*3.14159);gl_FragColor=vec4(tint,axis*fade*strength);}`}
  />;
  return <group rotation={[0, 0, Math.PI / 7]} renderOrder={5}>
    <mesh position={[0, length / 2 + radius * .72, 0]}><coneGeometry args={[radius * .075, length, 28, 1, true]} />{jetMaterial}</mesh>
    <mesh position={[0, -length / 2 - radius * .72, 0]} rotation={[0, 0, Math.PI]}><coneGeometry args={[radius * .075, length, 28, 1, true]} />{jetMaterial}</mesh>
    {[1.7, 2.45].map((scale, index) => <mesh key={scale} scale={scale}><sphereGeometry args={[radius, 32, 32]} /><meshBasicMaterial color={color} transparent opacity={index ? .018 : .035} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>)}
  </group>;
}

function HeroStar({ star, seed }: { star: StarDefinition; seed: number }) {
  const starTexture = useTexture(stellarCorona);
  starTexture.colorSpace = THREE.SRGBColorSpace;
  const systemRadius = systemStarSurfaceRadius(star);
  const surfaceRadius = star.binary ? systemRadius * .52 : systemRadius;
  const members = star.binary ? [[-systemRadius * .54, 0, 0], [systemRadius * .54, systemRadius * .06, 0]] as const : [[0, 0, 0]] as const;
  return <group>{members.map((position, index) => <group key={index} position={position}>
    <StellarSurface radius={surfaceRadius} color={index === 1 ? "#b7dfff" : star.color} seed={seed + index * 31} />
    <StellarCoronaShell radius={surfaceRadius} color={index === 1 ? "#b7dfff" : star.color} seed={seed + index * 31} />
    <StellarProminences radius={surfaceRadius} color={index === 1 ? "#b7dfff" : star.color} seed={seed + index * 43} />
    <sprite scale={[surfaceRadius * 2.65, surfaceRadius * 2.65, 1]}><spriteMaterial map={starTexture} color={index === 1 ? "#b7dfff" : star.color} transparent opacity={.24} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
  </group>)}
    <StellarLightVolume scale={systemRadius * 1.18} color={star.color} />
    <SystemSolarWind seed={seed} radius={systemRadius} color={star.color} />
    {star.phenomenon === "wolf-rayet" && <mesh scale={1.24}><sphereGeometry args={[surfaceRadius, 48, 48]} /><meshBasicMaterial color={star.color} transparent opacity={.075} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>}
    {(star.phenomenon === "pulsar" || star.phenomenon === "magnetar") && <><StellarAccretionFlow radius={surfaceRadius} color={star.color} seed={seed} /><RelativisticJets radius={systemRadius} color={star.color} magnetar={star.phenomenon === "magnetar"} /></>}
    {star.remnant && <><StellarAccretionFlow radius={surfaceRadius * 1.2} color={star.color} seed={seed} /><mesh scale={1.34}><sphereGeometry args={[surfaceRadius, 48, 48]} /><meshBasicMaterial color={star.color} transparent opacity={.045} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh></>}
    <pointLight intensity={16 * star.scale} color={star.color} distance={260} decay={1.7} />
  </group>;
}

function AtmosphereShell({ radius, color }: { radius: number; color: string }) {
  const atmosphereColor = useMemo(() => new THREE.Color(color), [color]);
  return <mesh scale={1.045} renderOrder={2}>
    <sphereGeometry args={[radius, 64, 64]} />
    <shaderMaterial
      transparent
      depthWrite={false}
      side={THREE.FrontSide}
      blending={THREE.AdditiveBlending}
      toneMapped={false}
      uniforms={{ glowColor: { value: atmosphereColor } }}
      vertexShader={`
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main(){
          vWorldNormal=normalize(mat3(modelMatrix)*normal);
          vec4 worldPosition=modelMatrix*vec4(position,1.0);
          vWorldPosition=worldPosition.xyz;
          gl_Position=projectionMatrix*viewMatrix*worldPosition;
        }`}
      fragmentShader={`
        uniform vec3 glowColor;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main(){
          vec3 normal=normalize(vWorldNormal);
          vec3 viewDirection=normalize(cameraPosition-vWorldPosition);
          vec3 starDirection=normalize(-vWorldPosition);
          float rim=pow(1.0-max(0.0,dot(normal,viewDirection)),2.75);
          float daylight=smoothstep(-.16,.52,dot(normal,starDirection));
          float forwardScatter=pow(max(0.0,dot(viewDirection,-starDirection)),7.0)*daylight;
          float alpha=rim*(.035+daylight*.22)+forwardScatter*.045;
          vec3 tint=mix(glowColor,vec3(.78,.92,1.0),forwardScatter*.48);
          gl_FragColor=vec4(tint,alpha);
        }`}
    />
  </mesh>;
}

function GalaxyMapStellarSurface({ radius, color }: { radius: number; color: string }) {
  const stellarColor = useMemo(() => new THREE.Color(color), [color]);
  return <group>
    <mesh>
      <sphereGeometry args={[radius, 20, 20]} />
      <shaderMaterial
        toneMapped={false}
        uniforms={{ starColor: { value: stellarColor } }}
        vertexShader={`varying vec3 vNormal; varying vec3 vPosition; void main(){ vNormal=normalize(normalMatrix*normal); vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`
          uniform vec3 starColor;
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main(){
            vec3 p=normalize(vPosition);
            float cells=.5+.5*sin(p.x*23.0+sin(p.y*17.0))*sin(p.z*21.0-p.y*9.0);
            float bands=.5+.5*sin((p.x+p.z)*13.0+p.y*22.0);
            float facing=clamp(abs(vNormal.z),0.0,1.0);
            float limb=.42+.58*pow(facing,.38);
            float hotCell=smoothstep(.68,.94,cells*.72+bands*.38);
            vec3 hotColor=mix(starColor,vec3(1.0,.98,.9),.32+cells*.24);
            vec3 surface=mix(starColor*.31,hotColor,.61+bands*.2)*limb;
            surface=mix(surface,vec3(1.0,.98,.9),hotCell*.42);
            surface+=starColor*pow(1.0-facing,2.15)*.24;
            gl_FragColor=vec4(surface,1.0);
          }`}
      />
    </mesh>
    <mesh scale={1.08}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={.11} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>;
}

function GalaxyStarField({ systems }: { systems: GalaxySystem[] }) {
  const { positions, colors, sizes, luminosity } = useMemo(() => {
    const pointPositions: number[] = [];
    const pointColors: number[] = [];
    const pointSizes: number[] = [];
    const pointLuminosity: number[] = [];
    systems.forEach((system) => {
      pointPositions.push(...system.position);
      const tint = new THREE.Color(system.star.color);
      pointColors.push(tint.r, tint.g, tint.b);
      const relativeScale = THREE.MathUtils.clamp((heroStarScale(system.star) - 3.1) / 2.4, 0, 1);
      pointSizes.push(9.5 + relativeScale * 11.5 + (system.occupied ? 7 : 0) + (system.star.binary ? 2.8 : 0));
      pointLuminosity.push(system.occupied ? 1 : system.star.remnant ? .66 : .16 + relativeScale * .25);
    });
    return {
      positions: new Float32Array(pointPositions),
      colors: new Float32Array(pointColors),
      sizes: new Float32Array(pointSizes),
      luminosity: new Float32Array(pointLuminosity),
    };
  }, [systems]);
  return <points renderOrder={2}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      <bufferAttribute attach="attributes-aLuminosity" args={[luminosity, 1]} />
    </bufferGeometry>
    <shaderMaterial
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      vertexShader={`
        attribute vec3 color;
        attribute float aSize;
        attribute float aLuminosity;
        varying vec3 vColor;
        varying float vLuminosity;
        void main(){
          vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mvPosition;
          gl_PointSize=clamp(aSize*(142.0/max(50.0,-mvPosition.z)),5.5,38.0);
          vColor=color; vLuminosity=aLuminosity;
        }`}
      fragmentShader={`
        varying vec3 vColor;
        varying float vLuminosity;
        void main(){
          vec2 p=gl_PointCoord-.5;
          float radius=length(p)*2.0;
          if(radius>1.0) discard;
          float core=1.0-smoothstep(.0,.24,radius);
          float corona=pow(1.0-radius,1.82);
          float photosphere=1.0-smoothstep(.12,.42,radius);
          float diffraction=(1.0-smoothstep(.0,.055,abs(p.x)))*(1.0-smoothstep(.16,.5,abs(p.y)))
            +(1.0-smoothstep(.0,.055,abs(p.y)))*(1.0-smoothstep(.16,.5,abs(p.x)));
          float alpha=(corona*.68+photosphere*.48+core+diffraction*.16)*(.46+vLuminosity*.7);
          vec3 star=mix(vColor,vec3(1.0,.98,.93),max(core,photosphere*.64));
          gl_FragColor=vec4(star,alpha);
        }`}
    />
  </points>;
}

function SystemNode({ system, onSelect }: { system: GalaxySystem; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const starTexture = useTexture(galaxyStellarFlare);
  starTexture.colorSpace = THREE.SRGBColorSpace;
  const typeScale = THREE.MathUtils.lerp(.66, 1.22, (heroStarScale(system.star) - 4.85) / 2.55);
  const scale = typeScale * (system.occupied ? 1.16 : .98);
  const surfaceRadius = scale * (system.star.binary ? .34 : .46);
  const luminous = system.occupied || system.star.scale >= 1.2 || system.star.binary || system.star.remnant;
  const detailed = hovered || system.occupied;
  const members = system.star.binary ? [[-scale * .46, 0, 0], [scale * .46, scale * .06, 0]] as const : [[0, 0, 0]] as const;
  return <group
    position={system.position}
    onClick={(event) => { event.stopPropagation(); onSelect(); }}
    onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
    onPointerOut={() => { setHovered(false); document.body.style.cursor = ""; }}
  >
    {detailed && members.map((position, index) => {
      const memberColor = index === 1 ? "#b7dfff" : system.star.color;
      return <group key={index} position={position}>
        <GalaxyMapStellarSurface radius={surfaceRadius} color={memberColor} />
        <sprite raycast={() => null} scale={[surfaceRadius * 7.2, surfaceRadius * 7.2, 1]}><spriteMaterial map={starTexture} color={memberColor} transparent opacity={system.occupied ? .58 : .4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
        <sprite raycast={() => null} scale={[surfaceRadius * 11.5, surfaceRadius * 11.5, 1]}><spriteMaterial map={starTexture} color={memberColor} transparent opacity={system.occupied ? .16 : .1} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
        {luminous && <sprite raycast={() => null} scale={[surfaceRadius * 15, surfaceRadius * 15, 1]}><spriteMaterial map={starTexture} color={memberColor} transparent opacity={system.occupied ? .11 : .065} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>}
      </group>;
    })}
    {detailed && system.star.remnant && <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[surfaceRadius * 1.32, surfaceRadius * .055, 8, 40]} /><meshBasicMaterial color={system.star.color} transparent opacity={.42} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>}
    <mesh><sphereGeometry args={[Math.max(1.05, surfaceRadius * 2.2), 10, 10]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    {hovered && <group rotation={[Math.PI / 2, 0, 0]}><mesh><ringGeometry args={[Math.max(.86, scale * .92), Math.max(.91, scale * .99), 48]} /><meshBasicMaterial color="#80e8ff" transparent opacity={.78} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh><mesh><ringGeometry args={[Math.max(1.04, scale * 1.12), Math.max(1.06, scale * 1.15), 48]} /><meshBasicMaterial color="#80e8ff" transparent opacity={.2} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh></group>}
    {(hovered || system.occupied) && <Html center position={[0, Math.max(.95, scale * 1.12), 0]} distanceFactor={26} zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}><div className="system-label">{`S ${system.label} · ${system.star.label.toUpperCase()}${system.planetCount > 0 ? ` · ${system.planetCount} OCCUPIED` : ""}`}</div></Html>}
  </group>;
}

function SystemPlanetClouds({ radius, enabled, style }: { radius: number; enabled: boolean; style: PlanetSurfaceStyle }) {
  const clouds = useRef<THREE.Mesh>(null!);
  const sourceTexture = useTexture(terranClouds);
  const biomeIndex = planetBiomeIndex(style);
  const variantSeed = style.variantSeed ?? biomeIndex;
  const texture = useMemo(() => {
    const clone = sourceTexture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(1 + (variantSeed % 5) * .11, 1 + ((variantSeed >>> 4) % 5) * .08);
    clone.offset.set(((variantSeed % 997) / 997), (((variantSeed >>> 10) % 991) / 991));
    clone.needsUpdate = true;
    return clone;
  }, [sourceTexture, variantSeed]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((_, delta) => {
    if (clouds.current) clouds.current.rotation.y += delta * (.006 + (variantSeed % 7) * .0008);
  });
  if (!enabled) return null;
  return <mesh ref={clouds} scale={1.028} renderOrder={2} castShadow>
    <sphereGeometry args={[radius, 48, 48]} />
    <meshPhysicalMaterial map={texture} alphaMap={texture} color={style.atmosphere} transparent opacity={.2 + (biomeIndex % 4) * .028} alphaTest={.04} roughness={.86} depthWrite={false} />
  </mesh>;
}

function PlanetSelectionMarker({ radius, color }: { radius: number; color: string }) {
  const reticle = useRef<THREE.Group>(null!);
  useFrame(({ camera, clock }) => {
    if (!reticle.current) return;
    reticle.current.quaternion.copy(camera.quaternion);
    reticle.current.rotateZ(clock.getElapsedTime() * .055);
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 2.6) * .035;
    reticle.current.scale.setScalar(pulse);
  });
  return <group ref={reticle} renderOrder={6}>
    <mesh><ringGeometry args={[radius * 1.3, radius * 1.318, 96, 1, .16, Math.PI * .34]} /><meshBasicMaterial color={color} transparent opacity={.42} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    <mesh rotation={[0, 0, Math.PI]}><ringGeometry args={[radius * 1.3, radius * 1.318, 96, 1, .16, Math.PI * .34]} /><meshBasicMaterial color={color} transparent opacity={.42} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
  </group>;
}

function PlanetReadabilityLight({ radius, color, active }: { radius: number; color: string; active: boolean }) {
  const fill = useRef<THREE.PointLight>(null!);
  useFrame(({ camera }) => {
    if (!fill.current?.parent) return;
    const localCamera = fill.current.parent.worldToLocal(camera.position.clone());
    if (localCamera.lengthSq() < .001) return;
    fill.current.position.copy(localCamera.normalize().multiplyScalar(radius * 3.1));
  });
  return <pointLight ref={fill} color={color} intensity={active ? 4.2 : 1.65} distance={radius * 8.5} decay={2} />;
}

function OccupiedWorldInfrastructure({ planet, radius, style, active }: { planet: UniversePlanet; radius: number; style: PlanetSurfaceStyle; active: boolean }) {
  const orbitalNetwork = useRef<THREE.Group>(null!);
  const traffic = useRef<THREE.Group>(null!);
  const development = useMemo(() => {
    const onChainSignal = Math.max(0, planet.metal) + Math.max(0, planet.crystal) + Math.max(0, planet.deuterium) + Math.max(0, planet.fleetPower);
    return THREE.MathUtils.clamp(Math.log10(1 + onChainSignal) / 6, .26, 1);
  }, [planet.crystal, planet.deuterium, planet.fleetPower, planet.metal]);
  const settlementLights = useMemo(() => {
    const random = seeded(fleetRouteHash(`${planet.id}:settlements`));
    const count = 34 + Math.round(development * 74);
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const latitude = Math.asin(random() * 2 - 1) * .78;
      const longitude = random() * Math.PI * 2;
      const cluster = index % 5 === 0 ? .08 : 0;
      const clusteredLongitude = longitude + (random() - .5) * cluster;
      const surfaceRadius = radius * 1.012;
      positions[index * 3] = Math.cos(latitude) * Math.sin(clusteredLongitude) * surfaceRadius;
      positions[index * 3 + 1] = Math.sin(latitude) * surfaceRadius;
      positions[index * 3 + 2] = Math.cos(latitude) * Math.cos(clusteredLongitude) * surfaceRadius;
    }
    return positions;
  }, [development, planet.id, radius]);
  const stationCount = 2 + Math.round(development * 3) + (planet.fleetPower > 0 ? 1 : 0);
  const factionColor = FACTION_COLORS[planet.faction];
  const lightColor = useMemo(() => new THREE.Color(style.atmosphere).lerp(new THREE.Color(factionColor), .46), [factionColor, style.atmosphere]);
  useFrame(({ clock }, delta) => {
    if (orbitalNetwork.current) orbitalNetwork.current.rotation.y += delta * (.018 + development * .015);
    if (traffic.current) {
      traffic.current.rotation.y -= delta * (.055 + development * .025);
      traffic.current.rotation.z = Math.sin(clock.getElapsedTime() * .12 + development) * .035;
    }
  });
  return <group>
    <points renderOrder={3}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[settlementLights, 3]} /></bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        uniforms={{ lightColor: { value: lightColor }, pointSize: { value: active ? 3.1 : 2.45 }, intensity: { value: .72 + development * .24 } }}
        vertexShader={`
          uniform float pointSize;
          varying float vNight;
          void main(){
            vec4 worldPosition=modelMatrix*vec4(position,1.0);
            vec3 worldCenter=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
            vec3 surfaceNormal=normalize(mat3(modelMatrix)*position);
            vec3 starDirection=normalize(-worldCenter);
            vNight=1.0-smoothstep(-.16,.24,dot(surfaceNormal,starDirection));
            vec4 mvPosition=viewMatrix*worldPosition;
            gl_Position=projectionMatrix*mvPosition;
            gl_PointSize=clamp(pointSize*(50.0/max(12.0,-mvPosition.z)),.85,3.8);
          }`}
        fragmentShader={`
          uniform vec3 lightColor;
          uniform float intensity;
          varying float vNight;
          void main(){
            float radius=length(gl_PointCoord-.5)*2.0;
            if(radius>1.0) discard;
            float glow=pow(1.0-radius,2.1);
            gl_FragColor=vec4(mix(lightColor,vec3(1.0,.78,.44),.34),glow*intensity*vNight);
          }`}
      />
    </points>
    <group ref={orbitalNetwork} rotation={[.34 + development * .14, 0, -.18]}>
      <mesh renderOrder={3}><torusGeometry args={[radius * 1.48, Math.max(.012, radius * .009), 8, 160]} /><meshStandardMaterial color="#9db4c1" emissive={factionColor} emissiveIntensity={active ? 1.15 : .48} metalness={.88} roughness={.24} transparent opacity={.62} /></mesh>
      {development > .58 && <mesh rotation={[Math.PI / 2.9, .16, 0]} renderOrder={3}><torusGeometry args={[radius * 1.78, Math.max(.009, radius * .006), 7, 160]} /><meshBasicMaterial color={factionColor} transparent opacity={active ? .46 : .22} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>}
      {Array.from({ length: stationCount }, (_, station) => {
        const angle = station / stationCount * Math.PI * 2 + fleetRouteHash(planet.id) % 29 * .03;
        const orbitRadius = radius * (station % 2 && development > .58 ? 1.78 : 1.48);
        const stationScale = radius * (.085 + (station % 3) * .012);
        return <group key={station} position={[Math.cos(angle) * orbitRadius, Math.sin(angle * 2.1) * radius * .08, Math.sin(angle) * orbitRadius]} rotation={[0, -angle, station % 2 ? .16 : -.12]} scale={stationScale}>
          <mesh castShadow><boxGeometry args={[1.7, .42, .54]} /><meshStandardMaterial color="#35505f" metalness={.9} roughness={.23} /></mesh>
          <mesh position={[0, 0, .31]}><boxGeometry args={[.82, .12, .08]} /><meshBasicMaterial color={factionColor} transparent opacity={.82} toneMapped={false} /></mesh>
          <mesh position={[-1.05, 0, 0]}><boxGeometry args={[.38, .08, 1.28]} /><meshPhysicalMaterial color="#173d56" emissive="#0b2940" emissiveIntensity={.6} metalness={.52} roughness={.2} clearcoat={.48} /></mesh>
          <mesh position={[1.05, 0, 0]}><boxGeometry args={[.38, .08, 1.28]} /><meshPhysicalMaterial color="#173d56" emissive="#0b2940" emissiveIntensity={.6} metalness={.52} roughness={.2} clearcoat={.48} /></mesh>
          <pointLight color={factionColor} intensity={active ? .85 : .35} distance={stationScale * 12} />
        </group>;
      })}
    </group>
    <group ref={traffic} rotation={[-.18, .22, .28]}>
      {Array.from({ length: 2 + Math.round(development * 3) }, (_, vessel) => {
        const angle = vessel * 2.399963 + fleetRouteHash(`${planet.id}:${vessel}`) % 17 * .04;
        const orbitRadius = radius * (1.95 + (vessel % 2) * .2);
        return <group key={vessel} position={[Math.cos(angle) * orbitRadius, Math.sin(angle * 1.8) * radius * .18, Math.sin(angle) * orbitRadius]} rotation={[0, -angle, 0]} scale={radius * .045}>
          <mesh rotation={[0, 0, -Math.PI / 2]} castShadow><coneGeometry args={[.34, 1.8, 5]} /><meshStandardMaterial color="#a6bac3" metalness={.88} roughness={.2} /></mesh>
          <mesh position={[-.92, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[.25, 1.15, 16, 1, true]} /><meshBasicMaterial color={factionColor} transparent opacity={.2} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
        </group>;
      })}
    </group>
  </group>;
}

function SystemMoon({ seed, radius, orbitRadius, speed, phase, inclination, color, active }: { seed: number; radius: number; orbitRadius: number; speed: number; phase: number; inclination: number; color: string; active: boolean }) {
  const orbit = useRef<THREE.Group>(null!);
  const texture = useMemo(() => {
    const width = 96;
    const height = 48;
    const data = new Uint8Array(width * height * 4);
    const base = new THREE.Color(color);
    let state = seed >>> 0;
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const crater = Math.sin(x * .31 + Math.sin(y * .27 + seed) * 2.7) * .5 + Math.cos(y * .43 - x * .11) * .28;
      const noise = ((state >>> 24) / 255 - .5) * .24;
      const brightness = THREE.MathUtils.clamp(.58 + crater * .18 + noise, .2, .94);
      data[pixel * 4] = Math.round(base.r * 255 * brightness);
      data[pixel * 4 + 1] = Math.round(base.g * 255 * brightness);
      data[pixel * 4 + 2] = Math.round(base.b * 255 * brightness);
      data[pixel * 4 + 3] = 255;
    }
    const result = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = THREE.RepeatWrapping;
    result.needsUpdate = true;
    return result;
  }, [color, seed]);
  const orbitPoints = useMemo(() => Array.from({ length: 65 }, (_, index) => {
    const angle = index / 64 * Math.PI * 2;
    return [Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius] as [number, number, number];
  }), [orbitRadius]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ clock }) => {
    if (orbit.current) orbit.current.rotation.y = phase + clock.getElapsedTime() * speed;
  });
  return <group rotation={[inclination, 0, inclination * .42]}>
    {active && <Line points={orbitPoints} color="#9bb5c4" transparent opacity={.055} lineWidth={.35} />}
    <group ref={orbit}>
      <mesh position={[orbitRadius, 0, 0]} castShadow receiveShadow>
        <sphereGeometry args={[radius, 28, 28]} />
        <meshPhysicalMaterial map={texture} bumpMap={texture} bumpScale={radius * .08} roughness={.88} metalness={.015} />
      </mesh>
    </group>
  </group>;
}

function PlanetMoonSystem({ identity, radius, style, active }: { identity: string; radius: number; style: PlanetSurfaceStyle; active: boolean }) {
  const moons = useMemo(() => {
    const seed = fleetRouteHash(`${identity}:moons`) >>> 0;
    const count = style.className === "gas" ? 2 + seed % 3 : (seed >>> 4) % 5 === 0 ? 0 : 1 + ((seed >>> 7) % 2);
    return Array.from({ length: count }, (_, index) => {
      const moonSeed = (seed + Math.imul(index + 1, 2654435761)) >>> 0;
      return {
        seed: moonSeed,
        radius: radius * (.105 + ((moonSeed >>> 8) % 100) / 1000),
        orbitRadius: radius * (2.28 + index * .64 + ((moonSeed >>> 16) % 17) / 100),
        speed: .018 + ((moonSeed >>> 20) % 19) * .0011,
        phase: (moonSeed % 997) / 997 * Math.PI * 2,
        inclination: -.42 + ((moonSeed >>> 11) % 100) / 100 * .84,
        color: index % 3 === 0 ? style.polar : index % 3 === 1 ? style.highland : style.coast,
      };
    });
  }, [identity, radius, style.className, style.coast, style.highland, style.polar]);
  return <group>{moons.map((moon, index) => <SystemMoon key={`${moon.seed}:${index}`} {...moon} active={active} />)}</group>;
}

function PlanetNode({ planet, displayOrbit, active, onSelect }: { planet: UniversePlanet; displayOrbit?: UniverseOrbit; active: boolean; onSelect: () => void }) {
  const orbiter = React.useRef<THREE.Group>(null!);
  const mesh = React.useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);
  const [galaxy, system, rawPosition] = planet.system.split(":").map(Number);
  const position = rawPosition || 1;
  const style = useMemo(() => planetSurfaceStyleForSystem(position, galaxy || 1, system || 1), [galaxy, position, system]);
  const radius = occupiedSystemPlanetRadius(planet);
  const orbit = displayOrbit ?? planet.orbit ?? orbitForSystemPosition(position);
  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (orbiter.current) {
      const [x, y, z] = pointOnUniverseOrbit(orbit, orbit.phase + elapsed * orbit.angularVelocity);
      orbiter.current.position.set(x, y, z);
    }
    if (mesh.current) mesh.current.scale.setScalar(hovered ? 1.035 : 1);
  });
  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => { document.body.style.cursor = ""; };
  }, [hovered]);
  const surfaceTexture = useProceduralPlanetTexture(style, active ? 10 : 8, active ? 512 : 256);
  const surfaceTint = useMemo(() => new THREE.Color("#ffffff").lerp(new THREE.Color(style.previewColor), .035), [style.previewColor]);
  const clouded = style.className === "ocean" || style.className === "terran" || style.className === "ice";
  const factionLabel = planet.faction === "owned" ? "YOUR WORLD" : `Owner ${planet.ownerLabel}`;
  return <group ref={orbiter} position={planet.coordinates}>
    <mesh onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <sphereGeometry args={[Math.max(1.05, radius * 1.45), 24, 24]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
    <mesh ref={mesh} castShadow receiveShadow>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshPhysicalMaterial
        map={surfaceTexture}
        bumpMap={style.className === "gas" ? undefined : surfaceTexture}
        bumpScale={style.className === "ice" ? radius * .022 : radius * .045}
        color={surfaceTint}
        roughness={style.className === "ice" ? .48 : style.className === "gas" ? .84 : style.className === "ocean" ? .38 : .68}
        metalness={style.className === "ice" ? .06 : 0}
        clearcoat={style.className === "ocean" ? .42 : style.className === "ice" ? .24 : .04}
        clearcoatRoughness={style.className === "ocean" ? .28 : .58}
        emissive={surfaceTint}
        emissiveMap={surfaceTexture}
        emissiveIntensity={active || hovered ? .2 : style.className === "gas" ? .1 : .12}
      />
    </mesh>
    <mesh scale={1.002} renderOrder={1}>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshBasicMaterial map={surfaceTexture} color={surfaceTint} transparent opacity={active || hovered ? .2 : .1} depthWrite={false} toneMapped={false} />
    </mesh>
    <PlanetReadabilityLight radius={radius} color={style.atmosphere} active={active || hovered} />
    <SystemPlanetClouds radius={radius} enabled={clouded} style={style} />
    <AtmosphereShell radius={radius} color={style.atmosphere} />
    <PlanetMoonSystem identity={planet.id} radius={radius} style={style} active={active || hovered} />
    <OccupiedWorldInfrastructure planet={planet} radius={radius} style={style} active={active || hovered} />
    {style.rings && <group rotation={[Math.PI / 2.35, 0.18, 0]}><mesh><ringGeometry args={[radius * 1.32, radius * 1.9, 128]} /><meshStandardMaterial color={style.atmosphere} roughness={.72} metalness={.08} transparent opacity={0.38} side={THREE.DoubleSide} depthWrite={false} /></mesh><mesh><ringGeometry args={[radius * 1.5, radius * 1.58, 128]} /><meshBasicMaterial color="#f4e8ce" transparent opacity={.32} side={THREE.DoubleSide} depthWrite={false} /></mesh></group>}
    {planet.shielded && <mesh scale={radius * 1.13}>
      <sphereGeometry args={[1, 40, 40]} /><meshBasicMaterial color="#8deaff" transparent opacity={0.1} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>}
    {planet.faction === "owned" && <pointLight color={style.atmosphere} intensity={1.1} distance={5} />}
    {(active || hovered) && <PlanetSelectionMarker radius={radius} color={FACTION_COLORS[planet.faction]} />}
    {(active || hovered) && <Html center distanceFactor={15} zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}><div className={`universe-label faction-${planet.faction} ${active ? "is-active" : ""} ${hovered ? "is-hovered" : ""}`}><b>{planet.name}</b><span>{planet.system} · {factionLabel}{planet.shielded ? " · SHIELDED" : ""}</span>{planet.fleetPower > 0 && <em>{planet.fleetPower.toLocaleString()} FLEET POWER</em>}</div></Html>}
  </group>;
}

function emptySystemPlanetRadius(position: number, galaxy: number, system: number, orbit: UniverseOrbit): number {
  const style = planetSurfaceStyleForSystem(position, galaxy, system);
  const baseRadius = style.className === "gas" ? .62 : .49;
  return baseRadius * THREE.MathUtils.clamp(1.02 - orbit.radius / 300, .84, 1) * systemPlanetLinearMagnification(position);
}

function EmptyPlanetSlot({ position, galaxy, system, orbit, onSelect }: { position: number; galaxy: number; system: number; orbit: UniverseOrbit; onSelect: () => void }) {
  const orbiter = React.useRef<THREE.Group>(null!);
  const planet = React.useRef<THREE.Group>(null!);
  const contact = React.useRef<THREE.Group>(null!);
  const [hovered, setHovered] = useState(false);
  const style = useMemo(() => planetSurfaceStyleForSystem(position, galaxy, system), [galaxy, position, system]);
  const surfaceTexture = useProceduralPlanetTexture(style, 6, 192);
  // Empty worlds remain smaller than inhabited worlds, but share the same
  // cinematic 20x-50x footprint progression across the system.
  const radius = emptySystemPlanetRadius(position, galaxy, system, orbit);
  const surfaceTint = useMemo(() => new THREE.Color("#ffffff").lerp(new THREE.Color(style.previewColor), .025), [style.previewColor]);
  const clouded = style.className === "ocean" || style.className === "terran" || style.className === "ice";
  useFrame(({ camera, clock }) => {
    if (!orbiter.current) return;
    const [x, y, z] = pointOnUniverseOrbit(orbit, orbit.phase + clock.getElapsedTime() * orbit.angularVelocity);
    orbiter.current.position.set(x, y, z);
    if (planet.current) planet.current.scale.setScalar(hovered ? 1.07 : 1);
    if (contact.current) {
      contact.current.quaternion.copy(camera.quaternion);
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 1.55 + position) * .035;
      contact.current.scale.setScalar(pulse);
    }
  });
  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => { document.body.style.cursor = ""; };
  }, [hovered]);
  return <group ref={orbiter} position={pointOnUniverseOrbit(orbit)}>
    <mesh onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <sphereGeometry args={[Math.max(2.8, radius * 1.85), 20, 20]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
    <group ref={planet}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshPhysicalMaterial
          map={surfaceTexture}
          bumpMap={style.className === "gas" ? undefined : surfaceTexture}
          bumpScale={style.className === "ice" ? radius * .018 : radius * .038}
          color={surfaceTint}
          roughness={style.className === "ice" ? .5 : style.className === "gas" ? .86 : style.className === "ocean" ? .4 : .72}
          metalness={style.className === "ice" ? .04 : 0}
          clearcoat={style.className === "ocean" ? .36 : style.className === "ice" ? .2 : .02}
          clearcoatRoughness={style.className === "ocean" ? .3 : .62}
          emissive={surfaceTint}
          emissiveMap={surfaceTexture}
          emissiveIntensity={hovered ? .25 : .14}
        />
      </mesh>
      <mesh scale={1.025} renderOrder={2}>
        <sphereGeometry args={[radius, 40, 40]} />
        <meshBasicMaterial color={style.atmosphere} transparent opacity={hovered ? .1 : .045} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <PlanetReadabilityLight radius={radius} color={style.atmosphere} active={hovered} />
      <SystemPlanetClouds radius={radius} enabled={clouded} style={style} />
      <AtmosphereShell radius={radius} color={style.atmosphere} />
      <PlanetMoonSystem identity={`${galaxy}:${system}:${position}`} radius={radius} style={style} active={hovered} />
      {style.rings && <mesh rotation={[Math.PI / 2.35, .18, 0]}><ringGeometry args={[radius * 1.35, radius * 1.75, 64]} /><meshBasicMaterial color="#71808a" transparent opacity={hovered ? .34 : .18} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
    </group>
    <group ref={contact} renderOrder={5}>
      <mesh><ringGeometry args={[radius * 1.48, radius * 1.505, 72]} /><meshBasicMaterial color={style.atmosphere} transparent opacity={hovered ? .58 : .2} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      <mesh rotation={[0, 0, Math.PI / 4]}><ringGeometry args={[radius * 1.72, radius * 1.735, 72, 1, 0, Math.PI / 5]} /><meshBasicMaterial color="#c8f4ff" transparent opacity={hovered ? .7 : .24} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      <mesh rotation={[0, 0, Math.PI * 1.25]}><ringGeometry args={[radius * 1.72, radius * 1.735, 72, 1, 0, Math.PI / 5]} /><meshBasicMaterial color="#c8f4ff" transparent opacity={hovered ? .7 : .24} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
    </group>
    {hovered && <Html center distanceFactor={15} zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
      <div className="universe-label empty-slot"><b>EMPTY</b><span>POSITION {position}</span></div>
    </Html>}
  </group>;
}

function OrbitPath({ orbit, faction, active = false }: { orbit: UniverseOrbit; faction?: UniversePlanet["faction"]; active?: boolean }) {
  const points = useMemo(() => Array.from({ length: 73 }, (_, index) => {
    const angle = (index / 72) * Math.PI * 2;
    return pointOnUniverseOrbit(orbit, angle);
  }), [orbit.ascendingNode, orbit.ellipse, orbit.inclination, orbit.radius]);
  const color = faction ? FACTION_COLORS[faction] : "#527993";
  return <group><Line points={points} color={color} transparent opacity={active ? .15 : faction ? .085 : .006} lineWidth={active ? .62 : faction ? .48 : .24} />{active && <Line points={points} color="#e7fbff" transparent opacity={.022} lineWidth={.96} />}</group>;
}

function BoundedCameraTarget({ controls, limit }: { controls: React.MutableRefObject<any>; limit: number }) {
  const { camera } = useThree();
  useFrame(() => {
    const orbit = controls.current;
    if (!orbit || orbit.target.length() <= limit) return;
    const offset = camera.position.clone().sub(orbit.target);
    orbit.target.setLength(limit);
    camera.position.copy(orbit.target).add(offset);
    orbit.update();
  });
  return null;
}

function FocusedLevelCamera({ controls, enabled, target, offset }: { controls: React.MutableRefObject<any>; enabled: boolean; target: [number, number, number]; offset: [number, number, number] }) {
  const { camera } = useThree();
  const activeLevel = useRef(false);
  const transition = useRef<{ startedAt: number; fromPosition: THREE.Vector3; fromTarget: THREE.Vector3; toPosition: THREE.Vector3; toTarget: THREE.Vector3 } | null>(null);
  useCameraInputCancel(controls, transition);
  useEffect(() => {
    if (!enabled) { activeLevel.current = false; transition.current = null; return; }
    if (!controls.current) return;
    if (!activeLevel.current) {
      activeLevel.current = true;
      camera.position.set(target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]);
      controls.current.target.set(...target);
      controls.current.update();
      return;
    }
    transition.current = {
      startedAt: performance.now(),
      fromPosition: camera.position.clone(),
      fromTarget: controls.current.target.clone(),
      toPosition: new THREE.Vector3(target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]),
      toTarget: new THREE.Vector3(...target),
    };
  }, [camera, controls, enabled, offset[0], offset[1], offset[2], target[0], target[1], target[2]]);
  useFrame(() => {
    const active = transition.current;
    const orbit = controls.current;
    if (!enabled || !active || !orbit) return;
    const progress = THREE.MathUtils.clamp((performance.now() - active.startedAt) / Math.max(1, motionDuration(500)), 0, 1);
    const eased = easeSceneProgress(progress);
    camera.position.lerpVectors(active.fromPosition, active.toPosition, eased);
    orbit.target.lerpVectors(active.fromTarget, active.toTarget, eased);
    orbit.update();
    if (progress >= 1) transition.current = null;
  });
  return null;
}

function SystemCameraComposition({ controls, enabled, star, focusPlanet, compositionKey }: { controls: React.MutableRefObject<any>; enabled: boolean; star?: StarDefinition; focusPlanet: UniversePlanet | null; compositionKey: string }) {
  const { camera, clock, size } = useThree();
  const activeLevel = useRef(false);
  const transition = useRef<{ startedAt: number; fromPosition: THREE.Vector3; fromTarget: THREE.Vector3; toPosition: THREE.Vector3; toTarget: THREE.Vector3 } | null>(null);
  useCameraInputCancel(controls, transition);
  useEffect(() => {
    if (!enabled) { activeLevel.current = false; transition.current = null; return; }
    if (!controls.current || !star) return;
    let toTarget = new THREE.Vector3(0, 0, 0);
    let toPosition: THREE.Vector3;
    if (focusPlanet) {
      const target = livePlanetPosition(focusPlanet, clock.getElapsedTime());
      const planetRadius = occupiedSystemPlanetRadius(focusPlanet);
      const distance = THREE.MathUtils.clamp(planetRadius * 7.5, 24, 54) * sceneAspectDistanceScale(size.width, size.height);
      const radial = radialDirection(target);
      const tangent = new THREE.Vector3(-radial.z, 0, radial.x);
      toTarget = target;
      toPosition = target.clone()
        .addScaledVector(radial, distance * .78)
        .addScaledVector(tangent, distance * .28)
        .add(new THREE.Vector3(0, distance * .38, 0));
    } else {
      const distance = systemSurveyCameraDistance(star) * sceneAspectDistanceScale(size.width, size.height);
      toPosition = new THREE.Vector3(0, distance * .492, distance * .871);
    }
    if (!activeLevel.current) {
      activeLevel.current = true;
      camera.position.copy(toPosition);
      controls.current.target.copy(toTarget);
      controls.current.update();
      return;
    }
    transition.current = {
      startedAt: performance.now(),
      fromPosition: camera.position.clone(),
      fromTarget: controls.current.target.clone(),
      toPosition,
      toTarget,
    };
  }, [camera, clock, compositionKey, controls, enabled, star?.label, size.width, size.height]);
  useFrame(() => {
    const active = transition.current;
    const orbit = controls.current;
    if (!enabled || !active || !orbit) return;
    const progress = THREE.MathUtils.clamp((performance.now() - active.startedAt) / Math.max(1, motionDuration(650)), 0, 1);
    const eased = easeSceneProgress(progress);
    camera.position.lerpVectors(active.fromPosition, active.toPosition, eased);
    orbit.target.lerpVectors(active.fromTarget, active.toTarget, eased);
    orbit.update();
    if (progress >= 1) transition.current = null;
  });
  return null;
}

function CameraZoom({ command, controls, minDistance, maxDistance }: { command: { id: number; direction: "in" | "out" }; controls: React.MutableRefObject<any>; minDistance: number; maxDistance: number }) {
  const { camera } = useThree();
  const appliedCommand = useRef(0);
  const transition = useRef<{ startedAt: number; from: THREE.Vector3; to: THREE.Vector3 } | null>(null);
  useCameraInputCancel(controls, transition);
  useEffect(() => {
    const orbit = controls.current;
    if (!command.id || command.id === appliedCommand.current || !orbit) return;
    appliedCommand.current = command.id;
    const offset = camera.position.clone().sub(orbit.target).multiplyScalar(command.direction === "in" ? 0.72 : 1.38);
    offset.setLength(THREE.MathUtils.clamp(offset.length(), minDistance, maxDistance));
    orbit.dispatchEvent({ type: 'start' });
    transition.current = { startedAt: performance.now(), from: camera.position.clone(), to: orbit.target.clone().add(offset) };
  }, [camera, command, controls, maxDistance, minDistance]);
  useFrame(() => {
    const active = transition.current;
    if (!active || !controls.current) return;
    const progress = Math.min(1, (performance.now() - active.startedAt) / Math.max(1, motionDuration(220)));
    camera.position.lerpVectors(active.from, active.to, easeSceneProgress(progress));
    controls.current.update();
    if (progress >= 1) transition.current = null;
  });
  return null;
}

function occupiedPlanetDisplayOrbit(planet: UniversePlanet, occupiedIndex: number): UniverseOrbit {
  const position = Number(planet.system.split(":")[2]) || 1;
  const orbit = planet.orbit ?? orbitForSystemPosition(position);
  return { ...orbit, radius: orbit.radius * 1.3 * SYSTEM_ORBIT_PRESENTATION_SCALE, phase: 2.35 + occupiedIndex * 2.399963, angularVelocity: orbit.angularVelocity * .12 };
}

function assertFullSystemDemoCollisionSafety(planets: UniversePlanet[]) {
  const displayOrbits = planets.map(occupiedPlanetDisplayOrbit);
  for (let sample = 0; sample <= 720; sample += 1) {
    const elapsed = sample * 60;
    const positions = displayOrbits.map((orbit) => new THREE.Vector3(...pointOnUniverseOrbit(orbit, orbit.phase + elapsed * orbit.angularVelocity)));
    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        const requiredClearance = (occupiedSystemPlanetRadius(planets[left]) + occupiedSystemPlanetRadius(planets[right])) * 1.08;
        if (positions[left].distanceTo(positions[right]) <= requiredClearance) {
          throw new Error(`Unsafe local demo orbits: positions ${left + 1} and ${right + 1} intersect at sample ${sample}.`);
        }
      }
    }
  }
}

function fleetRouteHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function livePlanetPosition(planet: UniversePlanet, elapsed: number): THREE.Vector3 {
  if (!planet.orbit) return new THREE.Vector3(...planet.coordinates);
  return new THREE.Vector3(...pointOnUniverseOrbit(planet.orbit, planet.orbit.phase + elapsed * planet.orbit.angularVelocity));
}

function radialDirection(point: THREE.Vector3): THREE.Vector3 {
  const direction = new THREE.Vector3(point.x, 0, point.z);
  return direction.lengthSq() > .0001 ? direction.normalize() : new THREE.Vector3(1, 0, 0);
}

function collisionSafeFleetCurve({
  missionId,
  sourceCenter,
  targetCenter,
  sourceIsPlanet,
  targetIsPlanet,
  bodies,
  sourceId,
  targetId,
  sourceClearance,
  targetClearance,
  starClearance,
}: {
  missionId: string;
  sourceCenter: THREE.Vector3;
  targetCenter: THREE.Vector3;
  sourceIsPlanet: boolean;
  targetIsPlanet: boolean;
  bodies: Array<{ id: string; position: THREE.Vector3; clearance: number }>;
  sourceId: string;
  targetId: string;
  sourceClearance: number;
  targetClearance: number;
  starClearance: number;
}): THREE.QuadraticBezierCurve3 {
  const hash = fleetRouteHash(missionId);
  const preferredSide = (hash & 1) === 0 ? 1 : -1;
  const sourceRadial = radialDirection(sourceCenter);
  const targetRadial = radialDirection(targetCenter);
  const sourceDock = sourceCenter.clone().addScaledVector(sourceRadial, sourceIsPlanet ? sourceClearance : 0);
  const targetDock = targetCenter.clone().addScaledVector(targetRadial, targetIsPlanet ? targetClearance : 0);
  const chord = targetDock.clone().sub(sourceDock);
  const perpendicular = new THREE.Vector3(-chord.z, 0, chord.x);
  if (perpendicular.lengthSq() < .0001) perpendicular.set(1, 0, 0);
  perpendicular.normalize();
  const distance = Math.max(1, chord.length());
  const baseMidpoint = sourceDock.clone().lerp(targetDock, .5);
  baseMidpoint.y += Math.max(1.4, distance * .13);
  baseMidpoint.z += Math.sin(missionId.length * 1.73) * Math.min(2.4, distance * .08);
  let fallback = new THREE.QuadraticBezierCurve3(sourceDock, baseMidpoint, targetDock);

  // Start with the original direct arc. Only add a progressively wider
  // sideways bend when that arc intersects a protected celestial body.
  for (let attempt = 0; attempt < 13; attempt += 1) {
    const magnitude = attempt === 0 ? 0 : Math.ceil(attempt / 2) * 2.2;
    const side = attempt === 0 ? 0 : (attempt % 2 === 1 ? preferredSide : -preferredSide);
    const control = baseMidpoint.clone().addScaledVector(perpendicular, magnitude * side);
    const curve = new THREE.QuadraticBezierCurve3(sourceDock, control, targetDock);
    fallback = curve;
    const samples = curve.getPoints(72);
    const clear = samples.every((point, sampleIndex) => {
      if (Math.hypot(point.x, point.z) < starClearance) return false;
      return bodies.every((body) => {
        if (body.id === sourceId && sampleIndex <= 5) return true;
        if (body.id === targetId && sampleIndex >= samples.length - 6) return true;
        return point.distanceTo(body.position) >= body.clearance;
      });
    });
    if (clear) return curve;
  }
  return fallback;
}

function MissionFleetVessel({ kind, shipClass, ownerAddress, color, compact = false }: { kind: UniverseMission["kind"]; shipClass?: UniverseMission['shipClass']; ownerAddress?:string; color: string; compact?: boolean }) {
  return <TravelFleetVessel kind={kind} shipClass={shipClass} ownerAddress={ownerAddress} color={color} compact={compact} />;
}

export function FleetRoute({ mission, planets, starClearance, count = 1, compact = false }: { mission: UniverseMission; planets: UniversePlanet[]; starClearance: number; count?: number; compact?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const source = planets.find((planet) => planet.id === mission.sourceId);
  const target = planets.find((planet) => planet.id === mission.destinationId);
  const externalSource = !source && !!mission.sourceCoordinates;
  const externalTarget = !target && !mission.destinationOrbit && !!mission.destinationCoordinates;
  const inbound = mission.phase === 'returning' ? externalTarget : externalSource;
  const vesselLabel = mission.kind === 'colonize' ? 'Colony ship' : mission.kind === 'transport' ? 'Cargo fleet' : mission.kind === 'espionage' ? 'Probe' : 'Attack fleet';
  const routeGroup = React.useRef<THREE.Group>(null!);
  const vessel = React.useRef<THREE.Group>(null!);
  const [routePoints, setRoutePoints] = useState<Array<[number, number, number]>>([]);
  const lastRouteLineUpdate = useRef(-1);
  const progressEpoch = useRef(Date.now() / 1000);
  useFrame(({ clock, camera, size }) => {
    if ((!source && !mission.sourceCoordinates) || (!target && !mission.destinationCoordinates && !mission.destinationOrbit) || !vessel.current) return;
    const elapsed = clock.getElapsedTime();
    const bodies = planets.map((planet) => ({
      id: planet.id,
      position: livePlanetPosition(planet, elapsed),
      clearance: occupiedSystemPlanetRadius(planet) * 1.16,
    }));
    const sourceCenter = source ? livePlanetPosition(source, elapsed) : new THREE.Vector3(...mission.sourceCoordinates!);
    const targetCenter = target ? livePlanetPosition(target, elapsed) : mission.destinationOrbit
      ? new THREE.Vector3(...pointOnUniverseOrbit(mission.destinationOrbit, mission.destinationOrbit.phase + elapsed * mission.destinationOrbit.angularVelocity))
      : new THREE.Vector3(...mission.destinationCoordinates!);
    // A remote system is a map-edge entry, not a distant invisible planet.
    // Keep its approach in the viewport when the local endpoint is visible.
    if (externalSource || externalTarget) {
      const local = externalSource ? targetCenter : sourceCenter;
      const remote = externalSource ? sourceCenter : targetCenter;
      const localScreen = local.clone().project(camera);
      const remoteScreen = remote.clone().project(camera);
      if (Math.abs(localScreen.x) < 1 && Math.abs(localScreen.y) < 1 && localScreen.z < 1
        && (Math.abs(remoteScreen.x) > .9 || Math.abs(remoteScreen.y) > .9 || remoteScreen.z > 1)) {
        const direction = remote.clone().sub(local).applyQuaternion(camera.quaternion.clone().invert());
        const extent = Math.max(Math.abs(direction.x), Math.abs(direction.y), .001);
        remote.set(direction.x / extent * .88, direction.y / extent * .55, localScreen.z).unproject(camera);
      }
    }
    const route = collisionSafeFleetCurve({
      missionId: mission.id,
      sourceCenter,
      targetCenter,
      sourceIsPlanet: !!source,
      targetIsPlanet: !!target || !!mission.destinationOrbit,
      bodies,
      sourceId: mission.sourceId,
      targetId: mission.destinationId,
      sourceClearance: source ? occupiedSystemPlanetRadius(source) * 1.08 : 0,
      targetClearance: target ? occupiedSystemPlanetRadius(target) * 1.08 : mission.destinationClearance ?? 0,
      starClearance,
    });
    if (lastRouteLineUpdate.current < 0 || elapsed - lastRouteLineUpdate.current >= .2) {
      lastRouteLineUpdate.current = elapsed;
      setRoutePoints(route.getPoints(48).map((point) => point.toArray() as [number, number, number]));
    }
    const journeyProgress = missionJourneyProgress(mission, Date.now() / 1000, progressEpoch.current);
    // Once a leg finishes, the fleet is no longer physically travelling. Hide
    // both the ship and its route while it waits for resolution at the planet.
    routeGroup.current.visible = (mission.phase === "outbound" || mission.phase === "returning") && journeyProgress < 1;
    const routeProgress = mission.phase === "returned"
      ? 0
      : mission.phase === "returning" ? 1 - journeyProgress : journeyProgress;
    vessel.current.position.copy(route.getPointAt(routeProgress));
    vessel.current.scale.setScalar(readableFleetScale(camera.position.distanceTo(vessel.current.position), (camera as THREE.PerspectiveCamera).fov || 50, size.height));
    const direction = route.getTangentAt(Math.max(0, Math.min(.9999, routeProgress))).normalize();
    if (mission.phase === "returning") direction.multiplyScalar(-1);
    vessel.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  });
  if ((!source && !mission.sourceCoordinates) || (!target && !mission.destinationCoordinates && !mission.destinationOrbit)) return null;
  const color = mission.kind === "attack" ? "#ff586d" : mission.kind === "espionage" ? "#d998ff" : mission.kind === "colonize" ? "#ffc866" : "#45f4c1";
  return <group ref={routeGroup} visible={mission.phase === "outbound" || mission.phase === "returning"}>{routePoints.length > 1 && <><Line points={routePoints} color={color} transparent opacity={.12} lineWidth={1.5} /><Line points={routePoints} color={color} transparent opacity={.42} lineWidth={.72} dashed dashScale={3.2} dashSize={.24} gapSize={.34} /></>}
    <group ref={vessel} onPointerOver={event => { event.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>
      <MissionFleetVessel kind={mission.kind} shipClass={mission.shipClass} ownerAddress={mission.ownerAddress} color={color} compact={compact} />
      {(!compact || hovered) && (externalSource || externalTarget || count > 1) && <Html center position={[0, 2.6, 0]} zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}><span className="mission-vessel-label">{vesselLabel}{count > 1 ? ` · ${count} fleets` : ''}<small>{externalSource || externalTarget ? (inbound ? 'INBOUND' : 'OUTBOUND') : ''}</small></span></Html>}
    </group>
  </group>;
}

function TrafficBeacon({ point, position, orbit, height = 0, size = 1 }: { point: TrafficPoint; position: [number, number, number]; orbit?: UniverseOrbit; height?: number; size?: number }) {
  const group = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);
  const color = point.waiting ? '#ffc866' : point.arrivals ? '#45f4c1' : '#70baff';
  useFrame(({ clock, camera }) => {
    if (orbit) group.current.position.set(...pointOnUniverseOrbit(orbit, orbit.phase + clock.getElapsedTime() * orbit.angularVelocity));
    else group.current.position.set(...position);
    group.current.position.y += height;
    ring.current.quaternion.copy(camera.quaternion);
    ring.current.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 2.6) * .12);
  });
  return <group ref={group} position={position}>
    <mesh ref={ring} onPointerOver={event => { event.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>
      <torusGeometry args={[size * .7, size * .09, 6, 24]} /><meshBasicMaterial color={color} transparent opacity={.86} toneMapped={false} />
    </mesh>
    <mesh><sphereGeometry args={[size * .2, 8, 8]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
    {hovered && <Html center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}><div className="traffic-beacon-label">{point.key}<br />{trafficPointLabel(point)}</div></Html>}
  </group>;
}

export function StrategicFleetRoute({ mission, start, end, size }: { mission: UniverseMission; start: [number, number, number]; end: [number, number, number]; size: number }) {
  const dot = useRef<THREE.Group>(null!);
  const epoch = useRef(Date.now() / 1000);
  const curve = useMemo(() => {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const middle = a.clone().lerp(b, .5); middle.y += a.distanceTo(b) * .15;
    return new THREE.QuadraticBezierCurve3(a, middle, b);
  }, [start[0], start[1], start[2], end[0], end[1], end[2]]);
  const points = useMemo(() => curve.getPoints(40).map(point => point.toArray() as [number, number, number]), [curve]);
  useFrame(({ camera, size: viewport }) => {
    const progress = missionJourneyProgress(mission, Date.now() / 1000, epoch.current);
    dot.current.visible = progress < 1;
    dot.current.position.copy(curve.getPoint(mission.phase === 'returning' ? 1 - progress : progress));
    dot.current.scale.setScalar(strategicFleetScale(camera.position.distanceTo(dot.current.position), (camera as THREE.PerspectiveCamera).fov || 50, viewport.height, size * 1.8));
    const tangent = curve.getTangent(mission.phase === 'returning' ? 1 - progress : progress).normalize();
    if (mission.phase === 'returning') tangent.negate();
    dot.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  });
  return <group><Line points={points} color="#6fdbd1" transparent opacity={.48} lineWidth={1} />
    <group ref={dot} scale={size * 1.8}><TravelFleetVessel kind={mission.kind} shipClass={mission.shipClass} ownerAddress={mission.ownerAddress} color="#d5fff4" compact /></group>
  </group>;
}

export function GalaxyFleetRoute({ mission, start, end, remoteAt, remoteGalaxy, count = 1, dense = false }: { mission: UniverseMission; start: [number, number, number]; end: [number, number, number]; remoteAt: 'start' | 'end' | null; remoteGalaxy: number; count?: number; dense?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const vessel = useRef<THREE.Group>(null!);
  const route = useRef<THREE.Group>(null!);
  const boundaryRing = useRef<THREE.Mesh>(null!);
  const epoch = useRef(Date.now() / 1000);
  const curve = useMemo(() => {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const middle = a.clone().lerp(b, .5); middle.y += a.distanceTo(b) * .15;
    return new THREE.QuadraticBezierCurve3(a, middle, b);
  }, [start[0], start[1], start[2], end[0], end[1], end[2]]);
  const points = useMemo(() => curve.getPoints(40).map(point => point.toArray() as [number, number, number]), [curve]);
  const inbound = remoteAt === (mission.phase === 'returning' ? 'end' : 'start');
  const label = remoteAt ? (inbound ? 'Entering galaxy' : 'Leaving galaxy') : 'System transit';
  useFrame(({ camera, size }) => {
    if (remoteAt) boundaryRing.current.quaternion.copy(camera.quaternion);
    const progress = missionJourneyProgress(mission, Date.now() / 1000, epoch.current);
    route.current.visible = progress < 1;
    const p = mission.phase === 'returning' ? 1 - progress : progress;
    vessel.current.position.copy(curve.getPoint(p));
    const tangent = curve.getTangent(p).normalize();
    if (mission.phase === 'returning') tangent.negate();
    vessel.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    vessel.current.scale.setScalar(Math.max(.12, readableFleetScale(camera.position.distanceTo(vessel.current.position), (camera as THREE.PerspectiveCamera).fov || 50, size.height) * .55));
  });
  return <group ref={route} onPointerOver={event => { event.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>
    {points.length > 1 && <Line points={points} color="#6fdbd1" transparent opacity={.65} lineWidth={1.2} />}
    <group ref={vessel}><MissionFleetVessel kind={mission.kind} shipClass={mission.shipClass} ownerAddress={mission.ownerAddress} color="#6fdbd1" compact />
      {(!dense || hovered) && <Html center position={[0, 2.8, 0]} zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}><span className="mission-vessel-label">{label}{count > 1 ? ` · ${count} fleets` : ''}</span></Html>}
    </group>
    {remoteAt && <group position={remoteAt === 'start' ? start : end}><mesh ref={boundaryRing}><torusGeometry args={[.42, .055, 6, 24]} /><meshBasicMaterial color="#a9ebdd" transparent opacity={.9} toneMapped={false} /></mesh>
      {(!dense || hovered) && <Html center position={[0, 1.2, 0]} zIndexRange={[2, 0]} style={{ pointerEvents: 'none' }}><span className="mission-vessel-label" data-world-position={(remoteAt === 'start' ? start : end).join(',')}>{inbound ? 'From' : 'To'} galaxy {remoteGalaxy}</span></Html>}
    </group>}
  </group>;
}

function MissionTrafficLayer({ snapshot, level, galaxy, system, planets, star }: { snapshot: UniverseSnapshot; level: ZoomLevel; galaxy: number; system: number; planets: UniversePlanet[]; star: StarDefinition }) {
  const points = useMemo(() => missionTrafficPoints(snapshot, { level, galaxy, system }), [snapshot, level, galaxy, system]);
  const flights = useMemo(() => missionRenderGroups(snapshot, { level, galaxy, system }), [snapshot, level, galaxy, system]);
  const strategicPosition = (location: MissionLocation): [number, number, number] => level === 'galaxy'
    ? galaxySystemLayout(location.galaxy, location.system).position
    : new THREE.Vector3(...universeGalaxyPosition(location.galaxy)).applyEuler(new THREE.Euler(-.23, .4, -.08)).toArray() as [number, number, number];
  return <group>
    {points.slice(0, 64).map(point => {
      if (level !== 'system') return <TrafficBeacon key={point.key} point={point} position={strategicPosition(point.location)} size={level === 'universe' ? 16 : .28} height={level === 'universe' ? 18 : .5} />;
      if (!point.waiting) return null;
      const planet = planets.find(planet => Number(planet.system.split(':')[2]) === point.location.position);
      const orbit = planet?.orbit ?? emptySystemDisplayOrbit(point.location.position, galaxy, system, SYSTEM_ORBIT_PRESENTATION_SCALE, systemStarOrbitOffset(star));
      const height = planet ? occupiedSystemPlanetRadius(planet) * 1.7 : emptySystemPlanetRadius(point.location.position, galaxy, system, orbit) * 1.7;
      return <TrafficBeacon key={point.key} point={point} position={pointOnUniverseOrbit(orbit)} orbit={orbit} height={height} size={.8} />;
    })}
    {level !== 'system' && flights.groups.map(({ mission, count, key }) => {
      if (mission.phase !== 'outbound' && mission.phase !== 'returning') return null;
      const endpoints = missionEndpoints(mission, snapshot.planets);
      if (!endpoints || !missionVisibleAtScale(endpoints.source, endpoints.target, level)) return null;
      if (level === 'galaxy') {
        const leg = galaxyTravelEndpoints(endpoints.source, endpoints.target, galaxy, location => galaxySystemLayout(location.galaxy, location.system).position, universeGalaxyPosition);
        return leg ? <GalaxyFleetRoute key={key} mission={mission} count={count} dense={flights.total > 16} {...leg} remoteGalaxy={leg.remoteAt === 'start' ? endpoints.source.galaxy : endpoints.target.galaxy} /> : null;
      }
      return <StrategicFleetRoute key={mission.id} mission={mission} start={strategicPosition(endpoints.source)} end={strategicPosition(endpoints.target)} size={level === 'universe' ? 5 : .18} />;
    })}
  </group>;
}

function WebGLContextMonitor({ onContextLost }: { onContextLost: () => void; onSceneReady?: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () => canvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [gl, onContextLost]);
  return null;
}

function SectorScene({ snapshot, selected, level, fullUniverse, galaxySectorStart, selectedGalaxy, selectedSystem, cameraZoom, galaxyPopulations, systems, onSelect, onEmptySlotSelect, onLevelChange, onGalaxySelect, onSystemSelect, onFullGalaxySelect, onContextLost, onSceneReady }: { snapshot: UniverseSnapshot; selected: UniversePlanet | null; level: ZoomLevel; fullUniverse: boolean; galaxySectorStart: number; selectedGalaxy: number; selectedSystem: number; cameraZoom: { id: number; direction: "in" | "out" }; galaxyPopulations: Map<number, number>; systems: GalaxySystem[]; onSelect: (planet: UniversePlanet) => void; onEmptySlotSelect: (target: { galaxy: number; system: number; position: number }) => void; onLevelChange: (level: ZoomLevel) => void; onGalaxySelect: (galaxy: number) => void; onSystemSelect: (system: number) => void; onFullGalaxySelect: (galaxy: number) => void; onContextLost: () => void; onSceneReady?: () => void }) {
  const galaxies = useMemo(() => buildGalaxySector(galaxySectorStart, galaxyPopulations), [galaxySectorStart, galaxyPopulations]);
  const currentStar = starForSystem(selectedGalaxy, selectedSystem);
  const compactUniverseViewport = typeof window !== "undefined" && window.innerWidth <= 700;
  const universeFocus = useMemo(() => {
    const focus = new THREE.Vector3(...universeGalaxyPosition(selectedGalaxy));
    focus.applyEuler(new THREE.Euler(-.23, .4, -.08));
    return focus.toArray() as [number, number, number];
  }, [selectedGalaxy]);
  const galaxyFocus = useMemo(() => systems[Math.max(0, Math.min(systems.length - 1, selectedSystem - 1))]?.position ?? [0, 0, 0] as [number, number, number], [selectedSystem, systems]);
  const universeCameraOffset: [number, number, number] = [0, compactUniverseViewport ? 12 : 20, compactUniverseViewport ? 950 : 1_550];
  const galaxyCameraOffset: [number, number, number] = [0, 18, 28];
  const cameraPosition: [number, number, number] = level === "universe" && fullUniverse
    ? [universeFocus[0] + universeCameraOffset[0], universeFocus[1] + universeCameraOffset[1], universeFocus[2] + universeCameraOffset[2]]
    : level === "universe" ? [0, 18, 190]
      : level === "galaxy" ? [galaxyFocus[0] + galaxyCameraOffset[0], galaxyFocus[1] + galaxyCameraOffset[1], galaxyFocus[2] + galaxyCameraOffset[2]]
        : [0, systemSurveyCameraDistance(currentStar) * .492, systemSurveyCameraDistance(currentStar) * .871];
  // The global map is bounded, but players can still approach any region of it.
  const cameraMinDistance = level === "universe" ? (fullUniverse ? 70 : 30) : level === "galaxy" ? 8 : 10;
  const cameraMaxDistance = level === "universe" ? (fullUniverse ? 5200 : 620) : level === "galaxy" ? 160 : 620;
  const targetLimit = level === "universe" ? (fullUniverse ? 2500 : 80) : level === "galaxy" ? 62 : 260;
  const controls = useRef<any>(null);
  const currentSystemPlanets = useMemo(() => snapshot.planets.filter((planet) => {
    const [galaxy, system] = planet.system.split(":").map(Number);
    return galaxy === selectedGalaxy && system === selectedSystem;
  }).sort((left, right) => Number(left.system.split(":")[2]) - Number(right.system.split(":")[2])), [snapshot.planets, selectedGalaxy, selectedSystem]);
  const currentSystemDisplayPlanets = useMemo(() => currentSystemPlanets.map((planet, index) => {
    const displayOrbit = occupiedPlanetDisplayOrbit(planet, index);
    const clearedOrbit = { ...displayOrbit, radius: displayOrbit.radius + systemStarOrbitOffset(currentStar) };
    return { ...planet, orbit: clearedOrbit, coordinates: pointOnUniverseOrbit(clearedOrbit) };
  }), [currentStar, currentSystemPlanets]);
  const systemFocusPlanet = currentSystemDisplayPlanets.find((planet) => planet.id === selected?.id) ?? null;
  const systemCompositionKey = `${selectedGalaxy}:${selectedSystem}:${systemFocusPlanet?.id ?? "star"}`;
  const currentSystemMissions = useMemo(() => {
    const planetIds = new Set(currentSystemDisplayPlanets.map((planet) => planet.id));
    const traffic = missionRenderGroups(snapshot, { level: 'system', galaxy: selectedGalaxy, system: selectedSystem });
    return traffic.groups.flatMap(({ mission, count }) => {
      // Arrived fleets are stored on-chain until their mission is resolved, but
      // they should not remain parked in the space scene. Returned fleets are
      // likewise no longer an active flight.
      if (mission.phase === "arrived" || mission.phase === "returned") return [];
      const sourceHere = planetIds.has(mission.sourceId);
      const destinationHere = planetIds.has(mission.destinationId) || missionDestinationIsLocal(mission, selectedGalaxy, selectedSystem);
      if (!sourceHere && !destinationHere) return [];
      const emptyTarget = destinationHere && !planetIds.has(mission.destinationId) && mission.destinationPosition;
      const destinationOrbit = emptyTarget ? emptySystemDisplayOrbit(emptyTarget.position, selectedGalaxy, selectedSystem, SYSTEM_ORBIT_PRESENTATION_SCALE, systemStarOrbitOffset(currentStar)) : undefined;
      const localMission = { ...mission, destinationOrbit, trafficCount: count, compactFleet: traffic.total > 16,
        destinationClearance: destinationOrbit && emptyTarget ? emptySystemPlanetRadius(emptyTarget.position, selectedGalaxy, selectedSystem, destinationOrbit) * 1.08 : undefined };
      if (sourceHere && destinationHere) return [localMission];

      // Cross-system missions are real on-chain routes, but their remote planet
      // is outside this system scene. Project that endpoint beyond the last
      // orbit so inbound fleets arrive from deep space and outbound fleets leave
      // toward it instead of appearing from the origin or being filtered out.
      const outerOrbit = emptySystemDisplayOrbit(15, selectedGalaxy, selectedSystem, SYSTEM_ORBIT_PRESENTATION_SCALE, systemStarOrbitOffset(currentStar)).radius;
      const externalPoint = systemEntryPoint(mission.id, outerOrbit);
      return [{
        ...localMission,
        sourceCoordinates: sourceHere ? mission.sourceCoordinates : externalPoint,
        destinationCoordinates: destinationHere ? mission.destinationCoordinates : externalPoint,
      }];
    });
  }, [currentSystemDisplayPlanets, snapshot.missions, selectedGalaxy, selectedSystem, currentStar]);
  const currentGalaxyKind = galaxyKindForId(selectedGalaxy);
  const starLabelOffset = -(systemStarClearanceRadius(currentStar) * 1.34);
  return <Canvas dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: "high-performance" }} onCreated={({ gl }) => { gl.setClearColor("#01030a"); gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.08; }}>
    <Suspense fallback={null}>
    <WebGLContextMonitor onContextLost={onContextLost} />
    <PerspectiveCamera makeDefault position={cameraPosition} near={level === "universe" && fullUniverse ? 2 : .1} far={level === "universe" && fullUniverse ? 12_000 : 2_000} fov={level === "universe" && fullUniverse ? 42 : level === "universe" ? 42 : level === "galaxy" ? 36 : 34} />
    <CinematicSpaceEnvironment radius={fullUniverse ? 6000 : 260} opacity={level === "universe" && fullUniverse ? .42 : .78} />
    <CinematicDepthField radius={level === "universe" && fullUniverse ? 5_400 : level === "galaxy" ? 210 : 560} count={level === "system" ? 520 : 760} opacity={level === "system" ? .34 : .25} />
    <ambientLight intensity={level === "system" ? .34 : .12} /><hemisphereLight color="#cfe7ff" groundColor="#101522" intensity={level === "system" ? .82 : .16} /><pointLight position={[0, 0, 0]} color="#fff0cf" intensity={level === "system" ? 42 : 16} distance={level === "system" ? 160 : 38} decay={1.7} />
    <directionalLight position={[-18, 12, 9]} color="#5a78b8" intensity={.55} />
    {level === "universe" && fullUniverse ? <DeepUniverseStarfield /> : null}
    {level === "universe" && <>
      {fullUniverse ? <FullUniverseOverview populations={galaxyPopulations} onSelect={onFullGalaxySelect} /> : galaxies.map((galaxy) => <GalaxyNode key={galaxy.id} galaxy={galaxy} selected={galaxy.id === `g-${selectedGalaxy}`} onSelect={() => { onGalaxySelect(Number(galaxy.label)); onLevelChange("galaxy"); }} />)}
      <Html center position={[universeFocus[0], universeFocus[1] - 360, universeFocus[2] + 30]} zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}><div className="scene-caption universe-scale-caption"><span>LOCAL SUPERCLUSTER SURVEY</span><b>SCROLL OUT FOR ALL 999 GALAXIES · SELECT A LIGHT SOURCE TO APPROACH</b></div></Html>
    </>}
    {level === "galaxy" && <>
      <GalaxyEnvironment galaxy={selectedGalaxy} />
      <GalaxyBlackHole galaxy={selectedGalaxy} kind={currentGalaxyKind} color={GALAXY_COLORS[selectedGalaxy % GALAXY_COLORS.length]} />
      <GalaxyStarField systems={systems} />
      {systems.map((system) => <SystemNode key={system.id} system={system} onSelect={() => { onSystemSelect(Number(system.label)); onLevelChange("system"); }} />)}
      <Html center position={[0, -6.1, 0]} zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}><div className="scene-caption">{`GALAXY ${selectedGalaxy} · ${currentGalaxyKind.toUpperCase()} · ${SYSTEMS_PER_GALAXY} SYSTEMS · ${systems.filter((system) => system.occupied).length} OCCUPIED`}</div></Html>
    </>}
    {level === "system" && <group>
      <SystemNebulaDepth seed={selectedGalaxy * 1000 + selectedSystem} color={currentStar.color} />
      <HeroStar star={currentStar} seed={selectedGalaxy * 1000 + selectedSystem} />
      <Html center position={[0, starLabelOffset, 0]} distanceFactor={42} zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
        <div className="system-star-label">
          <b>G {selectedGalaxy} · S {selectedSystem}</b>
          <span>{currentStar.label.toUpperCase()} · {currentSystemPlanets.length} OCCUPIED {currentSystemPlanets.length === 1 ? "PLANET" : "PLANETS"}</span>
        </div>
      </Html>
      {Array.from({ length: PLANETS_PER_SYSTEM }, (_, index) => index + 1).map((position) => {
        const planet = currentSystemDisplayPlanets.find((candidate) => Number(candidate.system.split(":")[2]) === position);
        const displayOrbit = planet?.orbit ?? emptySystemDisplayOrbit(position, selectedGalaxy, selectedSystem, SYSTEM_ORBIT_PRESENTATION_SCALE, systemStarOrbitOffset(currentStar));
        return <React.Fragment key={planet?.id ?? `empty-${position}`}><OrbitPath orbit={displayOrbit} faction={planet?.faction} active={planet?.id === selected?.id} />{planet ? <PlanetNode planet={planet} displayOrbit={displayOrbit} active={selected?.id === planet.id} onSelect={() => onSelect(planet)} /> : <EmptyPlanetSlot position={position} galaxy={selectedGalaxy} system={selectedSystem} orbit={displayOrbit} onSelect={() => onEmptySlotSelect({ galaxy: selectedGalaxy, system: selectedSystem, position })} />}</React.Fragment>;
      })}
      {currentSystemMissions.map((mission) => <FleetRoute key={mission.id} mission={mission} count={mission.trafficCount} compact={mission.compactFleet} planets={currentSystemDisplayPlanets} starClearance={systemStarClearanceRadius(currentStar) + 1.8} />)}
    </group>}
    <MissionTrafficLayer snapshot={snapshot} level={level} galaxy={selectedGalaxy} system={selectedSystem} planets={currentSystemDisplayPlanets} star={currentStar} />
    <OrbitControls ref={controls} enablePan enableDamping dampingFactor={0.08} minDistance={cameraMinDistance} maxDistance={cameraMaxDistance} maxPolarAngle={Math.PI * 0.82} minPolarAngle={Math.PI * 0.22} autoRotate={false} />
    <FocusedLevelCamera controls={controls} enabled={level === "universe" && fullUniverse} target={universeFocus} offset={universeCameraOffset} />
    <FocusedLevelCamera controls={controls} enabled={level === "galaxy"} target={galaxyFocus} offset={galaxyCameraOffset} />
    <SystemCameraComposition controls={controls} enabled={level === "system"} star={currentStar} focusPlanet={systemFocusPlanet} compositionKey={systemCompositionKey} />
    <BoundedCameraTarget controls={controls} limit={targetLimit} />
    <CameraZoom command={cameraZoom} controls={controls} minDistance={cameraMinDistance} maxDistance={cameraMaxDistance} />
    <SceneReady sceneKey={`${level}:${selectedGalaxy}:${selectedSystem}`} onReady={onSceneReady} />
    </Suspense>
  </Canvas>;
}

function CompatibilityUniverseScene({ snapshot, level, selectedGalaxy, selectedSystem, galaxyPopulations, systems, onSelect, onEmptySlotSelect, onLevelChange, onGalaxySelect, onSystemSelect }: { snapshot: UniverseSnapshot; level: ZoomLevel; selectedGalaxy: number; selectedSystem: number; galaxyPopulations: Map<number, number>; systems: GalaxySystem[]; onSelect: (planet: UniversePlanet) => void; onEmptySlotSelect: (target: { galaxy: number; system: number; position: number }) => void; onLevelChange: (level: ZoomLevel) => void; onGalaxySelect: (galaxy: number) => void; onSystemSelect: (system: number) => void }) {
  const knownGalaxies = useMemo(() => {
    const galaxies = new Set<number>([selectedGalaxy, ...galaxyPopulations.keys()]);
    return [...galaxies].sort((a, b) => a - b);
  }, [galaxyPopulations, selectedGalaxy]);
  const availableSystems = useMemo(() => {
    const occupied = systems.filter((system) => system.occupied);
    const current = systems.find((system) => Number(system.label) === selectedSystem);
    return current && !occupied.includes(current) ? [current, ...occupied] : occupied;
  }, [selectedSystem, systems]);
  const currentSystemPlanets = useMemo(() => snapshot.planets.filter((planet) => {
    const [galaxy, system] = planet.system.split(":").map(Number);
    return galaxy === selectedGalaxy && system === selectedSystem;
  }), [selectedGalaxy, selectedSystem, snapshot.planets]);

  return <div className="compat-universe" role="region" aria-label="Compatibility universe navigator">
    <div className="compat-universe-heading"><span>COMPATIBILITY NAVIGATION</span><b>{level.toUpperCase()}</b></div>
    {level === "universe" && <>
      <h2>Known galaxies</h2>
      <p>This device is using the lightweight map. All navigation and planet actions remain available.</p>
      <div className="compat-grid galaxies">{knownGalaxies.map((galaxy) => <button key={galaxy} className={galaxy === selectedGalaxy ? "is-active" : ""} onClick={() => { onGalaxySelect(galaxy); onLevelChange("galaxy"); }}><span>GALAXY</span><b>{String(galaxy).padStart(3, "0")}</b><small>{galaxyPopulations.get(galaxy) ?? 0} ON-CHAIN WORLDS</small></button>)}</div>
    </>}
    {level === "galaxy" && <>
      <h2>Galaxy {selectedGalaxy}</h2>
      <p>{availableSystems.filter((system) => system.occupied).length} occupied systems detected. Use the coordinate controls above to visit any other system.</p>
      <div className="compat-grid systems">{availableSystems.map((system) => <button key={system.id} className={Number(system.label) === selectedSystem ? "is-active" : ""} onClick={() => { onSystemSelect(Number(system.label)); onLevelChange("system"); }}><span>{system.star.label}</span><b>SYSTEM {system.label}</b><small>{system.planetCount} PLANETS</small></button>)}</div>
    </>}
    {level === "system" && <>
      <h2>Galaxy {selectedGalaxy} · System {selectedSystem}</h2>
      <p>{starForSystem(selectedGalaxy, selectedSystem).label} · Select a planet or an empty position.</p>
      <div className="compat-orbits">{Array.from({ length: PLANETS_PER_SYSTEM }, (_, index) => index + 1).map((position) => {
        const planet = currentSystemPlanets.find((candidate) => Number(candidate.system.split(":")[2]) === position);
        return <button key={position} className={planet ? `has-planet faction-${planet.faction}` : "is-empty"} onClick={() => planet ? onSelect(planet) : onEmptySlotSelect({ galaxy: selectedGalaxy, system: selectedSystem, position })}><span className="compat-planet-dot" /><span><b>{planet?.name ?? `Empty position ${position}`}</b><small>POSITION {position}{planet ? ` · ${planet.faction.toUpperCase()}` : ""}</small></span><em>{planet ? "SELECT" : "TARGET"}</em></button>;
      })}</div>
    </>}
  </div>;
}

export default function UniverseLab({ embedded = false, productionUi = false, initialEmpireOpen, onOpenCommand, onOpenEmptyTarget, onNavigationLevelChange, ownedPlanets = [], activeOwnedPlanet, onOperatePlanet, initialGalaxy, initialSystem, sponsorTokenAccounts, onSceneReady }: { embedded?: boolean; productionUi?: boolean; initialEmpireOpen?: boolean; onOpenCommand?: (planet: UniversePlanet) => void; onOpenEmptyTarget?: (target: { galaxy: number; system: number; position: number }) => void; onNavigationLevelChange?: (level: ZoomLevel) => void; ownedPlanets?: UniverseOwnedPlanet[]; activeOwnedPlanet?: string; onOperatePlanet?: (planet: UniverseOwnedPlanet) => void; initialGalaxy?: number; initialSystem?: number; sponsorTokenAccounts?: SponsoredTokenAccountBuilder; onSceneReady?: () => void }) {
  const demoParams = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const localSystemDemo = import.meta.env.DEV && ["full", "colony", "traffic"].includes(demoParams?.get("system-demo") ?? "");
  const localColonyDemo = import.meta.env.DEV && demoParams?.get("system-demo") === "colony";
  const demoGalaxy = Math.max(1, Math.min(MAX_GALAXY, Number(demoParams?.get("galaxy")) || 3));
  const demoSystem = Math.max(1, Math.min(SYSTEMS_PER_GALAXY, Number(demoParams?.get("system")) || 293));
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();
  const [snapshot, setSnapshot] = useState<UniverseSnapshot | null>(null);
  const [selected, setSelected] = useState<UniversePlanet | null>(null);
  const [hudOpen, setHudOpen] = useState(() => initialEmpireOpen ?? (typeof window === "undefined" || !window.matchMedia("(max-width: 700px)").matches));
  const empireToggleRef = useRef<HTMLButtonElement>(null);
  const empireCloseRef = useRef<HTMLButtonElement>(null);
  const empireOpenedByControlRef = useRef(false);
  const empireRestoreFocusRef = useRef(false);
  const [viewContextOpen, setViewContextOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 700px)").matches);
  const [zoomLevel, commitZoomLevel] = useState<ZoomLevel>(initialGalaxy && initialSystem || localSystemDemo ? "system" : "universe");
  const mapTransit = useSceneTransit();
  const setZoomLevel = (level: ZoomLevel) => {
    if (level === zoomLevel) return;
    mapTransit.begin(() => commitZoomLevel(level), level === 'universe' ? 'Universe' : level === 'galaxy' ? 'Galaxy' : 'System');
  };
  const sceneReady = () => { mapTransit.ready(); onSceneReady?.(); };
  const fullUniverse = true;
  const [galaxyPopulations, setGalaxyPopulations] = useState<Map<number, number>>(() => new Map());
  const [selectedGalaxy, setSelectedGalaxy] = useState(initialGalaxy ?? (localSystemDemo ? demoGalaxy : 1));
  const [selectedSystem, setSelectedSystem] = useState(initialSystem ?? (localSystemDemo ? demoSystem : 1));
  const [cameraZoom, setCameraZoom] = useState<{ id: number; direction: "in" | "out" }>({ id: 0, direction: "in" });
  const [galaxyInput, setGalaxyInput] = useState(String(initialGalaxy ?? (localSystemDemo ? demoGalaxy : 1)));
  const [systemInput, setSystemInput] = useState(String(initialSystem ?? (localSystemDemo ? demoSystem : 1)));
  const [graphicsMode, setGraphicsMode] = useState<GraphicsMode>(detectUniverseGraphicsMode);
  useEffect(() => {
    if (graphicsMode === 'compat' && snapshot) { mapTransit.ready(); onSceneReady?.(); }
  }, [graphicsMode, snapshot, zoomLevel, selectedGalaxy, selectedSystem, mapTransit.ready, onSceneReady]);
  useEffect(() => onNavigationLevelChange?.(zoomLevel), [onNavigationLevelChange, zoomLevel]);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches) {
      setViewContextOpen(false);
    }
  }, [zoomLevel]);
  const [sovereignties, setSovereignties] = useState<SystemSovereigntyAccount[]>([]);
  const [governanceConfigs, setGovernanceConfigs] = useState<AllianceGovernanceConfigAccount[]>([]);
  const [allianceDecisions, setAllianceDecisions] = useState<AllianceDecisionAccount[]>([]);
  const [allianceDirectory, setAllianceDirectory] = useState<AllianceStateAccount[]>([]);
  const [governanceLoaded, setGovernanceLoaded] = useState(false);
  const [liveDecisionMarkets, setLiveDecisionMarkets] = useState<LiveDecisionMarket[]>([]);
  const [marketDirectoryLoading, setMarketDirectoryLoading] = useState(true);
  const [marketDirectoryError, setMarketDirectoryError] = useState("");
  const [marketHubOpen, setMarketHubOpen] = useState(false);
  const [marketHubView, setMarketHubView] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [marketSearch, setMarketSearch] = useState("");
  const [marketStatusFilter, setMarketStatusFilter] = useState("ALL");
  const [marketSort, setMarketSort] = useState<"URGENT" | "NEWEST" | "OLDEST">("URGENT");
  const [marketVisibleCount, setMarketVisibleCount] = useState(12);
  const marketHubCloseRef = useRef<HTMLButtonElement>(null);
  const marketHubWorkspaceRef = useRef<HTMLElement>(null);
  const marketHubOpenerRef = useRef<HTMLElement | null>(null);
  const openMarketHub = (opener: HTMLElement | null) => {
    marketHubOpenerRef.current = opener;
    setMarketHubOpen(true);
  };
  const [sovereigntyReadState, setSovereigntyReadState] = useState<"loading" | "ready" | "error">("loading");
  const [futarchyDaoLive, setFutarchyDaoLive] = useState(false);
  const [futarchyProposalLive, setFutarchyProposalLive] = useState(false);
  const [decisionMarket, setDecisionMarket] = useState<DecisionMarketSnapshot | null>(null);
  const [decisionMarketError, setDecisionMarketError] = useState("");
  const [systemTradeMode, setSystemTradeMode] = useState<"BUY" | "SELL">("BUY");
  const [tradeAmount, setTradeAmount] = useState("1");
  const [tradeSlippage, setTradeSlippage] = useState("2");
  const [tradeBusy, setTradeBusy] = useState<DecisionMarketSide | null>(null);
  const [tradeStatus, setTradeStatus] = useState("");
  const [sovereigntyPanelOpen, setSovereigntyPanelOpen] = useState(false);
  const sovereigntyCloseRef = useRef<HTMLButtonElement>(null);
  const sovereigntyOpenerRef = useRef<HTMLElement | null>(null);
  const openSovereigntyPanel = (opener: HTMLElement | null = null) => {
    sovereigntyOpenerRef.current = opener;
    setSovereigntyPanelOpen(true);
  };
  const [planetSearch, setPlanetSearch] = useState("");
  const [planetSort, setPlanetSort] = useState<"ATTENTION" | "ACTIVE" | "COORDINATES" | "NAME">("ATTENTION");
  const [planetGalaxyFilter, setPlanetGalaxyFilter] = useState<"ALL" | number>("ALL");
  const [planetVisibleCount, setPlanetVisibleCount] = useState(12);
  const centeredOwnedPlanetRef = useRef<string | null>(null);
  const systemEntryFocusRef = useRef("");
  const preferredOwnedPlanetRef = useRef<string | null>(activeOwnedPlanet || ownedPlanets[0]?.entity || null);
  preferredOwnedPlanetRef.current = activeOwnedPlanet || ownedPlanets[0]?.entity || null;

  const mapToSnapshot = (chainPlanets: Array<{
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
    missions: any[];
  }>) => {
    return createUniverseSnapshotFromChainData(
      chainPlanets.map((planet) => ({
        ...planet,
        smallCargo: planet.smallCargo,
        largeCargo: planet.largeCargo,
        lightFighter: planet.lightFighter,
        heavyFighter: planet.heavyFighter,
        cruiser: planet.cruiser,
        battleship: planet.battleship,
        battlecruiser: planet.battlecruiser,
        bomber: planet.bomber,
        destroyer: planet.destroyer,
        deathstar: planet.deathstar,
        missions: planet.missions,
      })),
      { viewer: publicKey?.toBase58() ?? null },
    );
  };

  const applySnapshot = (next: UniverseSnapshot) => {
    const populations = new Map<number, number>();
    setSelected((current) => {
      if (current?.id) {
        const refreshedCurrent = next.planets.find((planet) => planet.id === current.id);
        if (refreshedCurrent) return refreshedCurrent;
      }
      const preferredOwnedId = preferredOwnedPlanetRef.current;
      return next.planets.find((planet) => planet.id === preferredOwnedId) ?? next.planets[0] ?? null;
    });
    setSnapshot(next);
    for (const planet of next.planets) {
      const galaxy = Number(planet.system.split(":")[0]);
      populations.set(galaxy, (populations.get(galaxy) ?? 0) + 1);
    }
    setGalaxyPopulations(populations);
    // Empty coordinates remain valid destinations. A partial RPC refresh must
    // never pull the camera away from a system the player explicitly chose.
  };

  const fetchFallbackUniverse = async () => {
    const publicPlanets = await fetchAllPublicPlanets(connection);
    const fallbackSnapshot = snapshotFromPublicPlanets(
      publicPlanets.map((planet) => ({
        entity: planet.entity,
        owner: planet.owner,
        name: planet.name,
        galaxy: planet.galaxy,
        system: planet.system,
        position: planet.position,
        planetIndex: planet.planetIndex,
      })),
    );
    applySnapshot(fallbackSnapshot);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (localSystemDemo) {
        const fixture = createFullSystemVisualDemo(demoGalaxy, demoSystem);
        if (demoParams?.get("system-demo") === "traffic") {
          fixture.planets = fixture.planets.slice(0, 2);
          fixture.planets[1].ownerLabel = 'Fv9x...Rvdd';
          fixture.planets[1].ownerAddress = 'Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd';
          const source = { galaxy: demoGalaxy, system: demoSystem, position: 1 };
          fixture.missions = [
            { galaxy: demoGalaxy, system: demoSystem, position: 2 },
            { galaxy: demoGalaxy, system: demoSystem === 999 ? 998 : demoSystem + 1, position: 2 },
            { galaxy: demoGalaxy === 999 ? 998 : demoGalaxy + 1, system: 1, position: 2 },
          ].map((destinationPosition, index) => ({ id: `local-traffic-${index}`, sourceId: fixture.planets[0].id,
            sourcePosition: source, destinationId: `traffic-target-${index}`, destinationPosition,
            kind: 'transport', phase: 'outbound', progress: .35, etaSeconds: 2340, durationSeconds: 3600, sampledAt: Date.now() / 1000 }));
          fixture.missions.push({ id: 'local-incoming-ship', sourceId: 'remote-system', destinationId: fixture.planets[1].id,
            sourcePosition: { galaxy: demoGalaxy, system: demoSystem === 999 ? 998 : demoSystem + 1, position: 1 },
            destinationPosition: { galaxy: demoGalaxy, system: demoSystem, position: 2 },
            kind: 'colonize', phase: 'outbound', progress: .35, etaSeconds: 23400, durationSeconds: 36000, sampledAt: Date.now() / 1000 });
          const trafficLoad = Math.max(0, Math.min(10_000, Math.trunc(Number(demoParams?.get('traffic-load')) || 0)));
          if (trafficLoad) fixture.missions = Array.from({ length: trafficLoad }, (_, index) => ({
            ...fixture.missions[index % fixture.missions.length], id: `stress-${index}`, sourceId: `stress-source-${index}`,
            sourcePosition: { galaxy: demoGalaxy, system: ((demoSystem + 1 + index % 998) % 999) + 1, position: 1 },
            destinationId: fixture.planets[1].id, destinationPosition: { galaxy: demoGalaxy, system: demoSystem, position: 2 },
          }));
        }
        if (localColonyDemo) {
          fixture.planets = fixture.planets.slice(0, 1);
          fixture.missions = [{ id: 'local-colony-to-empty-slot', sourceId: fixture.planets[0].id,
            destinationId: `G${demoGalaxy}S${demoSystem}P2`, destinationPosition: { galaxy: demoGalaxy, system: demoSystem, position: 2 },
            kind: 'colonize', phase: 'outbound', progress: .82, etaSeconds: 648, durationSeconds: 3600 }];
        }
        applySnapshot(fixture);
        return;
      }
      try {
        const chainPlanets = await fetchUniverseMapData(connection);
        if (cancelled) return;
        if (!chainPlanets || chainPlanets.length === 0) throw new Error("No on-chain planets");
        applySnapshot(mapToSnapshot(chainPlanets));
        return;
      } catch {
        if (cancelled) return;
        try {
          await fetchFallbackUniverse();
        } catch {
        }
      }
    };

    void load();
    if (localSystemDemo) return () => { cancelled = true; };
    const timer = setInterval(() => {
      void load();
    }, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connection, publicKey?.toBase58(), localSystemDemo, localColonyDemo, demoGalaxy, demoSystem]);
  useEffect(() => {
    let cancelled = false;
    const loadSovereignty = async () => {
      let governanceRead = false;
      try {
        const governance = await fetchAllianceGovernance(connection);
        if (cancelled) return;
        setGovernanceConfigs(governance.configs);
        setAllianceDecisions(governance.decisions);
        setGovernanceLoaded(true);
        setMarketDirectoryError("");
        governanceRead = true;
      } catch (error) {
        console.error("Alliance governance read failed", error);
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Alliance governance accounts could not be read.";
          setMarketDirectoryError(message);
        }
        /* Keep the last good governance snapshot and continue auxiliary reads. */
      }
      const [claims, alliances] = await Promise.allSettled([
        fetchSystemSovereignties(connection),
        fetchAllianceDirectory(connection),
      ]);
      if (cancelled) return;
      if (claims.status === "fulfilled") setSovereignties(claims.value);
      if (alliances.status === "fulfilled") setAllianceDirectory(alliances.value);
      if (governanceRead || claims.status === "fulfilled") {
        setSovereigntyReadState("ready");
      } else {
        setSovereigntyReadState("error");
      }
    };
    void loadSovereignty();
    const timer = setInterval(() => void loadSovereignty(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connection]);
  const refreshLiveDecisionMarkets = async () => {
    if (!governanceLoaded) {
      setMarketDirectoryLoading(true);
      return;
    }
    const candidates = allianceDecisions;
    if (candidates.length === 0) {
      setLiveDecisionMarkets([]);
      setMarketDirectoryError("");
      setMarketDirectoryLoading(false);
      return;
    }
    setMarketDirectoryLoading(true);
    const results = await mapSettledWithConcurrency(candidates, 5, async (decision): Promise<LiveDecisionMarket | null> => {
      const governance = governanceConfigs.find((config) => config.alliance === decision.alliance && config.enabled);
      if (!governance) return null;
      const market = await fetchDecisionMarket(connection, governance.dao, decision.externalProposal, publicKey);
      return {
        decision,
        governance,
        alliance: allianceDirectory.find((entry) => entry.publicKey === decision.alliance) ?? null,
        market,
      };
    });
    const live = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
    const failures = results.filter((result) => result.status === "rejected").length;
    const phasePriority = { TRADING: 0, STAKING: 1, FINALIZING: 2, PASSED: 3, FAILED: 4, EXECUTED: 5, UNKNOWN: 6 } as const;
    live.sort((a, b) => {
      const phaseDifference = phasePriority[marketPhase(a.market, a.decision.executed)] - phasePriority[marketPhase(b.market, b.decision.executed)];
      return phaseDifference || b.market.closesAt - a.market.closesAt;
    });
    setLiveDecisionMarkets(live);
    for (const entry of live.filter((candidate) => marketPhase(candidate.market, candidate.decision.executed) === "FINALIZING")) {
      void requestDecisionMarketFinalization(entry.decision.externalProposal).catch((error) => {
        console.warn("Automatic decision-market finalization trigger failed", error);
      });
    }
    setMarketDirectoryError(failures > 0 ? `${failures} market${failures === 1 ? "" : "s"} could not be read from devnet.` : "");
    setMarketDirectoryLoading(false);
  };
  useEffect(() => {
    void refreshLiveDecisionMarkets();
    const timer = window.setInterval(() => void refreshLiveDecisionMarkets(), marketHubOpen ? 30_000 : 60_000);
    return () => window.clearInterval(timer);
  }, [connection, publicKey?.toBase58(), governanceLoaded, allianceDecisions, governanceConfigs, allianceDirectory, marketHubOpen]);
  useEffect(() => {
    if (!marketHubOpen) return;
    const previousOverflow = document.body.style.overflow;
    const opener = marketHubOpenerRef.current;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => marketHubCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMarketHubOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const workspace = marketHubWorkspaceRef.current;
      if (!workspace) return;
      const controls = Array.from(workspace.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((control) => control.getClientRects().length > 0);
      if (controls.length === 0) {
        event.preventDefault();
        workspace.focus();
        return;
      }
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
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, [marketHubOpen]);
  useEffect(() => {
    if (!sovereigntyPanelOpen) return;
    const opener = sovereigntyOpenerRef.current;
    const focusFrame = opener ? window.requestAnimationFrame(() => sovereigntyCloseRef.current?.focus()) : 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.getElementById("decision-market-hub-title")) return;
      event.preventDefault();
      setSovereigntyPanelOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, [sovereigntyPanelOpen]);
  useEffect(() => {
    if (!hudOpen) return;
    const openedByControl = empireOpenedByControlRef.current;
    const focusFrame = openedByControl ? window.requestAnimationFrame(() => empireCloseRef.current?.focus()) : 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.getElementById("decision-market-hub-title") || document.getElementById("system-intel-panel")) return;
      event.preventDefault();
      empireRestoreFocusRef.current = true;
      setHudOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      if (empireRestoreFocusRef.current) {
        empireRestoreFocusRef.current = false;
        window.requestAnimationFrame(() => empireToggleRef.current?.focus());
      }
      empireOpenedByControlRef.current = false;
    };
  }, [hudOpen]);
  useEffect(() => {
    let cancelled = false;
    const loadDecisionMarket = async () => {
      if (!FUTARCHY_DAO || !FUTARCHY_PROPOSAL || !FUTARCHY_DAO_KEY || !FUTARCHY_PROPOSAL_KEY) return;
      try {
        const market = await fetchDecisionMarket(connection, FUTARCHY_DAO, FUTARCHY_PROPOSAL, publicKey);
        if (!cancelled) {
          setDecisionMarket(market);
          setDecisionMarketError("");
          setFutarchyProposalLive(market.state === "PENDING");
        }
      } catch (error) {
        console.error("Decision market read failed", error);
        if (!cancelled) {
          setDecisionMarket(null);
          setDecisionMarketError(error instanceof Error ? error.message : "Decision market read failed.");
        }
      }
    };
    void loadDecisionMarket();
    const timer = setInterval(() => void loadDecisionMarket(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connection, publicKey?.toBase58()]);
  useEffect(() => {
    let cancelled = false;
    const verifyFutarchyDao = async () => {
      if (!FUTARCHY_DAO_KEY || !FUTARCHY_PROGRAM_KEY) {
        if (!cancelled) setFutarchyDaoLive(false);
        return;
      }
      try {
        const [daoAccount, proposalAccount] = await Promise.all([
          connection.getAccountInfo(FUTARCHY_DAO_KEY, "confirmed"),
          FUTARCHY_PROPOSAL_KEY ? connection.getAccountInfo(FUTARCHY_PROPOSAL_KEY, "confirmed") : Promise.resolve(null),
        ]);
        const daoLive = !!daoAccount && daoAccount.owner.equals(FUTARCHY_PROGRAM_KEY);
        const proposalLive = !!proposalAccount && proposalAccount.owner.equals(FUTARCHY_PROGRAM_KEY);
        if (!cancelled) {
          setFutarchyDaoLive(daoLive);
          setFutarchyProposalLive(proposalLive);
        }
      } catch {
        if (!cancelled) {
          setFutarchyDaoLive(false);
          setFutarchyProposalLive(false);
        }
      }
    };
    void verifyFutarchyDao();
    const timer = setInterval(() => void verifyFutarchyDao(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connection]);
  const visiblePlanets = useMemo(() => {
    if (!snapshot) return [];
    if (zoomLevel === "galaxy") {
      return snapshot.planets.filter((planet) => Number(planet.system.split(":")[0]) === selectedGalaxy);
    }
    if (zoomLevel === "system") {
      return snapshot.planets.filter((planet) => {
        const [planetGalaxy, planetSystem] = planet.system.split(":").map(Number);
        return planetGalaxy === selectedGalaxy && planetSystem === selectedSystem;
      });
    }
    return snapshot.planets;
  }, [snapshot, zoomLevel, selectedGalaxy, selectedSystem]);
  const navigationTraffic = useMemo(() => snapshot ? missionTrafficPoints(snapshot, { level: zoomLevel, galaxy: selectedGalaxy, system: selectedSystem }) : [], [snapshot, zoomLevel, selectedGalaxy, selectedSystem]);
  const trafficSummary = useMemo(() => snapshot ? missionRenderGroups(snapshot, { level: zoomLevel, galaxy: selectedGalaxy, system: selectedSystem }) : null, [snapshot, zoomLevel, selectedGalaxy, selectedSystem]);
  const travelInventories=useTravelCosmetics(connection,GAME_STATE_PROGRAM_ID,(trafficSummary?.groups??[]).flatMap(({mission})=>mission.ownerAddress?[mission.ownerAddress]:[]));
  const [trafficPage, setTrafficPage] = useState(0);
  useEffect(() => setTrafficPage(0), [zoomLevel, selectedGalaxy, selectedSystem]);
  const trafficPageCount = Math.max(1, Math.ceil(navigationTraffic.length / 24));
  const currentTrafficPage = Math.min(trafficPage, trafficPageCount - 1);
  useEffect(() => {
    if (zoomLevel !== "system") {
      systemEntryFocusRef.current = "";
      return;
    }
    if (!snapshot) return;
    const ownedEntityIds = new Set(ownedPlanets.map((planet) => planet.entity));
    const preferredOwnedPlanet = visiblePlanets.find((planet) => planet.id === activeOwnedPlanet)
      ?? visiblePlanets.find((planet) => ownedEntityIds.has(planet.id))
      ?? null;
    const focusKey = `${selectedGalaxy}:${selectedSystem}:${publicKey?.toBase58() ?? "spectator"}:${preferredOwnedPlanet?.id ?? "star"}`;
    if (systemEntryFocusRef.current === focusKey) return;
    systemEntryFocusRef.current = focusKey;
    setSelected(preferredOwnedPlanet);
  }, [activeOwnedPlanet, ownedPlanets, publicKey, selectedGalaxy, selectedSystem, snapshot, visiblePlanets, zoomLevel]);
  const galaxySystems = useMemo(() => {
    if (!snapshot) return [];
    return buildGalaxySystems(selectedGalaxy, snapshot.planets.filter((planet) => Number(planet.system.split(":")[0]) === selectedGalaxy));
  }, [snapshot, selectedGalaxy]);
  const openGalaxyFromOverview = (galaxy: number) => {
    setSelectedGalaxy(galaxy);
    setZoomLevel("galaxy");
  };
  const visitCoordinates = () => {
    const nextGalaxy = Number(galaxyInput);
    const nextSystem = Number(systemInput);
    if (!Number.isInteger(nextGalaxy) || !Number.isInteger(nextSystem) || nextGalaxy < 1 || nextGalaxy > MAX_GALAXY || nextSystem < 1 || nextSystem > SYSTEMS_PER_GALAXY) return;
    setSelectedGalaxy(nextGalaxy);
    setSelectedSystem(nextSystem);
    setZoomLevel("system");
  };
  const activePlanet = ownedPlanets.find((planet) => planet.entity === activeOwnedPlanet);
  const activePlanetNumber = activePlanet ? ownedPlanets.findIndex((planet) => planet.entity === activePlanet.entity) + 1 : 0;
  const activePlanetDirective = activePlanet ? empireWorldDirective(activePlanet) : null;
  const visitOwnedPlanet = (planet: UniverseOwnedPlanet) => {
    setSelectedGalaxy(planet.galaxy);
    setSelectedSystem(planet.system);
    setGalaxyInput(String(planet.galaxy));
    setSystemInput(String(planet.system));
    setZoomLevel("system");
    const mappedPlanet = snapshot?.planets.find((candidate) => candidate.id === planet.entity);
    if (mappedPlanet) setSelected(mappedPlanet);
  };
  useEffect(() => {
    if (!activePlanet || centeredOwnedPlanetRef.current === activePlanet.entity) return;
    centeredOwnedPlanetRef.current = activePlanet.entity;
    setSelectedGalaxy(activePlanet.galaxy);
    setSelectedSystem(activePlanet.system);
    setGalaxyInput(String(activePlanet.galaxy));
    setSystemInput(String(activePlanet.system));
    setZoomLevel("system");
    const mappedPlanet = snapshot?.planets.find((planet) => planet.id === activePlanet.entity);
    if (mappedPlanet) setSelected(mappedPlanet);
  }, [activePlanet, snapshot]);
  const selectedDecisions = allianceDecisions.filter((decision) => decision.galaxy === selectedGalaxy && decision.system === selectedSystem);
  const selectedSovereignty = sovereignties.find((claim) => claim.galaxy === selectedGalaxy && claim.system === selectedSystem) ?? null;
  const selectedAlliance = selectedSovereignty?.alliance ?? selectedDecisions[0]?.alliance ?? null;
  const selectedGovernance = selectedAlliance
    ? governanceConfigs.find((config) => config.alliance === selectedAlliance) ?? null
    : null;
  const selectedLiveMarket = liveDecisionMarkets.find((entry) => entry.decision.galaxy === selectedGalaxy && entry.decision.system === selectedSystem) ?? null;
  const selectedMarketPhase = selectedLiveMarket ? marketPhase(selectedLiveMarket.market, selectedLiveMarket.decision.executed) : null;
  const selectedStar = starForSystem(selectedGalaxy, selectedSystem);
  const occupiedPlanetCount = zoomLevel === "system" ? visiblePlanets.length : 0;
  const selectedOrbitalPosition = selected && Number(selected.system.split(":")[0]) === selectedGalaxy && Number(selected.system.split(":")[1]) === selectedSystem
    ? Number(selected.system.split(":")[2])
    : null;
  const selectedOwnedWorld = selected ? ownedPlanets.find((planet) => planet.entity === selected.id) ?? null : null;
  const selectOrbitalPosition = (position: number) => {
    const planet = visiblePlanets.find((candidate) => Number(candidate.system.split(":")[2]) === position);
    if (planet) {
      setSelected(planet);
      return;
    }
    if (!localSystemDemo) onOpenEmptyTarget?.({ galaxy: selectedGalaxy, system: selectedSystem, position });
  };
  const tradingMarketCount = liveDecisionMarkets.filter((entry) => marketPhase(entry.market, entry.decision.executed) === "TRADING").length;
  const stakingMarketCount = liveDecisionMarkets.filter((entry) => marketPhase(entry.market, entry.decision.executed) === "STAKING").length;
  const finalizingMarketCount = liveDecisionMarkets.filter((entry) => marketPhase(entry.market, entry.decision.executed) === "FINALIZING").length;
  const resolvedMarketCount = liveDecisionMarkets.filter((entry) => ["PASSED", "FAILED", "EXECUTED"].includes(marketPhase(entry.market, entry.decision.executed))).length;
  const unresolvedMarketCount = tradingMarketCount + stakingMarketCount + finalizingMarketCount;
  const activeDecisionMarkets = liveDecisionMarkets.filter((entry) => ["TRADING", "STAKING", "FINALIZING"].includes(marketPhase(entry.market, entry.decision.executed)));
  const finalizedDecisionMarkets = liveDecisionMarkets
    .filter((entry) => ["PASSED", "FAILED", "EXECUTED"].includes(marketPhase(entry.market, entry.decision.executed)))
    .sort((a, b) => (b.decision.executedAt || b.market.closesAt) - (a.decision.executedAt || a.market.closesAt));
  const marketStatusOptions = marketHubView === "ACTIVE" ? ["ALL", "TRADING", "STAKING", "FINALIZING"] : ["ALL", "PASSED", "FAILED", "EXECUTED"];
  const marketSortOptions = marketHubView === "ACTIVE" ? ["URGENT", "NEWEST"] as const : ["NEWEST", "OLDEST"] as const;
  const marketSource = marketHubView === "ACTIVE" ? activeDecisionMarkets : finalizedDecisionMarkets;
  const normalizedMarketSearch = marketSearch.trim().toLowerCase();
  const filteredDecisionMarkets = marketSource.filter((entry) => {
    const phase = marketPhase(entry.market, entry.decision.executed);
    if (marketStatusFilter !== "ALL" && phase !== marketStatusFilter) return false;
    if (!normalizedMarketSearch) return true;
    const searchable = [
      entry.alliance?.name,
      entry.alliance?.tag,
      decisionActionLabel(entry.decision.action),
      decisionActionDetail(entry.decision),
      entry.decision.externalProposal,
      `g${entry.decision.galaxy}:s${entry.decision.system}`,
      `proposal ${entry.decision.id.toString()}`,
    ].filter(Boolean).join(" ").toLowerCase();
    return searchable.includes(normalizedMarketSearch);
  }).sort((a, b) => {
    const aTime = marketHubView === "HISTORY" ? (a.decision.executedAt || a.market.closesAt) : a.market.closesAt;
    const bTime = marketHubView === "HISTORY" ? (b.decision.executedAt || b.market.closesAt) : b.market.closesAt;
    if (marketSort === "OLDEST") return aTime - bTime;
    if (marketSort === "NEWEST") return bTime - aTime;
    const urgency = { FINALIZING: 0, STAKING: 1, TRADING: 2, PASSED: 3, FAILED: 4, EXECUTED: 5, UNKNOWN: 6 } as const;
    const phaseDifference = urgency[marketPhase(a.market, a.decision.executed)] - urgency[marketPhase(b.market, b.decision.executed)];
    return phaseDifference || aTime - bTime;
  });
  const visibleDecisionMarkets = filteredDecisionMarkets.slice(0, marketVisibleCount);
  const normalizedPlanetSearch = planetSearch.trim().toLowerCase();
  const ownedPlanetGalaxies = [...new Set(ownedPlanets.map((planet) => planet.galaxy))].sort((a, b) => a - b);
  const ownedPlanetSystemCount = new Set(ownedPlanets.map((planet) => `${planet.galaxy}:${planet.system}`)).size;
  const ownedPlanetActionCount = ownedPlanets.filter((planet) => (planet.readyActions ?? 0) > 0 || (planet.energyPercent ?? 100) < 100).length;
  const ownedPlanetActiveJobs = ownedPlanets.reduce((total, planet) => total + (planet.activeJobs ?? 0), 0);
  const filteredOwnedPlanets = [...ownedPlanets]
    .filter((planet) => planetGalaxyFilter === "ALL" || planet.galaxy === planetGalaxyFilter)
    .filter((planet) => !normalizedPlanetSearch || `${planet.name} g${planet.galaxy} s${planet.system} p${planet.position} ${planet.galaxy}:${planet.system}:${planet.position}`.toLowerCase().includes(normalizedPlanetSearch))
    .sort((left, right) => {
      if (planetSort === "ATTENTION") {
        const readyDifference = (right.readyActions ?? 0) - (left.readyActions ?? 0);
        if (readyDifference) return readyDifference;
        const energyDifference = Number((left.energyPercent ?? 100) >= 100) - Number((right.energyPercent ?? 100) >= 100);
        if (energyDifference) return energyDifference;
        const jobsDifference = (right.activeJobs ?? 0) - (left.activeJobs ?? 0);
        if (jobsDifference) return jobsDifference;
      }
      if (planetSort === "ACTIVE") {
        if (left.entity === activeOwnedPlanet) return -1;
        if (right.entity === activeOwnedPlanet) return 1;
      }
      if (planetSort === "NAME") return left.name.localeCompare(right.name);
      return left.galaxy - right.galaxy || left.system - right.system || left.position - right.position || left.name.localeCompare(right.name);
    });
  const visibleOwnedPlanets = filteredOwnedPlanets.slice(0, planetVisibleCount);
  useEffect(() => {
    setMarketVisibleCount(12);
    if (!marketStatusOptions.includes(marketStatusFilter)) setMarketStatusFilter("ALL");
    if (!(marketSortOptions as readonly string[]).includes(marketSort)) setMarketSort(marketHubView === "ACTIVE" ? "URGENT" : "NEWEST");
  }, [marketHubView, marketSearch, marketSort, marketStatusFilter]);
  useEffect(() => setPlanetVisibleCount(12), [planetSearch, planetSort, planetGalaxyFilter]);
  const selectedFutarchyDecision = selectedLiveMarket?.decision ?? selectedDecisions.find((decision) => decision.externalProposal === FUTARCHY_PROPOSAL) ?? null;
  const selectedMarketSnapshot = selectedLiveMarket?.market ?? decisionMarket;
  const selectedMarketDao = selectedLiveMarket?.governance.dao ?? selectedGovernance?.dao ?? FUTARCHY_DAO;
  const selectedMarketProposal = selectedLiveMarket?.decision.externalProposal ?? selectedFutarchyDecision?.externalProposal ?? FUTARCHY_PROPOSAL;
  const selectedMarketResolved = selectedMarketPhase === "PASSED" || selectedMarketPhase === "FAILED" || selectedMarketPhase === "EXECUTED";
  const selectedDecisionCost = selectedFutarchyDecision ? decisionResourceCost(selectedFutarchyDecision.action) : null;
  const otherSelectedDecisions = selectedDecisions.filter((decision) => decision.publicKey !== selectedFutarchyDecision?.publicKey);
  const sovereigntyActive = !!selectedSovereignty && selectedSovereignty.upkeepPaidUntil > Math.floor(Date.now() / 1000);
  const refreshSelectedMarket = async () => {
    if (!selectedMarketDao || !selectedMarketProposal) return;
    if (selectedLiveMarket) await refreshLiveDecisionMarkets();
    else setDecisionMarket(await fetchDecisionMarket(connection, selectedMarketDao, selectedMarketProposal, publicKey));
  };
  const tradeDecisionMarket = async (side: DecisionMarketSide) => {
    if (!anchorWallet || !selectedMarketDao || !selectedMarketProposal) return;
    setTradeBusy(side);
    setTradeStatus(`PREPARING ${systemTradeMode} ${side} TRADE…`);
    try {
      const slippageBps = Math.round(Number(tradeSlippage) * 100);
      const executeTrade = systemTradeMode === "BUY" ? buyDecisionMarketSide : sellDecisionMarketSide;
      const result = await executeTrade({
        connection,
        wallet: anchorWallet as any,
        sendTransaction,
        daoAddress: selectedMarketDao,
        proposalAddress: selectedMarketProposal,
        side,
        amount: tradeAmount,
        slippageBps,
        sponsorTokenAccounts,
      });
      setTradeStatus(`${systemTradeMode} ${side} CONFIRMED · MIN ${result.minimumOutput.toFixed(4)} ${systemTradeMode === "BUY" ? "AM" : "USDC"} · ${shortAddress(result.signature)}`);
      await refreshSelectedMarket();
    } catch (error) {
      setTradeStatus(error instanceof Error ? error.message : "Trade failed.");
    } finally {
      setTradeBusy(null);
    }
  };
  if (!snapshot) return <div className="universe-loading">CALIBRATING NAVIGATION ARRAY</div>;
  return <TravelCosmeticsProvider inventories={travelInventories}><main className={`universe-lab${embedded ? " embedded" : ""}${productionUi ? " production-ui" : ""}`}>
    <SceneTransition state={mapTransit.state} />
    <div className="universe-scene">
      {graphicsMode === "3d" ? <Suspense fallback={null}>
        <SectorScene
          onSceneReady={sceneReady}
          snapshot={{ ...snapshot, planets: visiblePlanets }}
          selected={selected}
          level={zoomLevel}
          fullUniverse={fullUniverse}
          galaxySectorStart={1}
          selectedGalaxy={selectedGalaxy}
          selectedSystem={selectedSystem}
          cameraZoom={cameraZoom}
          galaxyPopulations={galaxyPopulations}
          systems={galaxySystems}
          onSelect={(planet) => {
            setSelected(planet);
            if (!localSystemDemo) onOpenCommand?.(planet);
          }}
          onEmptySlotSelect={(target) => { if (!localSystemDemo) onOpenEmptyTarget?.(target); }}
          onLevelChange={setZoomLevel}
          onGalaxySelect={setSelectedGalaxy}
          onSystemSelect={setSelectedSystem}
          onFullGalaxySelect={openGalaxyFromOverview}
          onContextLost={() => setGraphicsMode("compat")}
        />
      </Suspense> : <CompatibilityUniverseScene
        snapshot={{ ...snapshot, planets: visiblePlanets }}
        level={zoomLevel}
        selectedGalaxy={selectedGalaxy}
        selectedSystem={selectedSystem}
        galaxyPopulations={galaxyPopulations}
        systems={galaxySystems}
        onSelect={(planet) => {
          setSelected(planet);
          if (!localSystemDemo) onOpenCommand?.(planet);
        }}
        onEmptySlotSelect={(target) => { if (!localSystemDemo) onOpenEmptyTarget?.(target); }}
        onLevelChange={setZoomLevel}
        onGalaxySelect={setSelectedGalaxy}
        onSystemSelect={setSelectedSystem}
      />}
    </div>
    <div className={`scene-optics is-${zoomLevel}`} aria-hidden="true" />
    {localSystemDemo && <aside className="system-demo-banner" role="status"><div><b>{demoParams?.get("system-demo") === "traffic" ? "LOCAL TRAFFIC CHECK" : localColonyDemo ? "LOCAL COLONY ROUTE CHECK" : "LOCAL FULL-SYSTEM SIMULATION"}</b><span>{demoParams?.get("system-demo") === "traffic" ? `2 TEST WORLDS · ${snapshot.missions.length} TEST FLEETS · NO ON-CHAIN DATA` : localColonyDemo ? "1 COLONY SHIP · EMPTY SLOT 2 · NO ON-CHAIN DATA" : "15 TEST WORLDS · 4 ALLIANCES · 24 ACTIVE FLEETS · COLLISION-SAFE ORBITS · NO ON-CHAIN DATA"}</span><nav className="system-demo-alliance-legend" aria-label="Simulated alliances">{SYSTEM_DEMO_ALLIANCES.map((alliance) => <i key={alliance.tag}><em style={{ background: FACTION_COLORS[alliance.faction] }} />{alliance.tag}</i>)}</nav></div><a href={window.location.pathname}>EXIT DEMO</a></aside>}
    <header className="universe-topbar">
      <a href="/" className="universe-brand" aria-label="GAMESOL home"><img src={gamesolMark} alt="GAMESOL" /></a>
      <div className="navigation-console">
        <div className="camera-controls" aria-label="Camera zoom">
          {zoomLevel === "system" && <GameIconButton className="camera-survey polished-control" label="Survey system" onClick={() => setSelected(null)}><Navigation2 aria-hidden="true" /></GameIconButton>}
          <GameIconButton className="camera-zoom polished-control" label="Zoom camera out" disabled={graphicsMode === "compat"} onClick={() => setCameraZoom(({ id }) => ({ id: id + 1, direction: "out" }))}><ZoomOut aria-hidden="true" /></GameIconButton>
          <GameIconButton className="camera-zoom polished-control" label="Zoom camera in" disabled={graphicsMode === "compat"} onClick={() => setCameraZoom(({ id }) => ({ id: id + 1, direction: "in" }))}><ZoomIn aria-hidden="true" /></GameIconButton>
        </div>
        <div className="coordinate-jump"><MapPin size={16} aria-hidden="true" /><input aria-label="Galaxy number" title="Galaxy number" inputMode="numeric" value={galaxyInput} onChange={(event) => setGalaxyInput(event.target.value)} /><span>:</span><input aria-label="System number" title="System number" inputMode="numeric" value={systemInput} onChange={(event) => setSystemInput(event.target.value)} /><GameIconButton className="polished-control" label="Jump to coordinates" onClick={visitCoordinates}><ArrowRight aria-hidden="true" /></GameIconButton></div>
        <nav className="level-controls" aria-label="Universe navigation level">
          <GameButton className="polished-control" title="Move one level out" aria-label="Move one level out" disabled={zoomLevel === 'universe' || mapTransit.active} onClick={() => setZoomLevel(zoomLevel === 'system' ? 'galaxy' : 'universe')}><ChevronLeft aria-hidden="true" /><span>{zoomLevel === 'system' ? 'Galaxy' : 'Universe'}</span></GameButton>
          <b aria-label={`Current view: ${zoomLevel}`}><small>{graphicsMode === 'compat' ? '2D VIEW' : 'VIEW'}</small>{zoomLevel.toUpperCase()}</b>
          <GameButton className="polished-control" title="Move one level in" aria-label="Move one level in" disabled={zoomLevel === 'system' || mapTransit.active} onClick={() => setZoomLevel(zoomLevel === 'universe' ? 'galaxy' : 'system')}><span>{zoomLevel === 'universe' ? 'Galaxy' : zoomLevel === 'galaxy' ? 'System' : 'Planet'}</span><ChevronRight aria-hidden="true" /></GameButton>
        </nav>
        {ownedPlanets.length > 0 && <button ref={empireToggleRef} className={`planet-roster-toggle${productionUi ? " production-empire-toggle" : ""}`} title={`${hudOpen ? "Close" : "Open"} Empire Command`} aria-label={`${hudOpen ? "Close" : "Open"} empire command, ${ownedPlanets.length} ${ownedPlanets.length === 1 ? "world" : "worlds"}`} aria-controls="empire-command-center" aria-expanded={hudOpen} onClick={() => { const opening = !hudOpen; empireOpenedByControlRef.current = opening; setHudOpen(opening); if (opening && typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches) setSovereigntyPanelOpen(false); }}>{productionUi ? <><span>EMPIRE</span><b>{ownedPlanets.length}</b></> : hudOpen ? "HIDE PLANETS" : "SHOW PLANETS"}</button>}
      </div>
      <button className={`market-directory-trigger${unresolvedMarketCount > 0 ? " has-live" : ""}`} aria-label={`Universe Governance, ${marketDirectoryLoading ? "loading" : `${tradingMarketCount} trading, ${stakingMarketCount} awaiting stake, and ${finalizingMarketCount} finalizing`}`} title="Open Universe Governance" aria-haspopup="dialog" aria-expanded={marketHubOpen} onClick={(event) => openMarketHub(event.currentTarget)}>
        <span className="market-directory-mark" aria-hidden="true"><TrendingUp /></span>
        <span className="market-directory-copy"><strong>UNIVERSE GOVERNANCE</strong><small>{marketDirectoryLoading ? "SYNCING DEVNET" : unresolvedMarketCount > 0 ? `${unresolvedMarketCount} ACTIVE` : "NO ACTIVE PROPOSALS"}</small></span>
        <b aria-hidden="true">{marketDirectoryLoading ? "..." : unresolvedMarketCount}</b>
      </button>
    </header>
    <aside className={`universe-view-context is-${zoomLevel}${viewContextOpen ? "" : " is-collapsed"}${(ownedPlanets.length > 0 && hudOpen) || sovereigntyPanelOpen ? " is-obscured" : ""}`} aria-live="polite">
      <header><span>LIVE NAVIGATION · SOLANA DEVNET</span><div><i /><button type="button" aria-label={viewContextOpen ? "Hide live navigation details" : "Show live navigation details"} title={viewContextOpen ? "Hide navigation details" : "Show navigation details"} aria-expanded={viewContextOpen} onClick={() => setViewContextOpen((open) => !open)}>{viewContextOpen ? <ChevronUp /> : <ChevronDown />}</button></div></header>
      <div className="universe-view-context-title">
        <small>{zoomLevel === "universe" ? "KNOWN SPACE" : zoomLevel === "galaxy" ? `GALAXY ${String(selectedGalaxy).padStart(3, "0")}` : `G ${selectedGalaxy} · S ${selectedSystem}`}</small>
        <h2>{zoomLevel === "universe" ? "The GAMESOL Universe" : zoomLevel === "galaxy" ? galaxyKindForId(selectedGalaxy) : selectedStar.label}</h2>
        <p>{zoomLevel === "universe" ? "Survey a persistent civilization spanning 999 galaxies. Select a galactic light source to begin your approach." : zoomLevel === "galaxy" ? "Navigate its stellar field, inspect occupied systems, and choose a star to enter local space." : "Inspect orbital traffic, inhabited worlds, sovereignty, and active alliance governance."}</p>
      </div>
      <dl>
        {zoomLevel === "universe" ? <><div><dt>GALAXIES</dt><dd>999</dd></div><div><dt>STAR SYSTEMS</dt><dd>998,001</dd></div><div><dt>ON-CHAIN WORLDS</dt><dd>{snapshot.planets.length}</dd></div></> : zoomLevel === "galaxy" ? <><div><dt>SYSTEMS</dt><dd>999</dd></div><div><dt>INHABITED</dt><dd>{galaxySystems.filter((system) => system.occupied).length}</dd></div><div><dt>GALAXY TYPE</dt><dd>{galaxyKindForId(selectedGalaxy)}</dd></div></> : <><div><dt>ORBITAL SLOTS</dt><dd>15</dd></div><div><dt>INHABITED</dt><dd>{occupiedPlanetCount}</dd></div><div><dt>SOVEREIGNTY</dt><dd>{sovereigntyActive ? "CONTROLLED" : "UNCLAIMED"}</dd></div></>}
      </dl>
      {navigationTraffic.length > 0 && <section className="mission-traffic-list" aria-label="Fleet departure and arrival points">
        {trafficSummary && <header>{trafficSummary.total.toLocaleString()} in flight · {trafficSummary.routes.toLocaleString()} routes{trafficSummary.routes > trafficSummary.groups.length ? ` · ${trafficSummary.groups.length} mapped` : ''}</header>}
        {navigationTraffic.slice(currentTrafficPage * 24, (currentTrafficPage + 1) * 24).map((point) => <button key={point.key} type="button" onClick={() => {
          setSelectedGalaxy(point.location.galaxy); setSelectedSystem(point.location.system);
          setZoomLevel(zoomLevel === "universe" ? "galaxy" : "system");
          if (zoomLevel === "system") selectOrbitalPosition(point.location.position);
        }}><strong>{point.key}</strong><span>{trafficPointLabel(point)}</span></button>)}
      </section>}
      {trafficPageCount > 1 && <nav className="mission-traffic-pagination" aria-label="Traffic pages"><button type="button" title="Previous traffic page" aria-label="Previous traffic page" disabled={currentTrafficPage === 0} onClick={() => setTrafficPage(currentTrafficPage - 1)}><ChevronLeft size={16} /></button><span>{currentTrafficPage + 1} / {trafficPageCount}</span><button type="button" title="Next traffic page" aria-label="Next traffic page" disabled={currentTrafficPage + 1 >= trafficPageCount} onClick={() => setTrafficPage(currentTrafficPage + 1)}><ChevronRight size={16} /></button></nav>}
      {zoomLevel === "system" && <nav className="system-orbit-scanner" aria-label="System orbital positions">
        <header><span>ORBITAL SCAN</span><small><i className="is-inhabited" /> INHABITED <i /> EMPTY</small></header>
        <div>{Array.from({ length: PLANETS_PER_SYSTEM }, (_, index) => {
          const position = index + 1;
          const planet = visiblePlanets.find((candidate) => Number(candidate.system.split(":")[2]) === position);
          const active = selectedOrbitalPosition === position;
          return <button
            key={position}
            type="button"
            className={`${planet ? `is-inhabited faction-${planet.faction}` : "is-empty"}${active ? " is-active" : ""}`}
            aria-label={planet ? `Focus position ${position}, ${planet.name}, ${planet.faction}${planet.faction !== "owned" ? `, owner ${planet.ownerLabel}` : ""}` : `Target empty orbital position ${position}`}
            aria-current={active ? "location" : undefined}
            title={planet ? `${planet.name} · position ${position}${planet.faction !== "owned" ? ` · Owner ${planet.ownerAddress ?? planet.ownerLabel}` : ""}` : `Empty position ${position}`}
            onClick={() => selectOrbitalPosition(position)}
          ><span>{position}</span><i /></button>;
        })}</div>
        {selectedOrbitalPosition && selected && <section className={`orbit-selection faction-${selected.faction}`} aria-live="polite">
          <div><small>POSITION {selectedOrbitalPosition} · {selected.faction === "owned" ? "YOUR WORLD" : selected.faction.toUpperCase()}</small><b>{selected.name}</b>{selected.faction !== "owned" && <span className="orbit-owner" title={selected.ownerAddress ?? selected.ownerLabel}>Owner <strong>{selected.ownerLabel}</strong></span>}</div>
          <button type="button" onClick={() => selectedOwnedWorld ? onOperatePlanet?.(selectedOwnedWorld) : onOpenCommand?.(selected)}>{selectedOwnedWorld ? "OPERATE" : "INSPECT"}</button>
        </section>}
      </nav>}
      <footer><span><i>{zoomLevel === "universe" ? "01" : zoomLevel === "galaxy" ? "02" : "03"}</i>{zoomLevel === "universe" ? "SELECT A GALAXY" : zoomLevel === "galaxy" ? "SELECT A STAR SYSTEM" : "SELECT A WORLD"}</span><b>{zoomLevel === "system" ? "INSPECT AN ORBIT · LEVEL OUT TO RETURN" : "SELECT A LIGHT SOURCE · SCROLL TO CHANGE SCALE"}</b></footer>
    </aside>
    {marketHubOpen && typeof document !== "undefined" && createPortal(<div className="gds-workspace-backdrop market-hub-backdrop" onMouseDown={() => setMarketHubOpen(false)}>
      <div onMouseDown={(event) => event.stopPropagation()}>
      <GameWorkspace className={`market-hub-modal${liveDecisionMarkets.length === 0 ? " is-empty" : ""}`} titleId="decision-market-hub-title" kicker="UNIVERSE GOVERNANCE · SOLANA DEVNET" title="Governance command center" description="Follow, stake, trade, and review every registered GAMESOL alliance proposal from one command workspace." closeLabel="Close Universe Governance" closeRef={marketHubCloseRef} workspaceRef={marketHubWorkspaceRef} onClose={() => setMarketHubOpen(false)}>
        <div className="market-hub-summary"><div><span>OPEN TRADING</span><b>{tradingMarketCount}</b></div><div><span>NEEDS STAKE</span><b>{stakingMarketCount}</b></div><div><span>ENDING</span><b>{finalizingMarketCount}</b></div><div><span>COMPLETED</span><b>{resolvedMarketCount}</b></div></div>
        {marketDirectoryLoading && liveDecisionMarkets.length === 0 ? <GameEmptyState icon={<TrendingUp />} title="Syncing governance" description="Reading registered alliance actions and their MetaDAO accounts from devnet." /> : liveDecisionMarkets.length === 0 ? <div className="governance-empty"><GameEmptyState icon={<TrendingUp />} title="No registered proposals yet" description="Universe Governance has no registered alliance proposals on this devnet program yet. Explore the universe or open an alliance workspace to follow the first proposal when it launches." action={<GameButton tone="governance" onClick={() => setMarketHubOpen(false)}>RETURN TO UNIVERSE</GameButton>} /><section className="governance-empty-guide" aria-label="Governance lifecycle"><article><span>01</span><div><b>ALLIANCE PROPOSES</b><p>A treasury action is registered on-chain.</p></div></article><i /><article><span>02</span><div><b>PLAYERS SIGNAL</b><p>ANTIMATTER stake brings the proposal live.</p></div></article><i /><article><span>03</span><div><b>THE MARKET DECIDES</b><p>PASS and FAIL trading informs execution.</p></div></article></section></div> : <>
          <div className="market-hub-workspace">
            <div className="market-hub-tabs" role="tablist" aria-label="Proposal directory"><button role="tab" aria-selected={marketHubView === "ACTIVE"} className={marketHubView === "ACTIVE" ? "active" : ""} onClick={() => setMarketHubView("ACTIVE")}><span>ACTIVE</span><b>{unresolvedMarketCount}</b></button><button role="tab" aria-selected={marketHubView === "HISTORY"} className={marketHubView === "HISTORY" ? "active" : ""} onClick={() => setMarketHubView("HISTORY")}><span>HISTORY</span><b>{resolvedMarketCount}</b></button></div>
            <label className="market-hub-search"><span>SEARCH</span><input type="search" value={marketSearch} onChange={(event) => setMarketSearch(event.target.value)} placeholder="Alliance, proposal, action, or G:S" /></label>
            <label className="market-hub-filter"><span>STATUS</span><select value={marketStatusFilter} onChange={(event) => setMarketStatusFilter(event.target.value)}>{marketStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label className="market-hub-filter market-hub-sort"><span>SORT</span><select value={marketSort} onChange={(event) => setMarketSort(event.target.value as "URGENT" | "NEWEST" | "OLDEST")}>{marketSortOptions.map((sort) => <option key={sort} value={sort}>{sort === "URGENT" ? "ACTION NEEDED" : sort}</option>)}</select></label>
          </div>
          <div className="market-hub-grid">
            <div className={`market-hub-section-heading${marketHubView === "HISTORY" ? " is-history" : ""}`}><div><span>{marketHubView === "ACTIVE" ? "ACTIVE PIPELINE" : "PROPOSAL ARCHIVE"}</span><b>{marketHubView === "ACTIVE" ? "Stake, trade, or follow every unresolved proposal." : "Search every finalized outcome and the game action it authorized or rejected."}</b></div><em>{filteredDecisionMarkets.length}</em></div>
            {filteredDecisionMarkets.length === 0 && <div className="market-hub-section-empty"><span>{marketSearch || marketStatusFilter !== "ALL" ? "NO PROPOSALS MATCH THESE FILTERS" : marketHubView === "ACTIVE" ? "NO ACTIVE PROPOSALS RIGHT NOW" : "NO FINALIZED PROPOSALS YET"}</span>{(marketSearch || marketStatusFilter !== "ALL") && <button type="button" onClick={() => { setMarketSearch(""); setMarketStatusFilter("ALL"); }}>CLEAR FILTERS</button>}</div>}
            {visibleDecisionMarkets.map((entry) => <DecisionMarketDirectoryCard key={entry.decision.publicKey} entry={entry} onRefresh={refreshLiveDecisionMarkets} sponsorTokenAccounts={sponsorTokenAccounts} onVisitSystem={() => { setSelectedGalaxy(entry.decision.galaxy); setSelectedSystem(entry.decision.system); setGalaxyInput(String(entry.decision.galaxy)); setSystemInput(String(entry.decision.system)); setZoomLevel("system"); openSovereigntyPanel(); if (typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches) setHudOpen(false); setMarketHubOpen(false); }} />)}
            {visibleDecisionMarkets.length < filteredDecisionMarkets.length && <button className="market-hub-more" type="button" onClick={() => setMarketVisibleCount((count) => count + 12)}>SHOW 12 MORE <span>{visibleDecisionMarkets.length} / {filteredDecisionMarkets.length}</span></button>}
          </div>
        </>}
        {marketDirectoryError && <p className="market-hub-error">PARTIAL DEVNET READ — {marketDirectoryError}</p>}
        <footer><p><b>How it works:</b> draft proposals collect refundable ANTIMATTER stake until the DAO threshold is reached. After launch, wallets can trade PASS or FAIL and positions settle through MetaDAO finalization.</p></footer>
      </GameWorkspace>
      </div>
    </div>, document.body)}
    {ownedPlanets.length > 0 && (productionUi ? <aside id="empire-command-center" className={`universe-intel empire-command-center ${hudOpen ? "" : "is-hidden"}`} role="dialog" aria-modal="false" aria-labelledby="empire-command-title" aria-hidden={!hudOpen}>
      <header className="empire-heading"><div><span>EMPIRE COMMAND</span><h1 id="empire-command-title">Your worlds</h1><p>Navigate and operate every on-chain colony from one place.</p></div><button ref={empireCloseRef} type="button" aria-label="Close empire command" title="Close Empire Command (Esc)" onClick={() => { empireRestoreFocusRef.current = true; setHudOpen(false); }}><X aria-hidden="true" /></button></header>
      <section className="empire-summary" aria-label="Empire overview"><div><span>WORLDS</span><b>{ownedPlanets.length}</b></div><div className={ownedPlanetActionCount > 0 ? "needs-action" : ""}><span>NEEDS ACTION</span><b>{ownedPlanetActionCount}</b></div><div><span>ACTIVE JOBS</span><b>{ownedPlanetActiveJobs}</b></div><div><span>GALAXIES</span><b>{ownedPlanetGalaxies.length}</b><small>{ownedPlanetSystemCount} systems</small></div></section>
      {activePlanet && activePlanetDirective && <section className={`empire-active-world directive-${activePlanetDirective.tone}`}>
        <header className="empire-active-identity">
          <EmpireWorldPortrait planet={activePlanet} index={activePlanetNumber} />
          <div><span>ACTIVE COMMAND WORLD</span><strong>{activePlanet.name}</strong><small>G {activePlanet.galaxy} · S {activePlanet.system} · P {activePlanet.position}</small></div>
        </header>
        <div className="empire-world-directive"><span>{activePlanetDirective.eyebrow}</span><b>{activePlanetDirective.title}</b><p>{activePlanetDirective.detail}</p></div>
        <nav><button className="primary" onClick={() => onOperatePlanet?.(activePlanet)}>{activePlanetDirective.action}</button><button onClick={() => visitOwnedPlanet(activePlanet)}>SYSTEM MAP</button></nav>
      </section>}
      <section className="empire-filters">
        <label className="empire-search"><span>FIND WORLD</span><input type="search" value={planetSearch} onChange={(event) => setPlanetSearch(event.target.value)} placeholder="Name or coordinates" /></label>
        <label><span>GALAXY</span><select value={String(planetGalaxyFilter)} onChange={(event) => setPlanetGalaxyFilter(event.target.value === "ALL" ? "ALL" : Number(event.target.value))}><option value="ALL">ALL</option>{ownedPlanetGalaxies.map((galaxy) => <option key={galaxy} value={galaxy}>G {galaxy}</option>)}</select></label>
        <label><span>SORT</span><select value={planetSort} onChange={(event) => setPlanetSort(event.target.value as "ATTENTION" | "ACTIVE" | "COORDINATES" | "NAME")}><option value="ATTENTION">ACTION NEEDED</option><option value="ACTIVE">ACTIVE FIRST</option><option value="COORDINATES">COORDINATES</option><option value="NAME">NAME</option></select></label>
      </section>
      <div className="empire-results"><span>{filteredOwnedPlanets.length} {filteredOwnedPlanets.length === 1 ? "WORLD" : "WORLDS"}</span><small>Showing {Math.min(visibleOwnedPlanets.length, filteredOwnedPlanets.length)}</small></div>
      <div className="owned-planet-roster empire-world-list">{visibleOwnedPlanets.map((planet) => {
        const planetNumber = ownedPlanets.findIndex((candidate) => candidate.entity === planet.entity) + 1;
        const needsAction = (planet.readyActions ?? 0) > 0 || (planet.energyPercent ?? 100) < 100;
        const surfaceStyle = planetSurfaceStyleForSystem(planet.position, planet.galaxy, planet.system);
        return <article className={`${planet.entity === activeOwnedPlanet ? "is-active " : ""}${needsAction ? "needs-action" : ""}`} key={planet.entity}>
          <button className="empire-world-visit" onClick={() => visitOwnedPlanet(planet)}>
            <EmpireWorldPortrait planet={planet} index={planetNumber} />
            <span className="roster-planet"><b>{planet.name}</b><small>G {planet.galaxy} · S {planet.system} · P {planet.position}</small><i>{surfaceStyle.name}</i></span>
            <span className="empire-world-state">{(planet.readyActions ?? 0) > 0 ? <b>{planet.readyActions} READY</b> : (planet.energyPercent ?? 100) < 100 ? <b>LOW POWER</b> : (planet.activeJobs ?? 0) > 0 ? <em>{planet.activeJobs} ACTIVE</em> : <em>STABLE</em>}</span>
          </button>
          <button className="empire-world-operate" aria-label={`Operate ${planet.name}`} onClick={() => onOperatePlanet?.(planet)}>OPERATE</button>
        </article>;
      })}{filteredOwnedPlanets.length === 0 && <div className="planet-roster-empty"><b>NO WORLDS FOUND</b><span>Change the search or galaxy filter.</span></div>}{visibleOwnedPlanets.length < filteredOwnedPlanets.length && <button className="planet-roster-more" type="button" onClick={() => setPlanetVisibleCount((count) => count + 12)}>LOAD 12 MORE <span>{visibleOwnedPlanets.length} / {filteredOwnedPlanets.length}</span></button>}</div>
    </aside> : <aside className={`universe-intel ${hudOpen ? "" : "is-hidden"}`}><div className="intel-kicker">COMMAND NETWORK</div><div className="roster-heading"><div><h1>Your planets</h1><p>{ownedPlanets.length} worlds under your control</p></div><b>{ownedPlanets.length}</b></div>{activePlanet && <button className="visit-active-system" onClick={() => visitOwnedPlanet(activePlanet)}>VISIT ACTIVE SYSTEM</button>}<div className="planet-roster-tools"><label><span>FIND WORLD</span><input type="search" value={planetSearch} onChange={(event) => setPlanetSearch(event.target.value)} placeholder="Name or G:S:P" /></label><label><span>SORT</span><select value={planetSort} onChange={(event) => setPlanetSort(event.target.value as "ATTENTION" | "ACTIVE" | "COORDINATES" | "NAME")}><option value="ATTENTION">ACTION NEEDED</option><option value="ACTIVE">ACTIVE FIRST</option><option value="COORDINATES">COORDINATES</option><option value="NAME">NAME</option></select></label><small>{filteredOwnedPlanets.length} MATCHING</small></div><div className="owned-planet-roster">{visibleOwnedPlanets.map((planet) => { const planetNumber = ownedPlanets.findIndex((candidate) => candidate.entity === planet.entity) + 1; return <button className={planet.entity === activeOwnedPlanet ? "is-active" : ""} key={planet.entity} onClick={() => onOperatePlanet?.(planet)}><span className="roster-index">{String(planetNumber).padStart(2, "0")}</span><span className="roster-planet"><b>{planet.name}</b><small>G {planet.galaxy} · S {planet.system} · P {planet.position}</small></span><em>{planet.entity === activeOwnedPlanet ? "ACTIVE" : "OPERATE"}</em></button>; })}{filteredOwnedPlanets.length === 0 && <div className="planet-roster-empty">NO WORLDS MATCH THIS SEARCH</div>}{visibleOwnedPlanets.length < filteredOwnedPlanets.length && <button className="planet-roster-more" type="button" onClick={() => setPlanetVisibleCount((count) => count + 12)}>SHOW 12 MORE <span>{visibleOwnedPlanets.length} / {filteredOwnedPlanets.length}</span></button>}</div></aside>)}
    {zoomLevel === "system" && !sovereigntyPanelOpen && <button className={`sovereignty-toggle${selectedMarketPhase && ["STAKING", "TRADING", "FINALIZING"].includes(selectedMarketPhase) ? " has-live-market" : ""}`} aria-controls="system-intel-panel" aria-expanded={false} aria-haspopup="dialog" onClick={(event) => { openSovereigntyPanel(event.currentTarget); if (typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches) setHudOpen(false); }}><span>{selectedMarketPhase ? `${selectedMarketPhase} · SYSTEM INTEL` : "SYSTEM INTEL"}</span><b>G {selectedGalaxy} · S {selectedSystem}</b><small>{selectedStar.label.toUpperCase()} · {occupiedPlanetCount} OCCUPIED {occupiedPlanetCount === 1 ? "PLANET" : "PLANETS"}</small></button>}
    {zoomLevel === "system" && selectedLiveMarket && selectedMarketPhase && ["STAKING", "TRADING", "FINALIZING"].includes(selectedMarketPhase) && <button className={`system-market-beacon${selectedMarketPhase === "STAKING" ? " is-staking" : ""}`} onClick={(event) => openMarketHub(event.currentTarget)}><TrendingUp /><span>{selectedMarketPhase === "STAKING" ? "PROPOSAL AWAITING STAKE" : selectedMarketPhase === "FINALIZING" ? "MARKET FINALIZING" : "LIVE DECISION MARKET"}</span><b>{selectedMarketPhase === "STAKING" ? `${selectedLiveMarket.market.totalStaked.toFixed(2)} / ${selectedLiveMarket.market.requiredStake.toFixed(2)} AM` : selectedMarketPhase === "FINALIZING" ? "TRADING CLOSED · KEEPER ACTIVE" : `PASS $${selectedLiveMarket.market.passPrice.toFixed(4)} · FAIL $${selectedLiveMarket.market.failPrice.toFixed(4)}`}</b></button>}
    {zoomLevel === "system" && sovereigntyPanelOpen && <aside id="system-intel-panel" className={`sovereignty-intel ${sovereigntyActive ? "is-controlled" : ""}`} role="dialog" aria-modal="false" aria-labelledby="system-intel-title">
      <div className="sovereignty-heading"><span id="system-intel-title">SYSTEM SOVEREIGNTY</span><div><b>DEVNET · ON-CHAIN</b><button ref={sovereigntyCloseRef} type="button" aria-label="Close sovereignty panel" title="Close system intel (Esc)" onClick={() => setSovereigntyPanelOpen(false)}><span>CLOSE</span><X aria-hidden="true" /></button></div></div>
      <h2>G {selectedGalaxy} · S {selectedSystem}</h2>
      <div className="sovereignty-system-summary"><span>{selectedStar.label}</span><b>{occupiedPlanetCount} OCCUPIED {occupiedPlanetCount === 1 ? "PLANET" : "PLANETS"}</b></div>
      {sovereigntyReadState === "loading" && <p>SYNCING PROGRAM ACCOUNTS…</p>}
      {sovereigntyReadState === "error" && <p className="sovereignty-error">DEVNET READ UNAVAILABLE — NO LOCAL DATA SHOWN</p>}
      {sovereigntyReadState === "ready" && !selectedSovereignty && <>
        <div className="sovereignty-status"><i />UNCLAIMED</div>
        <p>No sovereignty account exists for this system on the configured devnet program.</p>
      </>}
      {sovereigntyReadState === "ready" && selectedSovereignty && <>
        <div className={`sovereignty-status ${sovereigntyActive ? "active" : "expired"}`}><i />{sovereigntyActive ? "CONTROLLED" : "UPKEEP EXPIRED"}</div>
        <dl>
          <div><dt>ALLIANCE</dt><dd title={selectedSovereignty.alliance}>{shortAddress(selectedSovereignty.alliance)}</dd></div>
          <div><dt>SPECIALIZATION</dt><dd>{SOVEREIGNTY_SPECIALIZATIONS[selectedSovereignty.specialization] ?? `TYPE ${selectedSovereignty.specialization}`}</dd></div>
          <div><dt>ACTIVE EFFECT</dt><dd>{sovereigntyActive ? (SOVEREIGNTY_EFFECTS[selectedSovereignty.specialization] ?? "UNKNOWN") : "DISABLED UNTIL UPKEEP"}</dd></div>
          <div><dt>UPKEEP</dt><dd>{sovereigntyActive ? formatUpkeepTime(selectedSovereignty.upkeepPaidUntil) : "CLAIMABLE"}</dd></div>
          <div><dt>VULNERABILITY</dt><dd>{String(selectedSovereignty.vulnerabilityHourUtc).padStart(2, "0")}:00 UTC</dd></div>
        </dl>
      </>}
      {sovereigntyReadState === "ready" && <div className="decision-market-intel">
        <div className="decision-market-heading"><span>ANTIMATTER DECISION MARKET</span><b>{selectedFutarchyDecision && selectedMarketSnapshot ? (selectedMarketPhase ?? selectedMarketSnapshot.state) : selectedGovernance?.enabled ? "ALLIANCE LINKED" : futarchyDaoLive ? "DAO LIVE" : "AWAITING FUTARCHY"}</b></div>
        {selectedGovernance ? <dl>
          <div><dt>DAO</dt><dd title={selectedGovernance.dao}>{shortAddress(selectedGovernance.dao)}</dd></div>
          <div><dt>ANTIMATTER</dt><dd title={selectedGovernance.antimatterMint}>{shortAddress(selectedGovernance.antimatterMint)}</dd></div>
          <div><dt>PROPOSALS</dt><dd>{selectedGovernance.proposalCount.toString()}</dd></div>
        </dl> : selectedFutarchyDecision && futarchyDaoLive && FUTARCHY_DAO && FUTARCHY_EXECUTOR ? <>
          <dl>
            <div><dt>DEVNET DAO</dt><dd title={FUTARCHY_DAO}>{shortAddress(FUTARCHY_DAO)}</dd></div>
            <div><dt>EXECUTOR</dt><dd title={FUTARCHY_EXECUTOR}>{shortAddress(FUTARCHY_EXECUTOR)}</dd></div>
            <div><dt>STATUS</dt><dd>{selectedMarketSnapshot?.state ?? (futarchyProposalLive ? "PENDING" : "REAL DAO ACCOUNT")}</dd></div>
          </dl>
          <p>This real devnet market controls the recorded G{selectedFutarchyDecision.galaxy}:S{selectedFutarchyDecision.system} alliance action through the shared Squads executor.</p>
        </> : <p>No on-chain governance configuration exists for this system's alliance. Nothing is simulated.</p>}
        {selectedFutarchyDecision && selectedMarketSnapshot && <section className="market-trade-panel">
          {selectedMarketResolved ? <>
          <div className={`system-market-outcome is-${selectedMarketPhase?.toLowerCase()}`}>
            <TrendingUp />
            <div><span>FINAL MARKET RESULT</span><b>{selectedMarketPhase === "EXECUTED" ? "PASSED" : selectedMarketPhase}</b><small>Closed {formatDecisionDate(selectedMarketSnapshot.closesAt)} · verified on devnet</small></div>
          </div>
          <div className="system-market-action">
            <span>{selectedMarketPhase === "EXECUTED" ? "WHAT IT DID" : "AUTHORIZED ACTION"}</span>
            <b>{decisionActionDetail(selectedFutarchyDecision)}</b>
            <small>{selectedMarketPhase === "EXECUTED" ? `Executed ${formatDecisionDate(selectedFutarchyDecision.executedAt)} · game state updated on-chain` : selectedMarketPhase === "PASSED" ? "MetaDAO approved the action. Squads/game execution is still pending." : "MetaDAO rejected the action. No alliance resources were spent."}</small>
            {selectedDecisionCost && <div className="system-market-cost" aria-label="Alliance treasury resource cost"><span><img src={metalResource} alt="Metal" />{selectedDecisionCost.metal}</span><span><img src={crystalResource} alt="Crystal" />{selectedDecisionCost.crystal}</span><span><img src={deuteriumResource} alt="Deuterium" />{selectedDecisionCost.deuterium}</span></div>}
          </div>
          <div className="system-market-lifecycle">
            <div><span>MARKET</span><b>FINALIZED</b></div>
            <i />
            <div><span>DECISION</span><b>{selectedMarketPhase === "FAILED" ? "REJECTED" : "APPROVED"}</b></div>
            <i />
            <div><span>GAME ACTION</span><b>{selectedMarketPhase === "EXECUTED" ? "EXECUTED" : selectedMarketPhase === "PASSED" ? "PENDING" : "CANCELLED"}</b></div>
          </div>
          <div className="market-wallet-balance"><span>YOUR SETTLEMENT POSITION</span><b>PASS {selectedMarketSnapshot.walletPassAntimatter.toFixed(2)} AM · FAIL {selectedMarketSnapshot.walletFailAntimatter.toFixed(2)} AM</b></div>
          <DecisionResolutionControls market={selectedMarketSnapshot} daoAddress={selectedMarketDao!} proposalAddress={selectedMarketProposal!} onRefresh={refreshSelectedMarket} sponsorTokenAccounts={sponsorTokenAccounts} />
          </> : selectedMarketSnapshot.state === "DRAFT" ? <DecisionStakeControls market={selectedMarketSnapshot} daoAddress={selectedMarketDao!} proposalAddress={selectedMarketProposal!} onRefresh={refreshSelectedMarket} /> : <>
          <div className="market-prices">
            <div><span>PASS PRICE</span><b>${selectedMarketSnapshot.passPrice.toFixed(4)}</b></div>
            <div><span>FAIL PRICE</span><b>${selectedMarketSnapshot.failPrice.toFixed(4)}</b></div>
            <div><span>WINDOW</span><b>{formatMarketTime(selectedMarketSnapshot.closesAt)}</b></div>
          </div>
          <div className="market-wallet-balance"><span>CONNECTED BALANCE</span><b>{selectedMarketSnapshot.walletUsdc.toFixed(2)} USDC · PASS {selectedMarketSnapshot.walletPassAntimatter.toFixed(2)} AM · FAIL {selectedMarketSnapshot.walletFailAntimatter.toFixed(2)} AM</b></div>
          {selectedMarketSnapshot.state === "PENDING" && selectedMarketSnapshot.closesAt > Math.floor(Date.now() / 1000) ? <>
            {anchorWallet ? <div className="market-order">
              <div className="market-trade-mode" role="group" aria-label="Trade direction"><button type="button" className={systemTradeMode === "BUY" ? "active" : ""} onClick={() => setSystemTradeMode("BUY")} disabled={!!tradeBusy}>BUY</button><button type="button" className={systemTradeMode === "SELL" ? "active" : ""} onClick={() => setSystemTradeMode("SELL")} disabled={!!tradeBusy}>SELL</button></div>
              <label><span>{systemTradeMode === "BUY" ? "SPEND DEVNET USDC" : "SELL CONDITIONAL AM"}</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={tradeAmount} onChange={(event) => setTradeAmount(event.target.value)} disabled={!!tradeBusy} /></label>
              <label><span>MAX SLIPPAGE %</span><input type="number" min="0.1" max="10" step="0.1" inputMode="decimal" value={tradeSlippage} onChange={(event) => setTradeSlippage(event.target.value)} disabled={!!tradeBusy} /></label>
              <div className="market-trade-actions"><button className="pass" disabled={!!tradeBusy} onClick={() => void tradeDecisionMarket("PASS")}>{tradeBusy === "PASS" ? "CONFIRMING…" : `${systemTradeMode} PASS`}</button><button className="fail" disabled={!!tradeBusy} onClick={() => void tradeDecisionMarket("FAIL")}>{tradeBusy === "FAIL" ? "CONFIRMING…" : `${systemTradeMode} FAIL`}</button></div>
            </div> : <div className="market-wallet-control"><WalletConnectControl disconnectedLabel="ENTER WITH PASSKEY" connectingLabel="OPENING PASSKEY…" /><small>Trading is open to every player. Alliance membership controls actions, not market access.</small></div>}
          </> : <DecisionResolutionControls market={selectedMarketSnapshot} daoAddress={selectedMarketDao!} proposalAddress={selectedMarketProposal!} onRefresh={refreshSelectedMarket} sponsorTokenAccounts={sponsorTokenAccounts} />}
          {tradeStatus && <div className={`market-trade-status${tradeStatus.includes("CONFIRMED") ? " success" : ""}`}>{tradeStatus}</div>}
          </>}
          <a className="market-chain-link" href={`https://explorer.solana.com/address/${selectedMarketSnapshot.proposal}?cluster=devnet`} target="_blank" rel="noreferrer">VERIFY MARKET ON SOLANA EXPLORER</a>
        </section>}
        {selectedFutarchyDecision && !selectedMarketSnapshot && decisionMarketError && <p className="sovereignty-error">LIVE MARKET READ FAILED — {decisionMarketError}</p>}
        {otherSelectedDecisions.length > 0 && <div className="decision-market-list">{otherSelectedDecisions.slice(0, 3).map((decision) => <div key={decision.publicKey}>
          <span>#{decision.id.toString()} · {(["CLAIM SYSTEM", "FUND UPKEEP", "SET SPECIALIZATION"])[decision.action] ?? "UNKNOWN ACTION"}</span>
          <b>{(() => {
            const entry = liveDecisionMarkets.find((marketEntry) => marketEntry.decision.publicKey === decision.publicKey);
            return decision.executed ? "EXECUTED" : entry ? marketPhase(entry.market) : "ON-CHAIN SYNC";
          })()}</b>
          <a href={`https://explorer.solana.com/address/${decision.externalProposal}?cluster=devnet`} target="_blank" rel="noreferrer">VIEW ON-CHAIN</a>
        </div>)}</div>}
        <button className="view-all-markets" onClick={(event) => openMarketHub(event.currentTarget)}>OPEN UNIVERSE GOVERNANCE</button>
      </div>}
      {!SOVEREIGNTY_WRITES_ENABLED && <div className="sovereignty-lock">CLAIM ACTIONS LOCKED UNTIL EXPERIMENTAL PROGRAM UPGRADE</div>}
    </aside>}
  </main></TravelCosmeticsProvider>;
}
