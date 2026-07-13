import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { WalletDisconnectButton, WalletModalButton, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { BarChart3, Building2, ChevronLeft, ChevronRight, Crosshair, FlaskConical, Gem, Pickaxe, Rocket, Shield, ShoppingCart, Store, Trophy, Users, Zap } from "lucide-react";
import UniverseLab from "./UniverseLab";
import PlanetWorld from "./PlanetWorld";
import { MarketClient } from "./market-client";
import {
  BUILDINGS,
  GameClient,
  SHIPS,
  SHIP_TYPE_IDX,
  upgradeCost,
  type PlayerState,
  type Mission,
  type VaultRecoveryPromptRequest,
  type VaultStatus,
} from "./game-state";
import type { UniversePlanet } from "./universe-data";
import { resolveGameArt } from "./ui-art";

type OperationState = {
  label: string;
  detail: string;
  phase: "processing" | "success" | "error";
};

function OperationModal({ operation, onClose }: { operation: OperationState | null; onClose: () => void }) {
  if (!operation) return null;
  const active = operation.phase === "processing";
  return <div className="ug-operation-backdrop" role="status" aria-live="polite">
    <section className={`ug-operation-modal ${operation.phase}`}>
      <div className="ug-operation-mark">{active ? <i /> : operation.phase === "success" ? "OK" : "!"}</div>
      <span>{active ? "COMMAND PROCESSING" : operation.phase === "success" ? "COMMAND CONFIRMED" : "COMMAND FAILED"}</span>
      <h2>{operation.label}</h2>
      <p>{operation.detail}</p>
      {active ? <div className="ug-operation-steps"><b>1</b><i /><b>2</b><i /><b>3</b></div> : <button onClick={onClose}>CLOSE</button>}
    </section>
  </div>;
}
import "./universe-game.css";

const RESEARCH = [
  "Energy Technology",
  "Combustion Drive",
  "Impulse Drive",
  "Hyperspace Drive",
  "Computer Technology",
  "Astrophysics",
  "Intergalactic Research Network",
  "Weapons Technology",
  "Shielding Technology",
  "Armor Technology",
] as const;
const RESEARCH_KEYS = [
  "energyTech",
  "combustionDrive",
  "impulseDrive",
  "hyperspaceDrive",
  "computerTech",
  "astrophysics",
  "igrNetwork",
  "weaponsTechnology",
  "shieldingTechnology",
  "armorTechnology",
] as const;
const RESEARCH_DETAILS = [
  { desc: "raises Fusion Reactor energy output by 10%.", cost: [0, 800, 400] },
  { desc: "improves travel speed for combustion-drive ships.", cost: [400, 0, 600] },
  { desc: "improves travel speed for impulse-drive ships.", cost: [2000, 4000, 600] },
  { desc: "improves travel speed for hyperspace-drive ships.", cost: [10000, 20000, 6000] },
  { desc: "advances toward additional usable mission slots.", cost: [0, 400, 600] },
  { desc: "advances colonization capacity and colony requirements.", cost: [4000, 2000, 1000] },
  { desc: "increases the research-network level and its laboratory requirements.", cost: [240000, 400000, 160000] },
  { desc: "increases weapons effectiveness for ships and defenses.", cost: [800, 200, 0] },
  { desc: "increases shielding effectiveness for ships and defenses.", cost: [200, 600, 0] },
  { desc: "increases armor effectiveness for ships and defenses.", cost: [1000, 0, 0] },
] as const;
const NEXT_BUILDING_EFFECT: Record<(typeof BUILDINGS)[number]["key"], string> = {
  metalMine: "Next level increases metal production.", crystalMine: "Next level increases crystal production.", deuteriumSynthesizer: "Next level increases deuterium production.", solarPlant: "Next level increases available energy.", fusionReactor: "Next level increases energy generated from deuterium.", roboticsFactory: "Next level shortens building construction time.", naniteFactory: "Next level sharply shortens construction time.", shipyard: "Next level unlocks higher ship and defense requirements.", metalStorage: "Next level increases metal storage capacity.", crystalStorage: "Next level increases crystal storage capacity.", deuteriumTank: "Next level increases deuterium storage capacity.", researchLab: "Next level unlocks higher research requirements.", missileSilo: "Next level expands missile capacity.",
};
const DEFENSE = [
  "Rocket Launcher",
  "Light Laser",
  "Heavy Laser",
  "Gauss Cannon",
  "Ion Cannon",
  "Plasma Turret",
  "Small Shield Dome",
  "Large Shield Dome",
  "Anti-Ballistic Missile",
  "Interplanetary Missile",
] as const;
const DEFENSE_KEYS = [
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
const DEFENSE_COSTS = [
  [2000, 0, 0], [1500, 500, 0], [6000, 2000, 0], [20000, 15000, 2000], [2000, 6000, 0], [50000, 50000, 30000], [10000, 10000, 0], [50000, 50000, 0], [8000, 0, 2000], [12500, 2500, 5000],
] as const;
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const VAULT_PASSWORD_STORAGE_PREFIX = "gamesol:vault-password";
let latestAntimatterBalance = 0n;
type Tab =
  | "overview"
  | "buildings"
  | "research"
  | "ships"
  | "defense"
  | "missions"
  | "quests"
  | "alliance"
  | "market"
  | "store";
type MissionTarget = Pick<UniversePlanet, "id" | "name" | "system">;
const TAB_ICONS: Record<Tab, React.ReactNode> = { overview: <BarChart3 />, buildings: <Building2 />, research: <FlaskConical />, ships: <Rocket />, defense: <Shield />, missions: <Crosshair />, quests: <Trophy />, alliance: <Users />, market: <ShoppingCart />, store: <Store /> };
const fmt = (value: bigint | number) =>
  typeof value === "bigint"
    ? value.toLocaleString()
    : Math.trunc(value).toLocaleString();
const vaultPasswordStorageKey = (wallet: string) => `${VAULT_PASSWORD_STORAGE_PREFIX}:${wallet}`;
const readRememberedVaultPassword = (wallet: string) => { try { return window.localStorage.getItem(vaultPasswordStorageKey(wallet)); } catch { return null; } };
const writeRememberedVaultPassword = (wallet: string, password: string) => { try { window.localStorage.setItem(vaultPasswordStorageKey(wallet), password); } catch { /* Optional local cache. */ } };
const clearRememberedVaultPassword = (wallet: string) => { try { window.localStorage.removeItem(vaultPasswordStorageKey(wallet)); } catch { /* Optional local cache. */ } };

function VaultPrompt({
  request,
  error,
  onSubmit,
  onCancel,
}: {
  request: VaultRecoveryPromptRequest;
  error?: string;
  onSubmit: (password: string, remember: boolean) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  useEffect(() => { setPassword(""); setRemember(false); }, [request.mode, request.wallet]);
  return (
    <div className="ug-modal">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (password.trim()) onSubmit(password.trim(), remember);
        }}
      >
        <h2>
          {request.mode === "create"
            ? "Create vault recovery password"
            : "Unlock game vault"}
        </h2>
        <p>This password unlocks your encrypted game-signing vault on this device.</p>
        <div className="ug-vault-notice">Your wallet remains the account owner. The vault is only used to sign game actions.</div>
        {error && <p className="ug-password-error">{error}</p>}
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Recovery password"
        />
        <label className="ug-remember-password"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span><b>Remember on this device</b><small>Stores the recovery password in this browser for this wallet.</small></span></label>
        <div>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit">Continue</button>
        </div>
      </form>
    </div>
  );
}

function PlanetDashboard({
  state,
  planets,
  target,
  onClose,
  onSelectSource,
  run,
  busy,
}: {
  state: PlayerState | null;
  planets: PlayerState[];
  target: MissionTarget;
  onClose: () => void;
  onSelectSource: (entity: string) => void;
  run: (
    label: string,
    action: (client: GameClient, entity: PublicKey) => Promise<unknown>,
  ) => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<Tab>(state ? "overview" : "missions");
  const [qty, setQty] = useState(1);
  const [missionType, setMissionType] = useState(2);
  const [missionShips, setMissionShips] = useState<Record<string, number>>({});
  const [missionCargo, setMissionCargo] = useState({ metal: "", crystal: "", deuterium: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = window.setInterval(
      () => setNowTs(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setTab("missions");
    setModalOpen(true);
    setMissionShips({});
    setMissionCargo({ metal: "", crystal: "", deuterium: "" });
    setMissionType(target.id.startsWith("empty:") ? 5 : 2);
  }, [target.id]);
  const owned = Boolean(state);
  const entity = state ? new PublicKey(state.entityPda) : null;
  const sourceCoords = target.system.split(":").map(Number);
  const nav: Tab[] = [
    "overview",
    "buildings",
    "research",
    "ships",
    "defense",
    "missions",
    "quests",
    "alliance",
    "market",
    "store",
  ];
  const resource = state?.resources;
  const energyEfficiency = resource ? resource.energyConsumption === 0n ? 100 : Math.min(100, Math.floor((Number(resource.energyProduction) / Number(resource.energyConsumption)) * 100)) : 0;
  const energyTone = energyEfficiency >= 100 ? "good" : energyEfficiency >= 36 ? "warn" : "danger";
  const mineRate = (level: number, base: number) => level <= 0 ? 0 : Math.floor(base * level * Math.pow(1.1, level));
  const nextBuildingEffect = (key: (typeof BUILDINGS)[number]["key"], level: number) => { const next = level + 1; if (key === "metalMine") return `+${fmt(mineRate(next, 30) - mineRate(level, 30))} metal/hour; energy draw +${fmt(mineRate(next, 10) - mineRate(level, 10))}.`; if (key === "crystalMine") return `+${fmt(mineRate(next, 20) - mineRate(level, 20))} crystal/hour; energy draw +${fmt(mineRate(next, 10) - mineRate(level, 10))}.`; if (key === "deuteriumSynthesizer") { const temperatureFactor = Math.max(0, 240 - activeState.planet.temperature) / 200; return `+${fmt(Math.floor((mineRate(next, 10) - mineRate(level, 10)) * temperatureFactor))} deuterium/hour; energy draw +${fmt(mineRate(next, 20) - mineRate(level, 20))}.`; } if (key === "solarPlant") return `+${fmt(mineRate(next, 20) - mineRate(level, 20))} energy production.`; if (key === "fusionReactor") { const multiplier = (100 + activeState.research.energyTech * 10) / 100; return `+${fmt(Math.floor((mineRate(next, 30) - mineRate(level, 30)) * 1.8 * multiplier))} energy production at current Energy Technology.`; } if (key === "roboticsFactory") return `Construction time -${Math.round((1 - (1 + level) / (2 + level)) * 100)}% for future building upgrades.`; if (key === "metalStorage" || key === "crystalStorage" || key === "deuteriumTank") return `Storage capacity doubles from ${fmt(10_000 * 2 ** level)} to ${fmt(10_000 * 2 ** next)}.`; return NEXT_BUILDING_EFFECT[key]; };
  const activeState = state as PlayerState;
  const queueLabel = (finishAt: number, idle: boolean) => {
    if (idle) return "Idle";
    const seconds = Math.max(0, finishAt - Math.floor(Date.now() / 1000));
    if (seconds === 0) return "Ready";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = seconds % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${remaining}s`;
  };
  const queueSeconds = (finishAt: number) => Math.max(0, finishAt - nowTs);
  const queues = owned
    ? [
        {
          id: "building",
          label: "Construction",
          item:
            BUILDINGS[activeState.planet.buildQueueItem]?.name ??
            "Building upgrade",
          finishAt: activeState.planet.buildFinishTs,
          idle: activeState.planet.buildQueueItem === 255,
          finish: (client: GameClient, entityPda: PublicKey) =>
            client.finishBuild(entityPda),
          accelerate: (client: GameClient, entityPda: PublicKey) =>
            client.accelerateBuildWithAntimatter(entityPda),
        },
        {
          id: "research",
          label: "Research",
          item: RESEARCH[activeState.research.queueItem] ?? "Research project",
          finishAt: activeState.research.researchFinishTs,
          idle: activeState.research.queueItem === 255,
          finish: (client: GameClient, entityPda: PublicKey) =>
            client.finishResearch(entityPda),
          accelerate: (client: GameClient, entityPda: PublicKey) =>
            client.accelerateResearchWithAntimatter(entityPda),
        },
        {
          id: "shipyard",
          label: "Shipyard",
          item: `${SHIPS[activeState.planet.shipBuildItem]?.name ?? "Ship build"} x${activeState.planet.shipBuildQty}`,
          finishAt: activeState.planet.shipBuildFinishTs,
          idle: activeState.planet.shipBuildItem === 255,
          finish: (client: GameClient, entityPda: PublicKey) =>
            client.finishShipBuild(entityPda),
          accelerate: (client: GameClient, entityPda: PublicKey) =>
            client.accelerateShipBuildWithAntimatter(entityPda),
        },
        {
          id: "defense",
          label: "Defense yard",
          item: `${DEFENSE[activeState.planet.defenseBuildItem] ?? "Defense build"} x${activeState.planet.defenseBuildQty}`,
          finishAt: activeState.planet.defenseBuildFinishTs,
          idle: activeState.planet.defenseBuildItem === 255,
          finish: (client: GameClient, entityPda: PublicKey) =>
            client.finishDefenseBuild(entityPda),
          accelerate: (client: GameClient, entityPda: PublicKey) =>
            client.accelerateDefenseBuildWithAntimatter(entityPda),
        },
      ]
    : [];
  const constructionBusy = owned && activeState.planet.buildQueueItem !== 255;
  const researchBusy = owned && activeState.research.queueItem !== 255;
  const shipyardBusy =
    owned &&
    (activeState.planet.shipBuildItem !== 255 ||
      activeState.planet.defenseBuildItem !== 255);
  const renderQueueCard = (queue: (typeof queues)[number]) => {
    const seconds = queueSeconds(queue.finishAt);
    const ready = !queue.idle && seconds === 0;
    const accelerationCost = BigInt(seconds) * 1_000_000n;
    const canAccelerate = latestAntimatterBalance >= accelerationCost;
    return (
      <article
        key={queue.id}
        className={`ug-queue-card ${queue.idle ? "idle" : ready ? "ready" : "running"}`}
      >
        <div className="ug-queue-card-top">
          <div className="resource-metal">
            <span>{queue.label}</span>
            <strong>{queue.idle ? "No active order" : queue.item}</strong>
          </div>
          <b>{queueLabel(queue.finishAt, queue.idle)}</b>
        </div>
        <div
          className="ug-progress"
          aria-label={
            queue.idle
              ? "Queue idle"
              : ready
                ? "Queue ready"
                : "Queue in progress"
          }
        >
          <i />
        </div>
        {!queue.idle && (
          <div className="ug-queue-actions">
            {ready ? (
              <button
                disabled={busy}
                onClick={() =>
                  run(`Finish ${queue.label.toLowerCase()}`, queue.finish)
                }
              >
                Finish
              </button>
            ) : (
              <button
                className="ug-accelerate"
                disabled={busy || !canAccelerate}
                title={
                  canAccelerate
                    ? `Burn ${fmt(seconds)} ANTIMATTER to finish immediately.`
                    : "Not enough ANTIMATTER to finish immediately."
                }
                onClick={() =>
                  run(
                    `Accelerate ${queue.label.toLowerCase()}`,
                    queue.accelerate,
                  )
                }
              >
                Finish now · {fmt(seconds)} AM
              </button>
            )}
          </div>
        )}
      </article>
    );
  };
  const launch = () => {
    if (!entity || !state) return;
    const [galaxy, system, position] = sourceCoords;
    const emptyTarget = target.id.startsWith("empty:");
    if (missionType === 5 && !emptyTarget) return;
    if ((missionType === 1 || missionType === 2 || missionType === 6) && emptyTarget) return;
    const shipCount = (key: string) => Math.max(0, Math.min(Number((state.fleet as any)[key] ?? 0), Math.floor(missionShips[key] ?? 0)));
    const ships = {
      sc: shipCount("smallCargo"), lc: shipCount("largeCargo"), lf: shipCount("lightFighter"), hf: shipCount("heavyFighter"), cr: shipCount("cruiser"), bs: shipCount("battleship"), bc: shipCount("battlecruiser"), bm: shipCount("bomber"), ds: shipCount("destroyer"), de: shipCount("deathstar"), rec: shipCount("recycler"), ep: shipCount("espionageProbe"), col: shipCount("colonyShip"),
    };
    if (missionType === 6 && (ships.ep < 1 || Object.entries(ships).some(([key, value]) => key !== "ep" && value > 0))) return;
    if (missionType === 5 && ships.col < 1) return;
    const cargo = { metal: BigInt(Math.max(0, Number(missionCargo.metal) || 0)), crystal: BigInt(Math.max(0, Number(missionCargo.crystal) || 0)), deuterium: BigInt(Math.max(0, Number(missionCargo.deuterium) || 0)) };
    run("Launch mission", (client, source) =>
      client.launchFleet(source, ships, missionType === 6 || missionType === 5 ? {} : cargo, missionType, 100, {
        galaxy,
        system,
        position,
        colonyName: missionType === 5 ? `Colony ${position}` : undefined,
      }),
    );
  };
  const missionLabel = (mission: Mission) => ({ 1: "Attack", 2: "Transport", 5: "Colonize", 6: "Espionage" }[mission.missionType] ?? "Mission");
  const resolveMission = (mission: Mission, slot: number) => run(`Resolve ${missionLabel(mission).toLowerCase()}`, (client, source) => {
    if (mission.missionType === 1) return client.resolveAttack(source, mission, slot);
    if (mission.missionType === 2) return client.resolveTransport(source, mission, slot);
    if (mission.missionType === 5) return client.resolveColonize(source, mission, slot, Math.floor(Date.now() / 1000));
    return client.resolveEspionage(source, mission, slot);
  });
  return (
    <section className="ug-command-shell">
      <aside className={`ug-command-rail ${railOpen ? "" : "collapsed"}`}>
        <button className="ug-rail-toggle" title={railOpen ? "Hide operations" : "Show operations"} aria-label={railOpen ? "Hide operations" : "Show operations"} onClick={() => setRailOpen((open) => !open)}>{railOpen ? <ChevronRight /> : <ChevronLeft />}</button>
        {railOpen && owned && (
          <nav>
            {nav.map((item) => (
              <button
                key={item}
                className={tab === item ? "active" : ""}
                title={item}
                aria-label={item}
                onClick={() => {
                  setTab(item);
                  setModalOpen(true);
                }}
              >
                {TAB_ICONS[item]}
              </button>
            ))}
          </nav>
        )}
      </aside>
      <section className={`ug-dashboard ${modalOpen ? "" : "closed"}`}>
        <header>
        <div>
          <small>ACTIVE PLANET</small>
          <h1>{state?.planet.name ?? target.name}</h1>
          <span>
            {state
              ? `${state.planet.galaxy}:${state.planet.system}:${state.planet.position}`
              : target.system}
          </span>
        </div>
        <button aria-label="Close command modal" onClick={() => setModalOpen(false)}>
          Close
        </button>
        </header>
      <div className="ug-source-select">
        <label>COMMAND FROM</label>
        <select
          value={state?.entityPda ?? ""}
          onChange={(event) => onSelectSource(event.target.value)}
        >
          <option value="">Select one of your planets</option>
          {planets.map((planet) => (
            <option key={planet.entityPda} value={planet.entityPda}>
              {planet.planet.name} · {planet.planet.galaxy}:
              {planet.planet.system}:{planet.planet.position}
            </option>
          ))}
        </select>
      </div>
      {!owned && (
        <p className="ug-target-note">
          Choose a source planet above to open its operations and launch toward
          this target.
        </p>
      )}
      {owned && resource && (
        <div className="ug-resource-strip">
          <div className="resource-metal">
            <span><Pickaxe /> Metal</span>
            <b>{fmt(resource.metal)}</b>
          </div>
          <div className="resource-crystal">
            <span><Gem /> Crystal</span>
            <b>{fmt(resource.crystal)}</b>
          </div>
          <div className="resource-deuterium">
            <span><FlaskConical /> Deuterium</span>
            <b>{fmt(resource.deuterium)}</b>
          </div>
          <div className={`resource-energy ${energyTone}`}>
            <span><Zap /> Energy</span>
            <b>
              {fmt(resource.energyProduction)} /{" "}
              {fmt(resource.energyConsumption)}
            </b>
            <i style={{ width: `${energyEfficiency}%` }} />
          </div>
        </div>
      )}
      {owned && tab === "overview" && (
        <div className="ug-content">
          <h2>Command status</h2>
          <div className="ug-grid">
            <div>
              Fields{" "}
              <b>
                {activeState.planet.usedFields}/{activeState.planet.maxFields}
              </b>
            </div>
            <div>
              Temperature <b>{activeState.planet.temperature}</b>
            </div>
            <div>
              Shield{" "}
              <b>
                {activeState.planet.protectionUntilTs > nowTs
                  ? "Protected"
                  : "Offline"}
              </b>
            </div>
            <div>
              Active missions <b>{activeState.fleet.activeMissions}</b>
            </div>
          </div>
          <h3>Production queues</h3>
          <div className="ug-queue-grid">
            {queues.map((queue) => {
              const seconds = queueSeconds(queue.finishAt);
              const ready = !queue.idle && seconds === 0;
              const accelerationCost = BigInt(seconds) * 1_000_000n;
              const canAccelerate = latestAntimatterBalance >= accelerationCost;
              return (
                <article
                  key={queue.id}
                  className={`ug-queue-card ${queue.idle ? "idle" : ready ? "ready" : "running"}`}
                >
                  <div className="ug-queue-card-top">
                    <div>
                      <span>{queue.label}</span>
                      <strong>
                        {queue.idle ? "No active order" : queue.item}
                      </strong>
                    </div>
                    <b>{queueLabel(queue.finishAt, queue.idle)}</b>
                  </div>
                  <div
                    className="ug-progress"
                    aria-label={
                      queue.idle
                        ? "Queue idle"
                        : ready
                          ? "Queue ready"
                          : "Queue in progress"
                    }
                  >
                    <i />
                  </div>
                  {!queue.idle && (
                    <div className="ug-queue-actions">
                      {ready ? (
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(
                              `Finish ${queue.label.toLowerCase()}`,
                              queue.finish,
                            )
                          }
                        >
                          Finish
                        </button>
                      ) : (
                        <button
                          className="ug-accelerate"
                          disabled={busy || !canAccelerate}
                          title={
                            canAccelerate
                              ? `Burn ${fmt(seconds)} ANTIMATTER to finish immediately.`
                              : "Not enough ANTIMATTER to finish immediately."
                          }
                          onClick={() =>
                            run(
                              `Accelerate ${queue.label.toLowerCase()}`,
                              queue.accelerate,
                            )
                          }
                        >
                          Finish now · {fmt(seconds)} AM
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
      {owned && tab === "buildings" && (
        <div className="ug-content ug-cards">
          <div className="ug-tab-queue">
            {queues[0] && renderQueueCard(queues[0])}
          </div>
          <div className="ug-operation-note">
            {constructionBusy
              ? "Construction queue active. Finish or accelerate it above."
              : "One construction order can run at a time."}
          </div>
          {BUILDINGS.map((building) => {
            const level = (activeState.planet as any)[building.key] as number;
            const [metal, crystal, deuterium] = upgradeCost(building.idx, level);
            return <article key={building.key} className="ug-unit-card">
              <div className="ug-unit-art" style={{ backgroundImage: resolveGameArt(building.key, "none") }} />
              <div className="ug-unit-copy">
                <h3>{building.name}</h3>
                <p>{nextBuildingEffect(building.key, level)}</p>
                <b>Level {level} <span>to {level + 1}</span></b>
                <div className="ug-cost-row">{metal > 0 && <span className="cost-metal" title="Metal"><Pickaxe />{fmt(metal)}</span>}{crystal > 0 && <span className="cost-crystal" title="Crystal"><Gem />{fmt(crystal)}</span>}{deuterium > 0 && <span className="cost-deuterium" title="Deuterium"><FlaskConical />{fmt(deuterium)}</span>}</div>
              </div>
              <button
                disabled={busy || constructionBusy}
                onClick={() =>
                  run(`Upgrade ${building.name}`, (client, source) =>
                    client.startBuild(source, building.idx),
                  )
                }
              >
                {constructionBusy ? "Queue active" : "Upgrade"}
              </button>
            </article>;
          })}
        </div>
      )}
      {owned && tab === "research" && (
        <div className="ug-content ug-cards">
          <div className="ug-tab-queue">
            {queues[1] && renderQueueCard(queues[1])}
          </div>
          <div className="ug-operation-note">
            {researchBusy
              ? "Research is in progress. Finish or accelerate it above."
              : "One research project can run at a time."}
          </div>
          {RESEARCH.map((name, index) => { const level = (activeState.research as any)[RESEARCH_KEYS[index]] as number; const detail = RESEARCH_DETAILS[index]; const [baseMetal, baseCrystal, baseDeuterium] = detail.cost; const multiplier = 2 ** level; return (
            <article key={name} className="ug-unit-card">
              <div className="ug-unit-art" style={{ backgroundImage: resolveGameArt(RESEARCH_KEYS[index], "none") }} />
              <div className="ug-unit-copy">
                <h3>{name}</h3>
                <p>Next level {detail.desc.charAt(0).toLowerCase() + detail.desc.slice(1)}</p>
                <b>
                  Level {level} <span>to {level + 1}</span>
                </b>
                <div className="ug-cost-row">{baseMetal > 0 && <span className="cost-metal" title="Metal"><Pickaxe />{fmt(baseMetal * multiplier)}</span>}{baseCrystal > 0 && <span className="cost-crystal" title="Crystal"><Gem />{fmt(baseCrystal * multiplier)}</span>}{baseDeuterium > 0 && <span className="cost-deuterium" title="Deuterium"><FlaskConical />{fmt(baseDeuterium * multiplier)}</span>}</div>
              </div>
              <button
                disabled={busy || researchBusy}
                onClick={() =>
                  run(`Research ${name}`, (client, source) =>
                    client.startResearch(source, index),
                  )
                }
              >
                {researchBusy ? "Research active" : "Research"}
              </button>
            </article>
          ); })}
        </div>
      )}
      {owned && tab === "ships" && (
        <div className="ug-content ug-cards">
          <div className="ug-tab-queue">
            {queues[2] && renderQueueCard(queues[2])}
            {queues[3] && renderQueueCard(queues[3])}
          </div>
          <div className="ug-operation-note">
            {shipyardBusy
              ? "Shipyard queue active. Finish or accelerate it above."
              : "Ships and defenses share one shipyard queue."}
          </div>
          <label className="ug-qty">
            Quantity{" "}
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(event) =>
                setQty(Math.max(1, Number(event.target.value) || 1))
              }
            />
          </label>
          {SHIPS.map((ship) => (
            <article key={ship.key} className="ug-unit-card">
              <div className="ug-unit-art" style={{ backgroundImage: resolveGameArt(ship.key, "none") }} />
              <div className="ug-unit-copy">
                <h3>{ship.name}</h3>
                <b>Owned {(activeState.fleet as any)[ship.key]}</b>
                <div className="ug-cost-row">{ship.cost.m > 0 && <span className="cost-metal" title="Metal"><Pickaxe />{fmt(ship.cost.m * qty)}</span>}{ship.cost.c > 0 && <span className="cost-crystal" title="Crystal"><Gem />{fmt(ship.cost.c * qty)}</span>}{ship.cost.d > 0 && <span className="cost-deuterium" title="Deuterium"><FlaskConical />{fmt(ship.cost.d * qty)}</span>}</div>
              </div>
              <button
                disabled={busy || shipyardBusy}
                onClick={() =>
                  run(`Build ${ship.name}`, (client, source) =>
                    client.buildShip(source, SHIP_TYPE_IDX[ship.key], qty),
                  )
                }
              >
                {shipyardBusy ? "Queue active" : "Build"}
              </button>
            </article>
          ))}
        </div>
      )}
      {owned && tab === "defense" && (
        <div className="ug-content ug-cards">
          <div className="ug-tab-queue">
            {queues[2] && renderQueueCard(queues[2])}
            {queues[3] && renderQueueCard(queues[3])}
          </div>
          <div className="ug-operation-note">
            {shipyardBusy
              ? "Shipyard queue active. Finish or accelerate it above."
              : "Ships and defenses share one shipyard queue."}
          </div>
          <label className="ug-qty">
            Quantity{" "}
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(event) =>
                setQty(Math.max(1, Number(event.target.value) || 1))
              }
            />
          </label>
          {DEFENSE.map((name, index) => { const [metal, crystal, deuterium] = DEFENSE_COSTS[index]; return (
            <article key={name} className="ug-unit-card">
              <div className="ug-unit-art" style={{ backgroundImage: resolveGameArt(DEFENSE_KEYS[index], "none") }} />
              <div className="ug-unit-copy">
                <h3>{name}</h3>
                <b>Online {(activeState.planet as any)[DEFENSE_KEYS[index]]}</b>
                <div className="ug-cost-row">{metal > 0 && <span className="cost-metal" title="Metal"><Pickaxe />{fmt(metal * qty)}</span>}{crystal > 0 && <span className="cost-crystal" title="Crystal"><Gem />{fmt(crystal * qty)}</span>}{deuterium > 0 && <span className="cost-deuterium" title="Deuterium"><FlaskConical />{fmt(deuterium * qty)}</span>}</div>
              </div>
              <button
                disabled={busy || shipyardBusy}
                onClick={() =>
                  run(`Build ${name}`, (client, source) =>
                    client.buildDefense(source, index, qty),
                  )
                }
              >
                {shipyardBusy ? "Queue active" : "Build"}
              </button>
            </article>
          ); })}
        </div>
      )}
      {owned && tab === "missions" && (
        <div className="ug-content">
          <h2>Mission control</h2>
          {activeState.fleet.missions.filter((mission) => mission.missionType !== 0).length > 0 && <><h3>Active missions</h3><div className="ug-queue-grid">{activeState.fleet.missions.map((mission, slot) => {
            if (mission.missionType === 0) return null;
            const resolvingAt = mission.applied ? mission.returnTs : mission.arriveTs;
            const ready = nowTs >= resolvingAt;
            return <article key={slot} className={`ug-queue-card ${ready ? "ready" : "running"}`}><div className="ug-queue-card-top"><div><span>{missionLabel(mission)}</span><strong>{mission.targetGalaxy}:{mission.targetSystem}:{mission.targetPosition}</strong></div><b>{ready ? "Ready" : queueLabel(resolvingAt, false)}</b></div><div className="ug-progress"><i /></div><div className="ug-queue-actions">{ready ? <button disabled={busy} onClick={() => resolveMission(mission, slot)}>Resolve</button> : <button className="ug-accelerate" disabled={busy} onClick={() => run("Accelerate mission", (client, source) => client.accelerateMissionWithAntimatter(source, slot, mission.applied ? 1 : 0))}>Finish now</button>}</div></article>;
          })}</div></>}
          <p>Target: {target.name} · {target.system}</p>
          <div className="ug-actions">
            {target.id.startsWith("empty:") ? <button className="active">Colonize</button> : <><button className={missionType === 2 ? "active" : ""} onClick={() => setMissionType(2)}>Transport</button><button className={missionType === 1 ? "active" : ""} onClick={() => setMissionType(1)}>Attack</button><button className={missionType === 6 ? "active" : ""} onClick={() => setMissionType(6)}>Espionage</button></>}
          </div>
          <h3>Fleet selection</h3>
          <div className="ug-grid">
            {SHIPS.filter((ship) => ship.key !== "solarSatellite" && (missionType !== 6 || ship.key === "espionageProbe") && (missionType !== 5 || ship.key === "colonyShip" || ship.key === "smallCargo" || ship.key === "largeCargo")).map((ship) => (
              <div key={ship.key}><span>{ship.name} <b>Available {(activeState.fleet as any)[ship.key] ?? 0}</b></span><input type="number" min="0" max={(activeState.fleet as any)[ship.key] ?? 0} value={missionShips[ship.key] ?? ""} onChange={(event) => setMissionShips((current) => ({ ...current, [ship.key]: Math.max(0, Number(event.target.value) || 0) }))} /></div>
            ))}
          </div>
          {missionType !== 6 && missionType !== 5 && <><h3>Load cargo</h3><div className="ug-grid">{(["metal", "crystal", "deuterium"] as const).map((resourceKey) => <div key={resourceKey}><span>{resourceKey}</span><input type="number" min="0" value={missionCargo[resourceKey]} onChange={(event) => setMissionCargo((cargo) => ({ ...cargo, [resourceKey]: event.target.value }))} /></div>)}</div></>}
          <div className="ug-actions">
            <button disabled={busy} onClick={launch}>Launch {missionType === 1 ? "attack" : missionType === 2 ? "transport" : missionType === 5 ? "colony" : "espionage"} mission</button>
          </div>
        </div>
      )}
      {owned && ["quests", "alliance", "market", "store"].includes(tab) && (
        <div className="ug-content">
          <h2>{tab}</h2>
          <p>
            This surface is being migrated onto the universe UI next. Its
            existing on-chain instructions remain available in the production
            app while this parallel client is built out.
          </p>
        </div>
      )}
      </section>
    </section>
  );
}

export default function UniverseGame() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const [planets, setPlanets] = useState<PlayerState[]>([]);
  const [target, setTarget] = useState<MissionTarget | null>(null);
  const [planetWorldEntity, setPlanetWorldEntity] = useState<string | null>(null);
  const [returnSystem, setReturnSystem] = useState<{ galaxy: number; system: number } | null>(null);
  const [sourceEntity, setSourceEntity] = useState("");
  const [loadingPlanets, setLoadingPlanets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [homeworldName, setHomeworldName] = useState("Homeworld");
  const [vaultRequest, setVaultRequest] =
    useState<VaultRecoveryPromptRequest | null>(null);
  const [vaultPasswordError, setVaultPasswordError] = useState("");
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>("loading");
  const [vaultBalance, setVaultBalance] = useState(0n);
  const [vaultDeposit, setVaultDeposit] = useState("0.05");
  const [vaultWithdraw, setVaultWithdraw] = useState("");
  const [vaultActionBusy, setVaultActionBusy] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [antimatterBalance, setAntimatterBalance] = useState(0n);
  const [usdcBalance, setUsdcBalance] = useState(0n);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 5_000);
    return () => window.clearTimeout(timer);
  }, [status]);
  useEffect(() => {
    if (!operation || operation.phase === "processing") return;
    const timer = window.setTimeout(() => setOperation(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [operation]);
  const resolveVault = useRef<((value: string) => void) | null>(null);
  const requestVault = useCallback(
    (request: VaultRecoveryPromptRequest) =>
      new Promise<string>((resolve) => {
        const remembered = request.mode === "unlock" ? readRememberedVaultPassword(request.wallet) : null;
        if (remembered) { resolve(remembered); return; }
        resolveVault.current = resolve;
        setVaultRequest(request);
      }),
    [],
  );
  const client = useMemo(
    () =>
      anchorWallet
        ? new GameClient(
            connection,
            new AnchorProvider(connection, anchorWallet, {
              commitment: "confirmed",
            }),
            {
              requestVaultRecoveryPassphrase: requestVault,
              onVaultRecoveryPassphraseRejected: (wallet) => {
                clearRememberedVaultPassword(wallet);
                setVaultPasswordError(
                  "Incorrect recovery password. Try again.",
                );
                setVaultStatus("wrong_password");
              },
            },
          )
        : null,
    [anchorWallet, connection, requestVault],
  );
  const marketClient = useMemo(
    () => client && anchorWallet
      ? new MarketClient(connection, new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" }), client)
      : null,
    [anchorWallet, client, connection],
  );
  const refresh = useCallback(async () => {
    if (!client || !publicKey) {
      setPlanets([]);
      setLoadingPlanets(false);
      return;
    }
    setLoadingPlanets(true);
    try {
      const loaded = await client.findPlanets(publicKey);
      setPlanets(loaded);
      setSourceEntity((current) =>
        current && loaded.some((planet) => planet.entityPda === current)
          ? current
          : (loaded[0]?.entityPda ?? ""),
      );
    } finally {
      setLoadingPlanets(false);
    }
  }, [client, publicKey]);
  useEffect(() => {
    void refresh().catch((error) =>
      setStatus(
        error instanceof Error ? error.message : "Could not load planets.",
      ),
    );
  }, [refresh]);
  useEffect(() => {
    if (!client || !publicKey) {
      setAntimatterBalance(0n);
      setUsdcBalance(0n);
      return;
    }
    let cancelled = false;
    const loadBalances = async () => {
      try {
        const [gameConfig, storeConfig] = await Promise.all([
          client.getGameConfig(),
          client.getStoreConfig(),
        ]);
        const load = async (mintAddress?: string) => {
          if (!mintAddress) return 0n;
          const response = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { mint: new PublicKey(mintAddress), programId: TOKEN_PROGRAM_ID },
            "confirmed",
          );
          return response.value.reduce(
            (total, account) =>
              total +
              BigInt(
                (account.account.data as any)?.parsed?.info?.tokenAmount
                  ?.amount ?? "0",
              ),
            0n,
          );
        };
        const [antimatter, usdc] = await Promise.all([
          load(gameConfig?.antimatterMint),
          load(storeConfig?.usdcMint),
        ]);
        if (!cancelled) {
          setAntimatterBalance(antimatter);
          setUsdcBalance(usdc);
        }
      } catch {
        if (!cancelled) {
          setAntimatterBalance(0n);
          setUsdcBalance(0n);
        }
      }
    };
    void loadBalances();
    return () => {
      cancelled = true;
    };
  }, [client, connection, publicKey]);
  latestAntimatterBalance = antimatterBalance;
  const selectedState =
    planets.find((planet) => planet.entityPda === sourceEntity) ?? null;
  const planetWorldState = planets.find((planet) => planet.entityPda === planetWorldEntity) ?? null;
  // Selecting a source planet is not a command. Keep the universe visible
  // until the player explicitly opens a planet or target from the map/roster.
  const commandTarget: MissionTarget | null = target;
  const runForEntity = async (
    label: string,
    entityPda: string,
    action: (game: GameClient, entity: PublicKey) => Promise<unknown>,
  ) => {
    if (!client || !entityPda) return;
    setBusy(true);
    setStatus(`${label}...`);
    setOperation({ label, detail: "Preparing your command and verifying the active world.", phase: "processing" });
    try {
      await action(client, new PublicKey(entityPda));
      await refresh();
      setStatus(`${label} submitted.`);
      setOperation({ label, detail: "The transaction was confirmed and your command state has been refreshed.", phase: "success" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : `${label} failed.`;
      setStatus(detail);
      setOperation({ label, detail, phase: "error" });
    } finally {
      setBusy(false);
    }
  };
  const run = async (
    label: string,
    action: (game: GameClient, entity: PublicKey) => Promise<unknown>,
  ) => runForEntity(label, selectedState?.entityPda ?? "", action);
  const createHomeworld = async () => {
    if (!client) return;
    setBusy(true);
    setStatus("Creating homeworld...");
    setOperation({ label: "Establish homeworld", detail: "Preparing your command vault and reserving an empty world.", phase: "processing" });
    try {
      await client.initializePlanet(homeworldName, (message) => {
        setStatus(message);
        setOperation({ label: "Establish homeworld", detail: message, phase: "processing" });
      });
      await refresh();
      await refreshVaultBalance();
      setStatus("Homeworld created.");
      setOperation({ label: "Establish homeworld", detail: "Your homeworld is live and ready for command.", phase: "success" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Homeworld creation failed.";
      setStatus(detail);
      setOperation({ label: "Establish homeworld", detail, phase: "error" });
    } finally {
      setBusy(false);
    }
  };
  const walletLabel = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : "CONNECT";
  const tokenLabel = (amount: bigint) =>
    (
      Number(amount / 1_000_000n) +
      Number(amount % 1_000_000n) / 1_000_000
    ).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const unlockVault = async () => {
    if (!client || !publicKey) return;
    setVaultPasswordError("");
    setBusy(true);
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const restored = await client.restoreExistingVault();
        if (restored) {
          setVaultStatus("ready");
          return;
        }
        const nextStatus = await client.getVaultStatus();
        setVaultStatus(nextStatus);
        if (nextStatus !== "wrong_password") return;
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Vault unlock failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const refreshVaultBalance = useCallback(async () => {
    if (!client) {
      setVaultBalance(0n);
      return;
    }
    try {
      setVaultBalance(BigInt(await client.getVaultBalanceLamports()));
    } catch {
      setVaultBalance(0n);
    }
  }, [client]);
  const parseSolAmount = (value: string) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter a SOL amount greater than zero.");
    }
    return Math.floor(amount * 1_000_000_000);
  };
  const depositVault = async () => {
    if (!client) return;
    setVaultActionBusy(true);
    setOperation({ label: "Fund vault", detail: "Requesting your wallet signature to move SOL into the game vault.", phase: "processing" });
    try {
      await client.depositToVaultLamports(parseSolAmount(vaultDeposit));
      await refreshVaultBalance();
      setStatus("Vault funded.");
      setOperation({ label: "Fund vault", detail: "SOL is available for game account rent and vault-signed commands.", phase: "success" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Vault funding failed.";
      setStatus(detail);
      setOperation({ label: "Fund vault", detail, phase: "error" });
    } finally {
      setVaultActionBusy(false);
    }
  };
  const withdrawVault = async () => {
    if (!client) return;
    setVaultActionBusy(true);
    setOperation({ label: "Withdraw from vault", detail: "Moving SOL from your game vault back to the connected wallet.", phase: "processing" });
    try {
      await client.withdrawVaultLamports(parseSolAmount(vaultWithdraw));
      await refreshVaultBalance();
      setStatus("Vault withdrawal submitted.");
      setOperation({ label: "Withdraw from vault", detail: "The vault balance has been refreshed.", phase: "success" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Vault withdrawal failed.";
      setStatus(detail);
      setOperation({ label: "Withdraw from vault", detail, phase: "error" });
    } finally {
      setVaultActionBusy(false);
    }
  };
  useEffect(() => {
    if (!client || !publicKey) {
      setVaultStatus("loading");
      return;
    }
    void unlockVault();
  }, [client, publicKey]);
  useEffect(() => {
    void refreshVaultBalance();
  }, [refreshVaultBalance, vaultStatus]);
  const shieldActive = Boolean(
    selectedState &&
    selectedState.planet.protectionUntilTs > Math.floor(Date.now() / 1000),
  );
  return (
    <main className="universe-game-root">
      {!planetWorldState && <UniverseLab
        embedded
        onOpenCommand={(planet) => {
          const ownedPlanet = planets.find((candidate) => candidate.entityPda === planet.id);
          if (ownedPlanet) {
            setSourceEntity(ownedPlanet.entityPda);
            setPlanetWorldEntity(ownedPlanet.entityPda);
            return;
          }
          setTarget(planet);
        }}
        onOpenEmptyTarget={(empty) =>
          setTarget({
            id: `empty:${empty.galaxy}:${empty.system}:${empty.position}`,
            name: `Empty position ${empty.position}`,
            system: `${empty.galaxy}:${empty.system}:${empty.position}`,
          })
        }
        ownedPlanets={planets.map((planet) => ({
          entity: planet.entityPda,
          name: planet.planet.name,
          galaxy: planet.planet.galaxy,
          system: planet.planet.system,
          position: planet.planet.position,
        }))}
        activeOwnedPlanet={sourceEntity}
        initialGalaxy={returnSystem?.galaxy}
        initialSystem={returnSystem?.system}
        onOperatePlanet={(planet) => {
          setSourceEntity(planet.entity);
          setPlanetWorldEntity(planet.entity);
        }}
      />}
      {planetWorldState && (
        <PlanetWorld
          state={planetWorldState}
          busy={busy}
          run={(label, action) => runForEntity(label, planetWorldState.entityPda, action)}
          game={client}
          market={marketClient}
          worlds={planets.map((planet) => ({ entity: planet.entityPda, name: planet.planet.name || `Planet ${planet.planet.planetIndex + 1}` }))}
          onExit={() => {
            setReturnSystem({ galaxy: planetWorldState.planet.galaxy, system: planetWorldState.planet.system });
            setPlanetWorldEntity(null);
          }}
          wallet={publicKey ? {
            label: walletLabel,
            worlds: planets.length,
            shieldActive,
            vaultStatus,
            vaultSol: (Number(vaultBalance) / 1_000_000_000).toFixed(4),
            antimatter: tokenLabel(antimatterBalance),
            usdc: tokenLabel(usdcBalance),
          } : null}
          vaultControls={{
            depositAmount: vaultDeposit,
            withdrawAmount: vaultWithdraw,
            onDepositAmountChange: setVaultDeposit,
            onWithdrawAmountChange: setVaultWithdraw,
            onDeposit: depositVault,
            onWithdraw: withdrawVault,
            busy: vaultActionBusy,
          }}
          allianceBalances={{ usdc: usdcBalance, antimatter: antimatterBalance }}
        />
      )}
      {!planetWorldState && <header className="ug-top">
        {publicKey ? (
          <>
            <button
              className="ug-wallet-trigger"
              onClick={() => setWalletMenuOpen((open) => !open)}
            >
              {walletLabel}
            </button>
            {walletMenuOpen && createPortal(
              <>
                <button
                  className="ug-wallet-scrim"
                  aria-label="Close wallet menu"
                  onClick={() => setWalletMenuOpen(false)}
                />
                <section className="ug-wallet-menu">
                  <header>
                    <span>WALLET</span>
                    <button onClick={() => setWalletMenuOpen(false)}>×</button>
                  </header>
                  <div className="ug-wallet-row">
                    <span>Network</span>
                    <b>DEVNET</b>
                  </div>
                  <div className="ug-wallet-row">
                    <span>Wallet</span>
                    <b>{walletLabel}</b>
                  </div>
                  <div className="ug-wallet-row">
                    <span>Command worlds</span>
                    <b>{planets.length}</b>
                  </div>
                  <div className="ug-wallet-row">
                    <span>Shield</span>
                    <b className={shieldActive ? "good" : ""}>
                      {shieldActive ? "ACTIVE" : "OFF"}
                    </b>
                  </div>
                  <div className="ug-wallet-row">
                    <span>Vault</span>
                    <b className={vaultStatus === "ready" ? "good" : ""}>
                      {vaultStatus.replace(/_/g, " ")}
                    </b>
                  </div>
                  <div className="ug-wallet-row">
                    <span>Vault SOL</span>
                    <b>{(Number(vaultBalance) / 1_000_000_000).toFixed(4)} SOL</b>
                  </div>
                  <div className="ug-wallet-row">
                    <span>Antimatter</span>
                    <b>{tokenLabel(antimatterBalance)} AM</b>
                  </div>
                  <div className="ug-wallet-row">
                    <span>USDC</span>
                    <b>{tokenLabel(usdcBalance)} USDC</b>
                  </div>
                  <div className="ug-wallet-actions">
                    <WalletModalButton>CHANGE WALLET</WalletModalButton>
                    <WalletDisconnectButton>DISCONNECT</WalletDisconnectButton>
                  </div>
                  {vaultStatus === "ready" && (
                    <section className="ug-vault-controls">
                      <p>Keep at least 0.05 SOL in the vault for game account rent.</p>
                      <label>
                        <span>DEPOSIT SOL</span>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={vaultDeposit}
                          onChange={(event) => setVaultDeposit(event.target.value)}
                          disabled={vaultActionBusy}
                        />
                        <button disabled={vaultActionBusy} onClick={() => void depositVault()}>DEPOSIT</button>
                      </label>
                      <label>
                        <span>WITHDRAW SOL</span>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          placeholder="0.00"
                          value={vaultWithdraw}
                          onChange={(event) => setVaultWithdraw(event.target.value)}
                          disabled={vaultActionBusy}
                        />
                        <button disabled={vaultActionBusy} onClick={() => void withdrawVault()}>WITHDRAW</button>
                      </label>
                    </section>
                  )}
                </section>
              </>,
              document.body,
            )}
          </>
        ) : (
          <WalletMultiButton />
        )}
      </header>}
      {!planetWorldState && publicKey && loadingPlanets && (
        <section className="ug-connecting" role="status">
          <div className="ug-loader" />
          <strong>CONNECTING TO COMMAND NETWORK</strong>
          <span>Loading your on-chain planets and vault status</span>
        </section>
      )}
      {!planetWorldState && publicKey && !loadingPlanets && planets.length === 0 && (
        <section className="ug-homeworld">
          <h1>Establish your homeworld</h1>
          <p>
            No planet is registered to this wallet. A real on-chain
            initialization will choose an empty coordinate.
          </p>
          <input
            value={homeworldName}
            maxLength={32}
            onChange={(event) => setHomeworldName(event.target.value)}
          />
          <button disabled={busy} onClick={createHomeworld}>
            Create planet
          </button>
        </section>
      )}
      {!planetWorldState && !publicKey && (
        <section className="ug-homeworld">
          <h1>Enter the universe</h1>
          <p>Connect a wallet to load owned planets and create a homeworld.</p>
        </section>
      )}
      {status && <div className="ug-status">{status}</div>}
      <OperationModal operation={operation} onClose={() => setOperation(null)} />
      {commandTarget && (
        <PlanetDashboard
          state={selectedState}
          planets={planets}
          target={commandTarget}
          onClose={() => setTarget(null)}
          onSelectSource={setSourceEntity}
          run={run}
          busy={busy}
        />
      )}
      {vaultRequest && (
        <VaultPrompt
          request={vaultRequest}
          error={vaultPasswordError}
          onSubmit={(password, remember) => {
            setVaultPasswordError("");
            if (remember) writeRememberedVaultPassword(vaultRequest.wallet, password);
            resolveVault.current?.(password);
            resolveVault.current = null;
            setVaultRequest(null);
          }}
          onCancel={() => {
            setVaultPasswordError("");
            resolveVault.current?.("");
            resolveVault.current = null;
            setVaultRequest(null);
          }}
        />
      )}
    </main>
  );
}
