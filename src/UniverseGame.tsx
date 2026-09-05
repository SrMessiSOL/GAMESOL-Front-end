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
import { BarChart3, Building2, CheckCircle2, ChevronLeft, ChevronRight, Crosshair, FlaskConical, Gem, LoaderCircle, Pickaxe, Rocket, Shield, ShoppingCart, TriangleAlert, Trophy, Users, Zap } from "lucide-react";
import UniverseLab from "./UniverseLab";
import type { PlanetWorldCommandRequest, PlanetWorldModal } from "./PlanetWorld";
import { MarketClient } from "./market-client";
import {
  BUILDINGS,
  GameClient,
  SHIPS,
  SHIP_TYPE_IDX,
  energyEfficiency,
  upgradeCost,
  type PlayerState,
  type Mission,
  type BattleResolvedEventRecord,
  type EspionageReportEventRecord,
  type VaultRecoveryPromptRequest,
  type VaultStatus,
  IS_DEVNET,
  NETWORK_LABEL,
} from "./game-state";
import type { UniversePlanet } from "./universe-data";
import { usePasskeyGameplayVault } from "./usePasskeyGameplayVault";
import WalletConnectControl from "./WalletConnectControl";
import { resolveGameArt } from "./ui-art";
import { BUILDING_REQUIREMENTS } from "./combat-engine";

const PlanetWorld = React.lazy(() => import("./PlanetWorld"));

function LiveCaptureControl() {
  const enabled = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("capture") === "1";
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState("READY");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopCapture = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startCapture = useCallback(async () => {
    try {
      setMessage("SELECT THIS TAB");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: false,
      });
      const mimeType = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        const href = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.download = `gamesol-live-capture-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
        recorderRef.current = null;
        streamRef.current = null;
        setRecording(false);
        setMessage("CLIP SAVED");
      };
      stream.getVideoTracks()[0]?.addEventListener("ended", stopCapture, { once: true });
      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.start(1_000);
      setRecording(true);
      setMessage("RECORDING");
    } catch (error) {
      setRecording(false);
      setMessage(error instanceof Error && /notallowed|permission/i.test(error.name + error.message)
        ? "CAPTURE CANCELLED"
        : "CAPTURE FAILED");
    }
  }, [stopCapture]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  if (!enabled) return null;
  return <aside className={`ug-live-capture${recording ? " is-recording" : ""}`} aria-label="GAMESOL capture controls">
    <span><i /> LIVE CAPTURE</span>
    <b>{message}</b>
    {recording
      ? <button type="button" onClick={stopCapture}>STOP &amp; SAVE</button>
      : <button type="button" onClick={() => void startCapture()}>START RECORDING</button>}
  </aside>;
}

function PlanetWorldLoading({ worldName }: { worldName: string }) {
  return <section className="ug-world-loader" role="status" aria-live="polite">
    <div className="ug-world-loader-orbit" aria-hidden="true"><i /><b /></div>
    <span>OPENING PLANET COMMAND</span>
    <h2>{worldName}</h2>
    <p>Loading the planetary surface, live facilities, fleet control, and on-chain command systems.</p>
    <div className="ug-world-loader-progress" aria-hidden="true"><i /></div>
  </section>;
}

function PlanetTransitTransition({ worldName, coordinates, direction = "approach" }: { worldName: string; coordinates: string; direction?: "approach" | "departure" }) {
  const departing = direction === "departure";
  return <section className={`ug-planet-approach${departing ? " is-departure" : ""}`} role="status" aria-live="polite">
    <div className="ug-planet-approach-vignette" aria-hidden="true"><i /><b /><span /></div>
    <div className="ug-planet-approach-copy">
      <span>{departing ? "ORBITAL ASCENT CONFIRMED" : "APPROACH VECTOR LOCKED"}</span>
      <h2>{worldName}</h2>
      <p>{coordinates}</p>
    </div>
    <div className="ug-planet-approach-status"><i /><b>{departing ? "RETURNING TO SYSTEM COMMAND" : "ENTERING PLANETARY ORBIT"}</b></div>
  </section>;
}

class PlanetWorldBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <section className="ug-world-loader is-error" role="alert">
        <TriangleAlert aria-hidden="true" />
        <span>COMMAND SURFACE INTERRUPTED</span>
        <h2>Planet systems did not finish loading</h2>
        <p>Your on-chain state is unchanged. Reload the interface to request the command surface again.</p>
        <button type="button" onClick={() => window.location.reload()}>RELOAD COMMAND INTERFACE</button>
      </section>;
    }
    return this.props.children;
  }
}

type OperationState = {
  label: string;
  detail: string;
  phase: "processing" | "success" | "error";
  nextAction?: string;
  recovery?: string;
  technicalDetail?: string;
};

function commandSuccessGuidance(label: string): Pick<OperationState, "detail" | "nextAction"> {
  const command = label.toLowerCase();
  if (command.startsWith("upgrade ")) return {
    detail: "Construction confirmed. The live world queue now tracks this upgrade.",
    nextAction: "Watch the construction timer. When it reaches READY, select FINISH.",
  };
  if (command.startsWith("finish ")) return {
    detail: "The completed queue was resolved and your world state is up to date.",
    nextAction: "Continue with the highlighted Empire Expansion objective.",
  };
  if (command.startsWith("research ")) return {
    detail: "Research confirmed. The live laboratory queue is now running.",
    nextAction: "Track the research timer, then resolve it when it reaches READY.",
  };
  if (command.startsWith("build ")) return {
    detail: "Production confirmed. The live shipyard queue now reflects this order.",
    nextAction: "Track the production timer, then resolve the completed order.",
  };
  if (command.startsWith("launch ")) return {
    detail: "Fleet launch confirmed and the mission is now active on devnet.",
    nextAction: "Open Missions to track arrival and resolve the fleet when ready.",
  };
  if (command.startsWith("claim ")) return {
    detail: "Claim confirmed. The resulting world or reward has been loaded.",
    nextAction: "Return to your command view and continue expanding the empire.",
  };
  return {
    detail: "Command confirmed and the latest on-chain state has been loaded.",
    nextAction: "Return to the active command view to continue.",
  };
}

function OperationModal({ operation, onClose }: { operation: OperationState | null; onClose: () => void }) {
  const active = operation?.phase === "processing";
  const operationOpen = operation !== null;
  const blocking = operation?.phase !== "success";
  const modalRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!operationOpen || !blocking) return;
    const previousOverflow = document.body.style.overflow;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      const opener = openerRef.current;
      openerRef.current = null;
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, [blocking, operationOpen]);
  useEffect(() => {
    if (!operationOpen || !blocking) return;
    const focusFrame = window.requestAnimationFrame(() => active ? modalRef.current?.focus() : closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !active) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      if (active) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }
      const modal = modalRef.current;
      if (!modal) return;
      const controls = Array.from(modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])',
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
    };
  }, [active, blocking, operationOpen]);
  if (!operation) return null;
  return <div className={`ug-operation-backdrop ${operation.phase}`}>
    <section ref={modalRef} className={`ug-operation-modal ${operation.phase}`} role={blocking ? "dialog" : "status"} aria-modal={blocking ? "true" : undefined} aria-live="polite" aria-busy={active} aria-labelledby="ug-operation-title" aria-describedby="ug-operation-detail" tabIndex={blocking ? -1 : undefined}>
      <div className="ug-operation-mark" aria-hidden="true">{active ? <LoaderCircle /> : operation.phase === "success" ? <CheckCircle2 /> : <TriangleAlert />}</div>
      <span>{active ? "WAITING FOR DEVNET" : operation.phase === "success" ? "COMMAND CONFIRMED" : "COMMAND NEEDS ATTENTION"}</span>
      <h2 id="ug-operation-title">{operation.label}</h2>
      <p id="ug-operation-detail">{operation.detail}</p>
      {operation.phase === "success" && operation.nextAction && <div className="ug-operation-next"><b>NEXT MOVE</b><span>{operation.nextAction}</span></div>}
      {operation.phase === "error" && operation.recovery && <div className="ug-operation-recovery"><b>WHAT TO DO</b><span>{operation.recovery}</span></div>}
      {operation.phase === "error" && operation.technicalDetail && <details className="ug-operation-technical"><summary>Technical details</summary><code>{operation.technicalDetail}</code></details>}
      {active ? <div className="ug-operation-progress"><i /><b>Keep GAMESOL open while Solana confirms this command.</b></div> : <button ref={closeRef} type="button" title="Close (Esc)" onClick={onClose}>{operation.phase === "success" ? "RETURN TO WORLD" : "CLOSE AND REVIEW"}</button>}
    </section>
  </div>;
}

type FundsAsset = "SOL" | "AM" | "USDC";

const GAME_ACCOUNT_SOL_RESERVE = 50_000_000n;
const USDC_ONRAMP_URL_TEMPLATE = import.meta.env.VITE_USDC_ONRAMP_URL?.trim() || "";
const ANTIMATTER_SWAP_URL_TEMPLATE = import.meta.env.VITE_ANTIMATTER_SWAP_URL?.trim() || "";

function acquisitionUrl(template: string, address: PublicKey): string {
  return template.split("{address}").join(encodeURIComponent(address.toBase58()));
}

function formatRawBalance(raw: bigint, decimals: number, maximumFractionDigits = 6): string {
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, maximumFractionDigits);
  return fraction ? `${whole.toLocaleString()}.${fraction}` : whole.toLocaleString();
}

function rawAmountInput(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

function parseDisplayAmount(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^(?:\d+|\d*\.\d+)$/.test(trimmed)) throw new Error("Enter a valid amount.");
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) throw new Error(`Use no more than ${decimals} decimal places.`);
  return BigInt(whole || "0") * (10n ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
}

function FundsModal({
  vaultAddress,
  vaultSol,
  antimatter,
  usdc,
  antimatterAvailable,
  usdcAvailable,
  returnFocusTo,
  onClose,
  onSend,
  onClaimDevnetAntimatter,
  onRefreshBalances,
}: {
  vaultAddress: PublicKey;
  vaultSol: bigint;
  antimatter: bigint;
  usdc: bigint;
  antimatterAvailable: boolean;
  usdcAvailable: boolean;
  returnFocusTo?: HTMLElement | null;
  onClose: () => void;
  onSend: (asset: FundsAsset, rawAmount: bigint, destination: PublicKey) => Promise<void>;
  onClaimDevnetAntimatter?: () => Promise<void>;
  onRefreshBalances: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"add" | "send">("add");
  const [asset, setAsset] = useState<FundsAsset>("SOL");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [acquisitionBusy, setAcquisitionBusy] = useState(false);
  const [acquisitionMessage, setAcquisitionMessage] = useState("");
  const modalRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const availableSol = vaultSol > GAME_ACCOUNT_SOL_RESERVE ? vaultSol - GAME_ACCOUNT_SOL_RESERVE : 0n;
  const assetBalance = asset === "SOL" ? availableSol : asset === "AM" ? antimatter : usdc;
  const decimals = asset === "SOL" ? 9 : 6;
  const usdcOnrampUrl = USDC_ONRAMP_URL_TEMPLATE ? acquisitionUrl(USDC_ONRAMP_URL_TEMPLATE, vaultAddress) : "";
  const antimatterSwapUrl = ANTIMATTER_SWAP_URL_TEMPLATE ? acquisitionUrl(ANTIMATTER_SWAP_URL_TEMPLATE, vaultAddress) : "";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (busyRef.current) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const modal = modalRef.current;
      if (!modal) return;
      const controls = Array.from(modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])',
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
      window.requestAnimationFrame(() => {
        if (returnFocusTo?.isConnected) returnFocusTo.focus();
      });
    };
  }, []);

  const useMaximum = () => setAmount(rawAmountInput(assetBalance, decimals));
  const prepareReview = () => {
    setError("");
    try {
      const destinationKey = new PublicKey(destination.trim());
      if (destinationKey.equals(vaultAddress)) throw new Error("Choose an address different from your game account.");
      const raw = parseDisplayAmount(amount, decimals);
      if (raw <= 0n) throw new Error("Enter an amount greater than zero.");
      if (raw > assetBalance) throw new Error(`You don't have enough available ${asset}.`);
      if (asset === "AM" && !antimatterAvailable) throw new Error("ANTIMATTER transfers are not available yet.");
      if (asset === "USDC" && !usdcAvailable) throw new Error("USDC transfers are not available yet.");
      setReviewing(true);
    } catch (cause) {
      setError(friendlyAccountError(cause, "Check the transfer details and try again."));
    }
  };
  const confirmSend = async () => {
    setBusy(true);
    setError("");
    try {
      await onSend(asset, parseDisplayAmount(amount, decimals), new PublicKey(destination.trim()));
      setReviewing(false);
      setSuccess(`${amount} ${asset} was sent.`);
    } catch (cause) {
      setError(friendlyAccountError(cause, "We couldn't send your funds. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  const copyGameAddress = async () => {
    await navigator.clipboard.writeText(vaultAddress.toBase58());
    setAcquisitionMessage("Game account address copied.");
  };
  const claimDevnetAntimatter = async () => {
    if (!onClaimDevnetAntimatter) return;
    setAcquisitionBusy(true);
    setAcquisitionMessage("");
    try {
      await onClaimDevnetAntimatter();
      setAcquisitionMessage("Test ANTIMATTER received. Balances refreshed.");
    } catch (cause) {
      setAcquisitionMessage(friendlyAccountError(cause, "Test ANTIMATTER is unavailable right now."));
    } finally {
      setAcquisitionBusy(false);
    }
  };
  const refreshBalances = async () => {
    setAcquisitionBusy(true);
    setAcquisitionMessage("");
    try {
      await onRefreshBalances();
      setAcquisitionMessage("Balances refreshed.");
    } catch (cause) {
      setAcquisitionMessage(friendlyAccountError(cause, "Balances could not be refreshed."));
    } finally {
      setAcquisitionBusy(false);
    }
  };
  return createPortal(<div className="ug-funds-backdrop" onMouseDown={() => { if (!busy) onClose(); }}>
    <section ref={modalRef} className="ug-funds-modal" role="dialog" aria-modal="true" aria-labelledby="ug-funds-title" aria-busy={busy} onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div><span>PLAYER ACCOUNT</span><h2 id="ug-funds-title">Your assets</h2></div>
        <button ref={closeRef} type="button" aria-label="Close funds" title="Close funds (Esc)" disabled={busy} onClick={onClose}>×</button>
      </header>
      {success ? <section className="ug-funds-success"><i>✓</i><h3>Transfer complete</h3><p>{success}</p><button onClick={onClose}>DONE</button></section> : reviewing ? <section className="ug-funds-review">
        <span>REVIEW TRANSFER</span>
        <h3>{amount} {asset}</h3>
        <dl><div><dt>From</dt><dd>Game account</dd></div><div><dt>To</dt><dd className="ug-funds-destination">{destination}</dd></div></dl>
        <p>Your device will ask you to approve this transfer. Quick Play cannot approve withdrawals.</p>
        {error && <div className="ug-funds-error">{error}</div>}
        <div className="ug-funds-actions"><button className="secondary" disabled={busy} onClick={() => setReviewing(false)}>BACK</button><button disabled={busy} onClick={() => void confirmSend()}>{busy ? "WAITING FOR APPROVAL…" : "CONFIRM WITH PASSKEY"}</button></div>
      </section> : <>
        <section className="ug-funds-balances">
          <article><span>GAME ACCOUNT</span><b>{formatRawBalance(vaultSol, 9, 4)} SOL</b><small>{formatRawBalance(antimatter, 6, 2)} AM · {formatRawBalance(usdc, 6, 2)} USDC</small></article>
          <article><span>NETWORK FEES</span><b>SPONSORED</b><small>No separate gameplay wallet to fund</small></article>
        </section>
        <nav className="ug-funds-mode" aria-label="Asset actions" role="tablist">
          <button type="button" role="tab" aria-controls="ug-funds-add" className={mode === "add" ? "active" : ""} aria-selected={mode === "add"} onClick={() => { setMode("add"); setError(""); }}>ADD ASSETS <small>Deposit and claim</small></button>
          <button type="button" role="tab" aria-controls="ug-funds-send" className={mode === "send" ? "active" : ""} aria-selected={mode === "send"} onClick={() => { setMode("send"); setAcquisitionMessage(""); }}>SEND ASSETS <small>Transfer out securely</small></button>
        </nav>
        {mode === "add" ? <section id="ug-funds-add" className="ug-funds-acquire">
          <div className="ug-funds-section-title"><span>ADD FUNDS</span><b>{IS_DEVNET ? "SOLANA DEVNET" : "SOLANA MAINNET"}</b></div>
          <p>{IS_DEVNET
            ? "Test assets have no cash value. Copy your game address, then use the official faucets below."
            : "Buy USDC with an available payment method, then swap USDC for ANTIMATTER when market liquidity is live."}</p>
          <div className="ug-funds-acquire-grid">
            <button type="button" className="secondary" disabled={acquisitionBusy} onClick={() => void copyGameAddress()}>COPY GAME ADDRESS</button>
            {IS_DEVNET ? <>
              <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">GET TEST USDC</a>
              <button type="button" disabled={acquisitionBusy || !onClaimDevnetAntimatter} onClick={() => void claimDevnetAntimatter()}>{acquisitionBusy ? "WORKING…" : "GET TEST ANTIMATTER"}</button>
            </> : <>
              {usdcOnrampUrl ? <a href={usdcOnrampUrl} target="_blank" rel="noreferrer">BUY USDC</a> : <button type="button" disabled title="Configure VITE_USDC_ONRAMP_URL to enable Apple Pay, Google Pay, cards, and bank options.">BUY USDC · SETUP REQUIRED</button>}
              {antimatterSwapUrl ? <a href={antimatterSwapUrl} target="_blank" rel="noreferrer">SWAP FOR ANTIMATTER</a> : <button type="button" disabled title="A live ANTIMATTER liquidity pool and VITE_ANTIMATTER_SWAP_URL are required.">ANTIMATTER SWAP · AWAITING POOL</button>}
            </>}
            <button type="button" className="secondary" disabled={acquisitionBusy} onClick={() => void refreshBalances()}>REFRESH BALANCES</button>
          </div>
          {!IS_DEVNET && <small>Apple Pay and Google Pay availability depends on the selected provider, device, region, and identity checks.</small>}
          {acquisitionMessage && <div className="ug-funds-acquire-message" role="status">{acquisitionMessage}</div>}
        </section> : <section id="ug-funds-send" className="ug-funds-send">
          <div className="ug-funds-section-title"><span>SEND FROM GAME ACCOUNT</span><b>PASSKEY REQUIRED</b></div>
          <div className="ug-funds-assets">
            {(["SOL", "AM", "USDC"] as FundsAsset[]).map((entry) => <button key={entry} className={asset === entry ? "active" : ""} disabled={(entry === "AM" && !antimatterAvailable) || (entry === "USDC" && !usdcAvailable)} onClick={() => { setAsset(entry); setAmount(""); setError(""); }}>{entry}</button>)}
          </div>
          <label><span>Amount</span><div><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /><button onClick={useMaximum}>MAX</button></div><small>Available: {formatRawBalance(assetBalance, decimals, 6)} {asset}</small></label>
          <label><span>Send to</span><input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Solana address" spellCheck={false} /></label>
          {asset === "SOL" && <p className="ug-funds-note">MAX keeps 0.05 SOL in your account so the game continues working.</p>}
          {error && <div className="ug-funds-error">{error}</div>}
          <button className="ug-funds-primary" disabled={busy || !amount || !destination.trim()} onClick={prepareReview}>REVIEW TRANSFER</button>
        </section>}
        <details className="ug-funds-advanced"><summary>Advanced details</summary><dl><div><dt>Game account</dt><dd>{vaultAddress.toBase58()}</dd></div><div><dt>Fee model</dt><dd>GAMESOL sponsored</dd></div></dl></details>
      </>}
    </section>
  </div>, document.body);
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
  | "missions";
type MissionTarget = Pick<UniversePlanet, "id" | "name" | "system" | "shielded" | "faction" | "ownerLabel">;
const TAB_ICONS: Record<Tab, React.ReactNode> = { overview: <BarChart3 />, buildings: <Building2 />, research: <FlaskConical />, ships: <Rocket />, defense: <Shield />, missions: <Crosshair /> };
const fmt = (value: bigint | number) =>
  typeof value === "bigint"
    ? value.toLocaleString()
    : Math.trunc(value).toLocaleString();
const vaultPasswordStorageKey = (wallet: string) => `${VAULT_PASSWORD_STORAGE_PREFIX}:${wallet}`;
const readRememberedVaultPassword = (wallet: string) => {
  const key = vaultPasswordStorageKey(wallet);
  try {
    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

type PlayerError = { detail: string; recovery: string; technicalDetail?: string };

function playerError(error: unknown, fallback: string): PlayerError {
  const raw = (error instanceof Error ? error.message : String(error || "")).trim();
  const result = (detail: string, recovery: string): PlayerError => ({
    detail,
    recovery,
    technicalDetail: raw && raw !== detail ? raw.slice(0, 2_000) : undefined,
  });
  if (/429|rate limit|too many requests|connection rate limits/i.test(raw)) {
    return result("Solana devnet is receiving too many requests right now. Your command was not applied.", "Wait a few seconds, then try the command again.");
  }
  if (/blockhash|block height|signature.*expired|has expired|block height exceeded/i.test(raw)) {
    return result("The transaction approval expired before Solana accepted it. Your command was not applied.", "Try the command again to create a fresh transaction.");
  }
  if (/InvalidSignatureAge|custom program error:\s*0xbbf|\"Custom\"\s*:\s*3007/i.test(raw)) {
    return result("The secure approval expired before devnet accepted it. Nothing was changed.", "Try again and approve the passkey promptly when your device asks.");
  }
  if (/failed to fetch|networkerror|network request failed|offline|fetch failed|\bRPC\b/i.test(raw)) {
    return result("GAMESOL could not reach Solana devnet. Your command was not applied.", "Check your connection and retry. If devnet is busy, wait a moment first.");
  }
  if (/insufficient funds|insufficient lamports|play balance is too low|attempt to debit an account/i.test(raw)) {
    return result("Your game account does not have enough test SOL for this action.", "Open your account menu, add test SOL or check the current balance, then retry.");
  }
  if (/cannot sign with non signer|session.*expired|session.*not active|missing.*session|quick play.*off/i.test(raw)) {
    return result("Quick Play is no longer active for this device. Nothing was changed.", "Open your account menu and turn on Quick Play again.");
  }
  if (/user rejected|notallowederror|cancelled|canceled|approval.*declined/i.test(raw)) {
    return result("The approval was cancelled. Nothing was changed.", "Close this message or try the command again when you are ready.");
  }
  if (/not in the allowed list|not allowed by the GAMESOL|sponsor rejected required program/i.test(raw)) {
    return result("Sponsored play cannot approve this command yet. Nothing was changed.", "Retry later after the GAMESOL sponsor configuration is updated.");
  }
  if (/already in use|already initialized|already exists|account.*exists/i.test(raw)) {
    return result("This game account or action already exists on-chain.", "Refresh the game state. You may already have completed this step.");
  }
  if (/simulation|instruction data|program .*not in|secp256|custom program error|anchorerror/i.test(raw)) {
    return result(`${fallback} Solana rejected the command before it changed the game.`, "Review the command requirements, then retry. Technical details are available below.");
  }
  return result(fallback, "Try the command again. If it repeats, open the technical details for support.");
}

function friendlyAccountError(error: unknown, fallback: string): string {
  return playerError(error, fallback).detail;
}
const cacheVaultPasswordForSession = (wallet: string, password: string) => {
  try { window.sessionStorage.setItem(vaultPasswordStorageKey(wallet), password); } catch { /* Optional session cache. */ }
};
const writeRememberedVaultPassword = (wallet: string, password: string) => {
  cacheVaultPasswordForSession(wallet, password);
  try { window.localStorage.setItem(vaultPasswordStorageKey(wallet), password); } catch { /* Optional local cache. */ }
};
const clearRememberedVaultPassword = (wallet: string) => {
  const key = vaultPasswordStorageKey(wallet);
  try { window.sessionStorage.removeItem(key); } catch { /* Optional session cache. */ }
  try { window.localStorage.removeItem(key); } catch { /* Optional local cache. */ }
};

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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => { setPassword(""); setConfirmPassword(""); setRemember(false); }, [request.mode, request.wallet]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => passwordRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const form = formRef.current;
      if (!form) return;
      const controls = Array.from(form.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
      const opener = openerRef.current;
      openerRef.current = null;
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, []);
  const isCreating = request.mode === "create";
  const confirmationMismatch = isCreating && confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = password.trim().length > 0 && (!isCreating || (confirmPassword.length > 0 && password === confirmPassword));
  return (
    <div
      className="ug-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ug-vault-prompt-title"
      aria-describedby="ug-vault-prompt-description ug-vault-prompt-notice"
    >
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          if (password.trim()) onSubmit(password.trim(), remember);
        }}
      >
        <button type="button" className="ug-modal-close" aria-label="Close account security dialog" title="Close (Esc)" onClick={onCancel}>×</button>
        <h2 id="ug-vault-prompt-title">
          {request.mode === "create"
            ? "Protect this device"
            : "Unlock your game account"}
        </h2>
        <p id="ug-vault-prompt-description">Use this password to continue playing safely on this browser.</p>
        <div className="ug-vault-notice" id="ug-vault-prompt-notice">This password stays in this browser on this device. GAMESOL cannot see, recover, or remotely reset it.</div>
        {error && <p className="ug-password-error" role="alert">{error}</p>}
        <input
          ref={passwordRef}
          type="password"
          aria-label={isCreating ? "Create device password" : "Device password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Device password"
          autoComplete={isCreating ? "new-password" : "current-password"}
        />
        {isCreating && <>
          <input
            type="password"
            aria-label="Confirm device password"
            aria-invalid={confirmationMismatch}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm device password"
            autoComplete="new-password"
          />
          {confirmationMismatch && <p className="ug-password-error">Passwords do not match.</p>}
        </>}
        <label className="ug-remember-password"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span><b>Remember on this device</b><small>Stores the recovery password in this browser for this wallet.</small></span></label>
        <div>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit}>Continue</button>
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
    if (missionType === 1 && target.shielded) return;
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
        <header className="ug-command-heading">
        <div className="ug-command-title">
          <small>PLANETARY COMMAND · DEVNET</small>
          <h1>{state?.planet.name ?? target.name}</h1>
          <span>
            {state
              ? `G ${state.planet.galaxy} · S ${state.planet.system} · P ${state.planet.position}`
              : target.system}
          </span>
        </div>
        <div className="ug-command-heading-actions">
          <span className="ug-command-chain-status"><i />ON-CHAIN</span>
          <button aria-label="Close planetary command" title="Close planetary command" onClick={() => setModalOpen(false)}>Close</button>
        </div>
        </header>
      <div className="ug-source-select">
        <label>ACTIVE COMMAND WORLD</label>
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
      {!owned && target.shielded && (
        <p className="ug-target-note ug-target-protected">
          Attack unavailable: this planet is protected by an active shield or beginner protection. Espionage and transport remain available where the program permits them.
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
            const requirements = (BUILDING_REQUIREMENTS[building.key] ?? []).map((requirement: any) => {
              const current = requirement.type === "building"
                ? Number((activeState.planet as any)[requirement.key] ?? 0)
                : Number((activeState.research as any)[requirement.key] ?? 0);
              const source = requirement.type === "building"
                ? BUILDINGS.find((entry) => entry.key === requirement.key)?.name ?? requirement.key
                : RESEARCH[RESEARCH_KEYS.indexOf(requirement.key as (typeof RESEARCH_KEYS)[number])] ?? requirement.key;
              return { source, current, required: requirement.level, met: current >= requirement.level };
            });
            const missingRequirements = requirements.filter((requirement) => !requirement.met);
            const requirementsMet = missingRequirements.length === 0;
            return <article key={building.key} className="ug-unit-card">
              <div className="ug-unit-art" style={{ backgroundImage: resolveGameArt(building.key, "none") }} />
              <div className="ug-unit-copy">
                <h3>{building.name}</h3>
                <p>{nextBuildingEffect(building.key, level)}</p>
                <b>Level {level} <span>to {level + 1}</span></b>
                <div className="ug-cost-row">{metal > 0 && <span className="cost-metal" title="Metal"><Pickaxe />{fmt(metal)}</span>}{crystal > 0 && <span className="cost-crystal" title="Crystal"><Gem />{fmt(crystal)}</span>}{deuterium > 0 && <span className="cost-deuterium" title="Deuterium"><FlaskConical />{fmt(deuterium)}</span>}</div>
                {missingRequirements.length > 0 && <div style={{ marginTop: 8, color: "var(--danger)", fontSize: 11 }}><b>Requirements missing</b>{missingRequirements.map((requirement) => <div key={`${building.key}-${requirement.source}`}>• {requirement.source} Lv {requirement.required} <span style={{ opacity: 0.75 }}>(now {requirement.current})</span></div>)}</div>}
              </div>
              <button
                disabled={busy || constructionBusy || !requirementsMet}
                onClick={() =>
                  run(`Upgrade ${building.name}`, (client, source) =>
                    client.startBuild(source, building.idx),
                  )
                }
              >
                {constructionBusy ? "Queue active" : !requirementsMet ? "Requirements missing" : "Upgrade"}
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
      </section>
    </section>
  );
}

function empireWorldSummary(state: PlayerState, nowTs: number) {
  const queues = [
    { active: state.planet.buildQueueItem !== 255, finishAt: state.planet.buildFinishTs },
    { active: state.research.queueItem !== 255, finishAt: state.research.researchFinishTs },
    { active: state.planet.shipBuildItem !== 255, finishAt: state.planet.shipBuildFinishTs },
    { active: state.planet.defenseBuildItem !== 255, finishAt: state.planet.defenseBuildFinishTs },
  ].filter((queue) => queue.active);
  const missions = state.fleet.missions.filter((mission) => mission.missionType !== 0);
  const readyQueues = queues.filter((queue) => queue.finishAt <= nowTs).length;
  const readyMissions = missions.filter((mission) => (mission.applied ? mission.returnTs : mission.arriveTs) <= nowTs).length;
  return {
    activeJobs: queues.length + missions.length,
    readyActions: readyQueues + readyMissions,
    energyPercent: energyEfficiency(state.resources),
  };
}

export default function UniverseGame() {
  const productionPreview = typeof window !== "undefined" && window.location.pathname === "/next";
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const passkey = usePasskeyGameplayVault();
  const [planets, setPlanets] = useState<PlayerState[]>([]);
  const [target, setTarget] = useState<MissionTarget | null>(null);
  const [planetWorldEntity, setPlanetWorldEntity] = useState<string | null>(null);
  const [planetApproach, setPlanetApproach] = useState<{ id: number; name: string; coordinates: string } | null>(null);
  const [planetDeparture, setPlanetDeparture] = useState<{ id: number; name: string; coordinates: string } | null>(null);
  const [planetCommandRequest, setPlanetCommandRequest] = useState<PlanetWorldCommandRequest | null>(null);
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
  const [explorationLevel, setExplorationLevel] = useState<"universe" | "galaxy" | "system">("universe");
  const [vaultBalance, setVaultBalance] = useState(0n);
  const [vaultDeposit, setVaultDeposit] = useState("0.05");
  const [vaultWithdraw, setVaultWithdraw] = useState("");
  const [vaultActionBusy, setVaultActionBusy] = useState(false);
  const [balanceRefreshBusy, setBalanceRefreshBusy] = useState(false);
  const [passkeyActionBusy, setPasskeyActionBusy] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const playerTriggerRef = useRef<HTMLButtonElement>(null);
  const accountCloseRef = useRef<HTMLButtonElement>(null);
  const [fundsOpen, setFundsOpen] = useState(false);
  const fundsOpenerRef = useRef<HTMLElement | null>(null);
  const [antimatterBalance, setAntimatterBalance] = useState(0n);
  const [usdcBalance, setUsdcBalance] = useState(0n);
  const [antimatterMint, setAntimatterMint] = useState<string | null>(null);
  const [usdcMint, setUsdcMint] = useState<string | null>(null);
  const [battleReports, setBattleReports] = useState<BattleResolvedEventRecord[]>([]);
  const [spyReports, setSpyReports] = useState<EspionageReportEventRecord[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const commandDockRef = useRef<HTMLElement>(null);
  const commandMenuCloseRef = useRef<HTMLButtonElement>(null);
  const [commandDockCanScroll, setCommandDockCanScroll] = useState(false);
  const [commandDockAtEnd, setCommandDockAtEnd] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 5_000);
    return () => window.clearTimeout(timer);
  }, [status]);
  useEffect(() => {
    if (!operation || operation.phase !== "success") return;
    const timer = window.setTimeout(() => setOperation(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [operation]);
  useEffect(() => {
    if (!walletMenuOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => accountCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWalletMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
        else playerTriggerRef.current?.focus();
      });
    };
  }, [walletMenuOpen]);
  useEffect(() => {
    if (!commandMenuOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => commandMenuCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCommandMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
      });
    };
  }, [commandMenuOpen]);
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
  useEffect(() => {
    if (!client) return;
    client.setGameplayVaultExecutor(passkey.executor);
    client.setPreferVaultSigning(Boolean(passkey.executor));
  }, [client, passkey.executor]);
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
  const refreshActivity = useCallback(async () => {
    if (!client || !publicKey || planets.length === 0) {
      setBattleReports([]);
      setSpyReports([]);
      return;
    }
    setActivityLoading(true);
    try {
      const planetPdas = planets.map((planet) => planet.planetPda);
      const { battles, espionage } = await client.fetchActivityEventsForPlanets(planetPdas);
      setBattleReports(battles);
      setSpyReports(espionage);
    } catch {
      setBattleReports([]);
      setSpyReports([]);
    } finally {
      setActivityLoading(false);
    }
  }, [client, planets, publicKey]);
  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);
  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    const run = () => {
      void refresh().catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not load planets.";
        const rateLimited = /\b429\b|rate limit|too many requests/i.test(message);
        setStatus(rateLimited ? "The test network is busy. Retrying your commander and worlds…" : message);
        if (rateLimited) retryTimer = window.setTimeout(run, 5_000);
      });
    };
    run();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [refresh]);
  const refreshWalletTokenBalances = useCallback(async () => {
    if (!client || !publicKey) {
      setAntimatterBalance(0n);
      setUsdcBalance(0n);
      setAntimatterMint(null);
      setUsdcMint(null);
      return;
    }
    const [gameConfig, storeConfig] = await Promise.all([
      client.getGameConfig(),
      client.getStoreConfig(),
    ]);
    const nextAntimatterMint = gameConfig?.antimatterMint ?? null;
    const nextUsdcMint = storeConfig?.usdcMint ?? null;
    setAntimatterMint(nextAntimatterMint);
    setUsdcMint(nextUsdcMint);
    const loadOwnerBalances = async (owner: PublicKey | null) => {
      const balances = new Map<string, bigint>();
      if (!owner) return balances;
      const response = await connection.getParsedTokenAccountsByOwner(
        owner,
        { programId: TOKEN_PROGRAM_ID },
        "confirmed",
      );
      for (const account of response.value) {
        const info = (account.account.data as any)?.parsed?.info;
        const mint = String(info?.mint ?? "");
        if (!mint) continue;
        balances.set(mint, (balances.get(mint) ?? 0n) + BigInt(info?.tokenAmount?.amount ?? "0"));
      }
      return balances;
    };
    const walletBalances = await loadOwnerBalances(publicKey);
    const antimatter = nextAntimatterMint ? (walletBalances.get(nextAntimatterMint) ?? 0n) : 0n;
    const usdc = nextUsdcMint ? (walletBalances.get(nextUsdcMint) ?? 0n) : 0n;
    setAntimatterBalance(antimatter);
    setUsdcBalance(usdc);
  }, [client, connection, publicKey]);
  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    const run = () => {
      void refreshWalletTokenBalances().catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        const rateLimited = /\b429\b|rate limit|too many requests/i.test(message);
        setStatus(
          rateLimited
            ? "The test network is busy. Your last confirmed balances are preserved while we retry."
            : "We couldn't refresh token balances. Your last confirmed balances are preserved.",
        );
        if (rateLimited) retryTimer = window.setTimeout(run, 5_000);
      });
    };
    run();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [refreshWalletTokenBalances]);
  latestAntimatterBalance = antimatterBalance;
  const selectedState =
    planets.find((planet) => planet.entityPda === sourceEntity) ?? null;
  const planetWorldState = planets.find((planet) => planet.entityPda === planetWorldEntity) ?? null;
  const updateCommandDock = useCallback(() => {
    const dock = commandDockRef.current;
    if (!dock) {
      setCommandDockCanScroll(false);
      setCommandDockAtEnd(false);
      return;
    }
    const canScroll = dock.scrollWidth > dock.clientWidth + 4;
    setCommandDockCanScroll(canScroll);
    setCommandDockAtEnd(!canScroll || dock.scrollLeft + dock.clientWidth >= dock.scrollWidth - 6);
  }, []);
  useEffect(() => {
    const frame = window.requestAnimationFrame(updateCommandDock);
    window.addEventListener("resize", updateCommandDock);
    const dock = commandDockRef.current;
    const observer = dock && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updateCommandDock)
      : null;
    if (dock && observer) observer.observe(dock);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateCommandDock);
      observer?.disconnect();
    };
  }, [planetWorldState, selectedState, updateCommandDock]);
  const openPlanetCommand = (
    entity: string,
    modal?: PlanetWorldModal,
    mission?: PlanetWorldCommandRequest["mission"],
  ) => {
    if (!modal) {
      const destination = planets.find((planet) => planet.entityPda === entity);
      if (destination) setPlanetApproach({
        id: Date.now(),
        name: destination.planet.name || "Command world",
        coordinates: `G ${destination.planet.galaxy} · S ${destination.planet.system} · P ${destination.planet.position}`,
      });
    }
    setSourceEntity(entity);
    setPlanetWorldEntity(entity);
    setTarget(null);
    setPlanetCommandRequest(modal ? {
      id: Date.now(),
      modal,
      mission,
    } : null);
  };
  useEffect(() => {
    if (!planetApproach) return;
    const approachId = planetApproach.id;
    const timer = window.setTimeout(() => setPlanetApproach((current) => current?.id === approachId ? null : current), 1_150);
    return () => window.clearTimeout(timer);
  }, [planetApproach]);
  useEffect(() => {
    if (!planetDeparture) return;
    const departureId = planetDeparture.id;
    const timer = window.setTimeout(() => setPlanetDeparture((current) => current?.id === departureId ? null : current), 950);
    return () => window.clearTimeout(timer);
  }, [planetDeparture]);

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
      setOperation({ label, ...commandSuccessGuidance(label), phase: "success" });
    } catch (error) {
      const failure = playerError(error, `${label} could not be completed.`);
      setStatus(failure.detail);
      setOperation({ label, ...failure, phase: "error" });
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
    if (!passkey.executor || !passkey.hasSession) {
      setWalletMenuOpen(true);
      setStatus("Sign in and turn on Quick Play first.");
      return;
    }
    setBusy(true);
    setStatus("Creating homeworld...");
    setOperation({ label: "Claim your homeworld", detail: "Finding an available world for your commander.", phase: "processing" });
    try {
      const createdPlanet = await client.initializePlanet(homeworldName, () => {
        setStatus("Creating your world...");
        setOperation({ label: "Claim your homeworld", detail: "Your new world is being created. This may take a moment.", phase: "processing" });
      });
      setPlanets((current) => [createdPlanet, ...current.filter((planet) => planet.entityPda !== createdPlanet.entityPda)]);
      setSourceEntity(createdPlanet.entityPda);
      setPlanetWorldEntity(createdPlanet.entityPda);
      setStatus("Homeworld created.");
      setOperation(null);
      void refresh().catch((error) =>
        setStatus(error instanceof Error ? error.message : "Homeworld created, but refresh failed."),
      );
      void refreshVaultBalance().catch(() => undefined);
    } catch (error) {
      const failure = playerError(error, "We couldn't create your homeworld.");
      setStatus(failure.detail);
      setOperation({ label: "Claim your homeworld", ...failure, phase: "error" });
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
      const restored = await client.restoreExistingVault();
      if (restored) {
        client.setPreferVaultSigning(true);
        setVaultStatus("ready");
        return;
      }
      const nextStatus = await client.getVaultStatus();
      client.setPreferVaultSigning(false);
      setVaultStatus(nextStatus);
    } catch (error) {
      client.setPreferVaultSigning(false);
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
  const checkOnboardingFunding = async () => {
    if (!client) return;
    setBalanceRefreshBusy(true);
    try {
      const [balance, feeState] = await Promise.all([
        client.getVaultBalanceLamports().then(BigInt),
        passkey.refreshSessionFunding(),
      ]);
      setVaultBalance(balance);
      setStatus(
        feeState?.sponsored
          ? "Sponsored network fees are available. Continue to Quick Play."
          : "The sponsor service is not ready yet. Wait a moment, then check again.",
      );
    } catch (error) {
      setStatus(friendlyAccountError(error, "We couldn't check your balance. Please try again."));
    } finally {
      setBalanceRefreshBusy(false);
    }
  };
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
      const failure = playerError(error, "We couldn't fund your game account.");
      setStatus(failure.detail);
      setOperation({ label: "Fund vault", ...failure, phase: "error" });
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
      const failure = playerError(error, "We couldn't complete this withdrawal.");
      setStatus(failure.detail);
      setOperation({ label: "Withdraw from vault", ...failure, phase: "error" });
    } finally {
      setVaultActionBusy(false);
    }
  };
  const connectPasskey = async () => {
    setPasskeyActionBusy(true);
    try {
      await passkey.connect();
      setStatus("Game account connected. Follow the setup steps to create your first world.");
    } catch (error) {
      setStatus(friendlyAccountError(error, "We couldn't connect your game account. Please try again."));
    } finally {
      setPasskeyActionBusy(false);
    }
  };
  const sendPlayerFunds = async (asset: FundsAsset, rawAmount: bigint, destination: PublicKey) => {
    if (!client) throw new Error("Your game account is still loading.");
    if (asset === "SOL") {
      const available = vaultBalance > GAME_ACCOUNT_SOL_RESERVE ? vaultBalance - GAME_ACCOUNT_SOL_RESERVE : 0n;
      if (rawAmount > available) throw new Error("That amount is not available to send.");
      if (rawAmount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("That SOL amount is too large for one transfer.");
      await client.withdrawVaultLamports(Number(rawAmount), destination);
    } else {
      const mintAddress = asset === "AM" ? antimatterMint : usdcMint;
      const balance = asset === "AM" ? antimatterBalance : usdcBalance;
      if (!mintAddress) throw new Error(`${asset} transfers are not available yet.`);
      if (rawAmount > balance) throw new Error(`You don't have enough ${asset}.`);
      await client.withdrawVaultToken(new PublicKey(mintAddress), rawAmount, 6, destination);
    }
    await Promise.all([
      refreshVaultBalance(),
      refreshWalletTokenBalances(),
      passkey.refreshSessionFunding(),
    ]);
  };
  const claimDevnetAntimatter = async () => {
    if (!IS_DEVNET || !publicKey) throw new Error("Test ANTIMATTER is only available to signed-in devnet commanders.");
    const response = await fetch("/api/antimatter-faucet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: publicKey.toBase58() }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Test ANTIMATTER faucet failed.");
    await refreshWalletTokenBalances();
  };
  const refreshPlayerBalances = async () => {
    await Promise.all([
      refreshVaultBalance(),
      refreshWalletTokenBalances(),
      passkey.refreshSessionFunding(),
    ]);
  };
  const initializePasskeyPlayer = async () => {
    if (!client || !passkey.executor) return;
    setPasskeyActionBusy(true);
    setOperation({ label: "Create your commander", detail: "Setting up your player profile in the GAMESOL universe.", phase: "processing" });
    try {
      await client.initializeLazorPlayer(() => setOperation({ label: "Create your commander", detail: "Your profile is being created. This may take a moment.", phase: "processing" }));
      setVaultStatus("ready");
      await refreshVaultBalance();
      setOperation({ label: "Create your commander", detail: "Your commander is ready.", phase: "success" });
    } catch (error) {
      const failure = playerError(error, "We couldn't create your commander.");
      setStatus(failure.detail);
      setOperation({ label: "Create your commander", ...failure, phase: "error" });
    } finally {
      setPasskeyActionBusy(false);
    }
  };
  const enableGameplaySession = async () => {
    setPasskeyActionBusy(true);
    setStatus("Opening secure Quick Play approval…");
    try {
      await passkey.createGameplaySession();
      await refreshVaultBalance();
      setStatus("Quick Play is on. You can play for up to 8 hours without approving every action.");
    } catch (error) {
      setStatus(friendlyAccountError(error, "We couldn't turn on Quick Play. Please try again."));
    } finally {
      setPasskeyActionBusy(false);
    }
  };
  const lockGameplaySession = async () => {
    setPasskeyActionBusy(true);
    try {
      await passkey.revokeGameplaySession();
      setStatus("Quick Play is off. Your game account is still safely connected.");
    } catch (error) {
      setStatus(friendlyAccountError(error, "We couldn't turn off Quick Play. Please try again."));
    } finally {
      setPasskeyActionBusy(false);
    }
  };
  useEffect(() => {
    if (!client || !publicKey) {
      setVaultStatus("loading");
      return;
    }
    if (passkey.executor) {
      void client.isLazorPlayerInitialized().then((authorized) => {
        setVaultStatus(authorized ? "ready" : "not_initialized");
      }).catch(() => setVaultStatus("not_initialized"));
      return;
    }
    void unlockVault();
  }, [client, passkey.executor, publicKey]);
  useEffect(() => {
    void refreshVaultBalance();
  }, [refreshVaultBalance, vaultStatus]);
  const shieldActive = Boolean(
    selectedState &&
    selectedState.planet.protectionUntilTs > Math.floor(Date.now() / 1000),
  );
  const onboardingFunded = passkey.paymasterReady;
  const onboardingProfileReady = vaultStatus === "ready";
  const onboardingSessionReady = passkey.hasSession;
  const quickPlayUsable = passkey.hasSession && passkey.paymasterReady;
  const onboardingStep = !onboardingFunded
    ? 2
    : !onboardingSessionReady
      ? 3
      : !onboardingProfileReady
        ? 4
        : 5;
  return (
    <main className={`universe-game-root${productionPreview ? " production-preview" : ""}`}>
      {!planetWorldState && <UniverseLab
        embedded
        productionUi={productionPreview}
        initialEmpireOpen={!returnSystem}
        onNavigationLevelChange={setExplorationLevel}
        onOpenCommand={(planet) => {
          const ownedPlanet = planets.find((candidate) => candidate.entityPda === planet.id);
          if (ownedPlanet) {
            openPlanetCommand(ownedPlanet.entityPda);
            return;
          }
          const commandSource = selectedState ?? planets[0] ?? null;
          const [galaxy, system, position] = planet.system.split(":").map(Number);
          if (commandSource && [galaxy, system, position].every(Number.isFinite)) {
            openPlanetCommand(commandSource.entityPda, "missions", {
              galaxy,
              system,
              position,
              missionType: 1,
            });
            return;
          }
          setTarget(planet);
        }}
        onOpenEmptyTarget={(empty) => {
          const commandSource = selectedState ?? planets[0] ?? null;
          if (commandSource) {
            openPlanetCommand(commandSource.entityPda, "missions", {
              galaxy: empty.galaxy,
              system: empty.system,
              position: empty.position,
              missionType: 5,
            });
            return;
          }
          setTarget({
            id: `empty:${empty.galaxy}:${empty.system}:${empty.position}`,
            name: `Empty position ${empty.position}`,
            system: `${empty.galaxy}:${empty.system}:${empty.position}`,
            shielded: false,
            faction: "unknown",
            ownerLabel: "",
          });
        }}
        ownedPlanets={planets.map((planet) => ({
          entity: planet.entityPda,
          name: planet.planet.name,
          galaxy: planet.planet.galaxy,
          system: planet.planet.system,
          position: planet.planet.position,
          ...empireWorldSummary(planet, Math.floor(Date.now() / 1_000)),
        }))}
        activeOwnedPlanet={sourceEntity}
        initialGalaxy={returnSystem?.galaxy}
        initialSystem={returnSystem?.system}
        sponsorTokenAccounts={client
          ? (accounts) => client.buildSponsoredTokenAccountRentInstruction(accounts)
          : undefined}
        onOperatePlanet={(planet) => {
          openPlanetCommand(planet.entity);
        }}
      />}
      {planetWorldState && (
        <PlanetWorldBoundary>
        <React.Suspense fallback={<PlanetWorldLoading worldName={planetWorldState.planet.name || "Command world"} />}>
        <PlanetWorld
          state={planetWorldState}
          busy={busy}
          run={(label, action) => runForEntity(label, planetWorldState.entityPda, action)}
          game={client}
          market={marketClient}
          worlds={planets.map((planet) => ({ entity: planet.entityPda, name: planet.planet.name || `Planet ${planet.planet.planetIndex + 1}` }))}
          ownedWorlds={planets}
          activity={{ battleReports, spyReports, loading: activityLoading, refresh: refreshActivity }}
          marketControls={{
            onTxStart: (label) => {
              setBusy(true);
              setStatus(`${label}...`);
              setOperation({ label, detail: "Preparing the marketplace transaction for the active world.", phase: "processing" });
            },
            onTxEnd: (error) => {
              setBusy(false);
              if (error) {
                const failure = playerError(error, "The marketplace command could not be completed.");
                setStatus(failure.detail);
                setOperation({ label: "Marketplace command", ...failure, phase: "error" });
                return;
              }
              setStatus("Marketplace transaction confirmed.");
              setOperation({ label: "Marketplace command", detail: "The transaction was confirmed and market state is refreshing.", phase: "success" });
              void refresh().catch(() => undefined);
            },
          }}
          onExit={() => {
            setPlanetDeparture({
              id: Date.now(),
              name: planetWorldState.planet.name || "Command world",
              coordinates: `G ${planetWorldState.planet.galaxy} · S ${planetWorldState.planet.system} · P ${planetWorldState.planet.position}`,
            });
            setReturnSystem({ galaxy: planetWorldState.planet.galaxy, system: planetWorldState.planet.system });
            setPlanetWorldEntity(null);
            setPlanetCommandRequest(null);
          }}
          onOpenWallet={() => setWalletMenuOpen(true)}
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
          commandRequest={planetCommandRequest}
        />
        </React.Suspense>
        </PlanetWorldBoundary>
      )}
      {planetApproach && <PlanetTransitTransition worldName={planetApproach.name} coordinates={planetApproach.coordinates} />}
      {planetDeparture && <PlanetTransitTransition worldName={planetDeparture.name} coordinates={planetDeparture.coordinates} direction="departure" />}
      {!planetWorldState && publicKey && !loadingPlanets && selectedState && (
        <nav ref={commandDockRef} className="ug-global-command" aria-label="Game command center" onScroll={updateCommandDock}>
          <button className="primary" onClick={() => openPlanetCommand(selectedState.entityPda)}><BarChart3 /><span>PLANET</span></button>
          <button onClick={() => openPlanetCommand(selectedState.entityPda, "buildingSelect")}><Building2 /><span>BUILD</span></button>
          <button onClick={() => openPlanetCommand(selectedState.entityPda, "research")}><FlaskConical /><span>RESEARCH</span></button>
          <button onClick={() => openPlanetCommand(selectedState.entityPda, "ships")}><Rocket /><span>FLEET</span></button>
          <button onClick={() => openPlanetCommand(selectedState.entityPda, "missions")}><Crosshair /><span>MISSIONS</span></button>
          <button className="ug-command-secondary" onClick={() => openPlanetCommand(selectedState.entityPda, "alliance")}><Users /><span>ALLIANCE</span></button>
          <button className="ug-command-secondary" onClick={() => openPlanetCommand(selectedState.entityPda, "market")}><ShoppingCart /><span>MARKET</span></button>
          <button className="ug-command-secondary" onClick={() => openPlanetCommand(selectedState.entityPda, "quests")}><Trophy /><span>QUESTS</span></button>
          {(productionPreview || commandDockCanScroll && !commandDockAtEnd) && <button
            type="button"
            className="ug-command-more"
            aria-label="Open more game commands"
            aria-haspopup="dialog"
            aria-expanded={commandMenuOpen}
            onClick={() => setCommandMenuOpen(true)}
          ><ChevronRight /><span>MORE</span></button>}
        </nav>
      )}
      {commandMenuOpen && selectedState && typeof document !== "undefined" && createPortal(
        <div className="ug-command-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandMenuOpen(false); }}>
          <section className="ug-command-sheet" role="dialog" aria-modal="true" aria-labelledby="ug-command-sheet-title">
            <header><div><small>COMMAND NETWORK</small><h2 id="ug-command-sheet-title">More operations</h2><p>Alliance coordination, trading, and progression records.</p></div><button ref={commandMenuCloseRef} type="button" aria-label="Close more operations" onClick={() => setCommandMenuOpen(false)}>×</button></header>
            <div className="ug-command-sheet-grid">
              <button onClick={() => { setCommandMenuOpen(false); openPlanetCommand(selectedState.entityPda, "alliance"); }}><Users /><span><b>Alliance</b><small>Members, sovereignty, and joint decisions</small></span><ChevronRight /></button>
              <button onClick={() => { setCommandMenuOpen(false); openPlanetCommand(selectedState.entityPda, "market"); }}><ShoppingCart /><span><b>Market</b><small>Trade resources across the player economy</small></span><ChevronRight /></button>
              <button onClick={() => { setCommandMenuOpen(false); openPlanetCommand(selectedState.entityPda, "quests"); }}><Trophy /><span><b>Quests</b><small>Objectives, rewards, and commander progress</small></span><ChevronRight /></button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      <header className={`ug-top${planetWorldState ? " ug-top-hidden" : ""}`} aria-hidden={planetWorldState ? true : undefined}>
        {publicKey ? (
          productionPreview ? <>
            <button
              ref={playerTriggerRef}
              className="ug-player-trigger"
              aria-expanded={walletMenuOpen}
              aria-controls="production-player-account"
              onClick={() => setWalletMenuOpen((open) => !open)}
            >
              <span className="ug-player-mark" aria-hidden="true">{walletLabel.slice(0, 2)}</span>
              <span className="ug-player-copy">
                <strong>{walletLabel}</strong>
                <small>{planets.length} {planets.length === 1 ? "WORLD" : "WORLDS"}</small>
              </span>
              <span className={`ug-player-presence ${quickPlayUsable ? "online" : "attention"}`}>
                {quickPlayUsable ? "QUICK PLAY" : "ACTION NEEDED"}
              </span>
            </button>
            {walletMenuOpen && createPortal(
              <>
                <button
                  className="ug-wallet-scrim production-account-scrim"
                  aria-label="Close player account"
                  onClick={() => setWalletMenuOpen(false)}
                />
                <section id="production-player-account" className={`ug-account-drawer${vaultStatus !== "ready" ? " setup-mode" : ""}`} role="dialog" aria-modal="true" aria-labelledby="production-player-account-title">
                  <header className="ug-account-heading">
                    <div>
                      <span>PLAYER ACCOUNT</span>
                      <h2 id="production-player-account-title">{vaultStatus === "ready" ? "Commander online" : "Finish account setup"}</h2>
                    </div>
                    <button ref={accountCloseRef} aria-label="Close player account" title="Close (Esc)" onClick={() => setWalletMenuOpen(false)}>×</button>
                  </header>

                  <section className="ug-account-identity">
                    <span className="ug-account-avatar" aria-hidden="true">{walletLabel.slice(0, 2)}</span>
                    <div><strong>{walletLabel}</strong><small>Permanent passkey game account · {NETWORK_LABEL}</small></div>
                    <b className={passkey.connected ? "good" : ""}>{passkey.connected ? "SECURE" : "OFFLINE"}</b>
                  </section>

                  {vaultStatus !== "ready" && <ol className="ug-account-setup-progress" aria-label="Account setup progress">
                    <li className="done"><i aria-hidden="true">1</i><span><b>Account secured</b><small>Passkey ready</small></span></li>
                    <li className={quickPlayUsable ? "done" : "current"} aria-current={!quickPlayUsable ? "step" : undefined}><i aria-hidden="true">2</i><span><b>Quick Play</b><small>{quickPlayUsable ? "Permission active" : "Approve once"}</small></span></li>
                    <li className={quickPlayUsable ? "current" : ""} aria-current={quickPlayUsable ? "step" : undefined}><i aria-hidden="true">3</i><span><b>Commander</b><small>{quickPlayUsable ? "Ready to create" : "Up next"}</small></span></li>
                  </ol>}

                  <section className="ug-account-stats" aria-label="Player overview">
                    <div><span>WORLDS</span><strong>{planets.length}</strong></div>
                    <div><span>SOL BALANCE</span><strong>{(Number(vaultBalance) / 1_000_000_000).toFixed(3)}</strong></div>
                    <div><span>ANTIMATTER</span><strong>{tokenLabel(antimatterBalance)}</strong></div>
                    <div><span>USDC</span><strong>{tokenLabel(usdcBalance)}</strong></div>
                  </section>

                  <section className={`ug-quick-play-panel ${quickPlayUsable ? "ready" : "needs-action"}`}>
                    <header>
                      <div><span>QUICK PLAY</span><strong>{quickPlayUsable ? "Ready for commands" : passkey.paymasterReady ? "Turn on to play faster" : "Checking sponsor"}</strong></div>
                      <b>{quickPlayUsable ? "ON" : "OFF"}</b>
                    </header>
                    <p>{quickPlayUsable
                      ? "Supported game actions are promptless on this device for up to eight hours."
                      : "Approve once, then issue supported game commands without repeated wallet prompts."}</p>
                    <div className="ug-play-balance">
                      <span>NETWORK FEES</span>
                      <strong>{passkey.paymasterReady ? "SPONSORED" : "CHECKING"}</strong>
                    </div>
                    <div className="ug-account-primary-actions">
                      {!passkey.hasSession ? (
                        <button className="primary" disabled={passkeyActionBusy || !onboardingFunded} onClick={() => void enableGameplaySession()}>TURN ON QUICK PLAY</button>
                      ) : (
                        <button className="secondary" disabled={passkeyActionBusy} onClick={() => void lockGameplaySession()}>PAUSE QUICK PLAY</button>
                      )}
                      <button className="secondary" disabled={balanceRefreshBusy} onClick={() => void checkOnboardingFunding()}>{balanceRefreshBusy ? "CHECKING…" : "REFRESH"}</button>
                    </div>
                  </section>

                  {vaultStatus !== "ready" && <section className={`ug-account-callout${!quickPlayUsable ? " locked" : ""}`}>
                    <div><span>{quickPlayUsable ? "NEXT STEP" : "AFTER QUICK PLAY"}</span><strong>Create your commander profile</strong><small>{quickPlayUsable ? "This connects your secure account to the live GAMESOL devnet universe." : "Turn on Quick Play above, then create your permanent in-game identity."}</small></div>
                    <button disabled={passkeyActionBusy || !passkey.hasSession} onClick={() => void initializePasskeyPlayer()}>CREATE COMMANDER</button>
                  </section>}

                  <button className="ug-account-funds" aria-haspopup="dialog" onClick={(event) => { fundsOpenerRef.current = event.currentTarget; setWalletMenuOpen(false); setFundsOpen(true); }}>
                    <span>MANAGE FUNDS</span><small>Deposit, withdraw, and move supported assets</small><b>→</b>
                  </button>

                  <details className="ug-account-details">
                    <summary>Account details</summary>
                    <dl>
                      <div><dt>NETWORK</dt><dd>{NETWORK_LABEL}</dd></div>
                      <div><dt>SHIELD</dt><dd>{shieldActive ? "ACTIVE" : "OFF"}</dd></div>
                      <div><dt>GAME ACCOUNT</dt><dd title={passkey.vaultPublicKey?.toBase58()}>{passkey.vaultPublicKey ? `${passkey.vaultPublicKey.toBase58().slice(0, 10)}…${passkey.vaultPublicKey.toBase58().slice(-8)}` : "Preparing…"}</dd></div>
                      <div><dt>DEVICE PERMISSION</dt><dd title={passkey.sessionFeeAddress ?? undefined}>{passkey.sessionFeeAddress ? `${passkey.sessionFeeAddress.slice(0, 10)}…${passkey.sessionFeeAddress.slice(-8)}` : "Not active"}</dd></div>
                      <div><dt>FEE SPONSOR</dt><dd title={passkey.sponsorPayerAddress ?? undefined}>{passkey.sponsorPayerAddress ? `${passkey.sponsorPayerAddress.slice(0, 10)}…${passkey.sponsorPayerAddress.slice(-8)}` : "Checking…"}</dd></div>
                    </dl>
                    {IS_DEVNET && <div className="ug-account-test-tools"><button disabled={balanceRefreshBusy} onClick={() => void checkOnboardingFunding()}>{balanceRefreshBusy ? "CHECKING…" : "CHECK SPONSOR"}</button></div>}
                  </details>

                  <footer className="ug-account-footer">
                    <small>Your planets and assets stay in your permanent game account.</small>
                    <button disabled={passkeyActionBusy} onClick={() => void passkey.disconnect()}>SIGN OUT</button>
                  </footer>
                </section>
              </>,
              document.body,
            )}
          </> : <>
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
                    <span>PLAYER ACCOUNT</span>
                    <button onClick={() => setWalletMenuOpen(false)}>×</button>
                  </header>
                  <div className="ug-wallet-row">
                    <span>Network</span>
                    <b>{NETWORK_LABEL}</b>
                  </div>
                  <div className="ug-wallet-row">
                    <span>Player ID</span>
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
                    <span>Commander</span>
                    <b className={vaultStatus === "ready" ? "good" : ""}>
                      {vaultStatus === "ready" ? "READY" : "SETUP NEEDED"}
                    </b>
                  </div>
                  <div className="ug-wallet-row">
                    <span>Account balance</span>
                    <b>{(Number(vaultBalance) / 1_000_000_000).toFixed(4)} SOL</b>
                  </div>
                  <button className="ug-manage-funds" aria-haspopup="dialog" onClick={(event) => { fundsOpenerRef.current = event.currentTarget; setWalletMenuOpen(false); setFundsOpen(true); }}>MANAGE FUNDS</button>
                  <section className="ug-passkey-card">
                    <header>
                      <span>SIGN-IN & QUICK PLAY</span>
                      <b className={passkey.connected ? "good" : ""}>{passkey.connected ? "SIGNED IN" : "SIGNED OUT"}</b>
                    </header>
                    <p>
                      Your device passkey protects your account. Quick Play lets you play for up to 8 hours
                      without approving every action.
                    </p>
                    {passkey.vaultPublicKey && (
                      <div className="ug-passkey-address" title={passkey.vaultPublicKey.toBase58()}>
                        {passkey.vaultPublicKey.toBase58().slice(0, 10)}…{passkey.vaultPublicKey.toBase58().slice(-8)}
                      </div>
                    )}
                    <div className="ug-passkey-state">
                      <span>QUICK PLAY</span>
                      <b className={quickPlayUsable ? "good" : ""}>{passkey.hasSession ? quickPlayUsable ? "ON" : "CHECKING" : "OFF"}</b>
                    </div>
                    {passkey.sponsorPayerAddress && <>
                      <div className="ug-passkey-state">
                        <span>NETWORK FEES</span>
                        <b className={passkey.paymasterReady ? "good" : ""}>{passkey.paymasterReady ? "SPONSORED" : "CHECKING"}</b>
                      </div>
                      <div className="ug-passkey-address" title={passkey.sponsorPayerAddress}>
                        {passkey.sponsorPayerAddress.slice(0, 10)}…{passkey.sponsorPayerAddress.slice(-8)}
                      </div>
                    </>}
                    <div className="ug-passkey-actions">
                      {!passkey.connected ? (
                        <button disabled={passkeyActionBusy} onClick={() => void connectPasskey()}>CREATE OR SIGN IN</button>
                      ) : (
                        <>
                          {!passkey.hasSession ? (
                            <button disabled={passkeyActionBusy || !onboardingFunded} onClick={() => void enableGameplaySession()}>TURN ON QUICK PLAY</button>
                          ) : (
                            <button className="secondary" disabled={passkeyActionBusy} onClick={() => void lockGameplaySession()}>TURN OFF QUICK PLAY</button>
                          )}
                          {vaultStatus !== "ready" && (
                            <button disabled={passkeyActionBusy || !passkey.hasSession} onClick={() => void initializePasskeyPlayer()}>CREATE COMMANDER</button>
                          )}
                          <button className="secondary" disabled={balanceRefreshBusy} onClick={() => void checkOnboardingFunding()}>{balanceRefreshBusy ? "CHECKING..." : "CHECK SPONSOR"}</button>
                          <button className="secondary" disabled={passkeyActionBusy} onClick={() => void passkey.disconnect()}>SIGN OUT</button>
                        </>
                      )}
                    </div>
                    <small>Quick Play can only perform approved GAMESOL actions. It cannot move your planets or assets elsewhere.</small>
                  </section>
                  <div className="ug-wallet-row">
                    <span>Antimatter</span>
                    <b>{tokenLabel(antimatterBalance)} AM</b>
                  </div>
                  <div className="ug-wallet-row">
                    <span>USDC</span>
                    <b>{tokenLabel(usdcBalance)} USDC</b>
                  </div>
                  {IS_DEVNET && <section className="ug-devnet-tools">
                    <header><span>TEST MODE</span><b>SOLANA {NETWORK_LABEL}</b></header>
                    <p>GAMESOL sponsors devnet transaction fees and the GAMESOL account space needed for commanders, worlds, quests, alliances, governance, and player-created marketplace listings. Your permanent account keeps ownership without needing a SOL balance for these supported actions.</p>
                    <div>
                      <a href="https://faucet.solana.com/" target="_blank" rel="noreferrer">GET TEST SOL</a>
                      <button disabled={balanceRefreshBusy} onClick={() => void checkOnboardingFunding()}>{balanceRefreshBusy ? "CHECKING…" : "CHECK SPONSOR"}</button>
                    </div>
                  </section>}
                  <div className="ug-wallet-actions">
                    <button onClick={() => void passkey.disconnect()}>SIGN OUT</button>
                  </div>
                  <details className="ug-passkey-funding-note">
                    <summary>Advanced account details</summary>
                    <p>The device stores a replaceable, restricted gameplay permission—not a funded wallet. Your planets, tokens, and SOL remain in your permanent passkey account.</p>
                  </details>
                </section>
              </>,
              document.body,
            )}
          </>
        ) : (
          <WalletConnectControl
            disconnectedLabel="START PLAYING"
            connectingLabel="OPENING SECURE SIGN-IN…"
            compactConnectingLabel="SIGNING IN…"
          />
        )}
      </header>
      {!planetWorldState && publicKey && loadingPlanets && (
        <section className="ug-connecting" role="status">
          <div className="ug-loader" />
          <strong>CONNECTING TO COMMAND NETWORK</strong>
          <span>Loading your worlds and player account</span>
        </section>
      )}
      {!planetWorldState && publicKey && !loadingPlanets && planets.length === 0 && (productionPreview ? (
        <section className="ug-onboarding production-onboarding" aria-label="New commander onboarding">
          <header className="ug-onboarding-header">
            <div>
              <span>NEW COMMANDER</span>
              <h1>Enter the GAMESOL universe</h1>
              <p>Your account is ready. Complete one guided setup, then claim your first world.</p>
            </div>
            <b>STAGE {onboardingFunded && onboardingSessionReady && onboardingProfileReady ? 3 : 2} / 3</b>
          </header>
          <div className="ug-onboarding-progress" aria-label="Onboarding progress">
            <i className="done"><b>1</b><span>ACCOUNT</span></i>
            <i className={onboardingFunded && onboardingSessionReady && onboardingProfileReady ? "done" : "active"}><b>2</b><span>READY TO PLAY</span></i>
            <i className={onboardingFunded && onboardingSessionReady && onboardingProfileReady ? "active" : ""}><b>3</b><span>FIRST WORLD</span></i>
          </div>
          <ol className="ug-onboarding-steps production-stages">
            <li className="done production-stage account-stage">
              <b>1</b><div><strong>Game account secured</strong><small>Your device passkey protects your permanent player account and lets you return safely.</small></div><em>READY</em>
            </li>
            <li className={`${onboardingFunded && onboardingSessionReady && onboardingProfileReady ? "done" : "active"} production-stage readiness-stage`}>
              <b>2</b><div className="production-stage-copy"><strong>Ready to play</strong><small>Prepare normal game actions once. We will guide you through each required approval.</small></div><em>{onboardingFunded && onboardingSessionReady && onboardingProfileReady ? "READY" : "IN PROGRESS"}</em>
              <div className="ug-readiness-checklist">
                <article className={onboardingFunded ? "complete" : "current"}>
                  <i>{onboardingFunded ? "✓" : "1"}</i>
                  <div><strong>Sponsored game costs</strong><small>GAMESOL covers devnet fees and GAMESOL account space for your commander, worlds, quests, alliances, governance, and marketplace listings. You do not need SOL for these supported game actions.</small></div>
                  <b>{onboardingFunded ? "AVAILABLE" : "CHECKING"}</b>
                  {!onboardingFunded && <aside>
                    <button className="ug-balance-refresh" disabled={balanceRefreshBusy} onClick={() => void checkOnboardingFunding()}>{balanceRefreshBusy ? "CHECKING…" : "CHECK AGAIN"}</button>
                  </aside>}
                </article>
                <article className={onboardingSessionReady ? "complete" : onboardingFunded ? "current" : "locked"}>
                  <i>{onboardingSessionReady ? "✓" : "2"}</i>
                  <div><strong>Quick Play</strong><small>Approve once, then perform supported GAMESOL actions for up to eight hours without repeated prompts.</small></div>
                  <b>{onboardingSessionReady ? "ON" : onboardingFunded ? "NEXT" : "LOCKED"}</b>
                  {!onboardingSessionReady && onboardingFunded && <aside><button disabled={passkeyActionBusy} onClick={() => void enableGameplaySession()}>{passkeyActionBusy ? "WAITING FOR APPROVAL…" : "TURN ON QUICK PLAY"}</button></aside>}
                </article>
                <article className={onboardingProfileReady ? "complete" : onboardingSessionReady ? "current" : "locked"}>
                  <i>{onboardingProfileReady ? "✓" : "3"}</i>
                  <div><strong>Commander profile</strong><small>Create your permanent player identity in the GAMESOL universe.</small></div>
                  <b>{onboardingProfileReady ? "READY" : onboardingSessionReady ? "NEXT" : "LOCKED"}</b>
                  {!onboardingProfileReady && onboardingSessionReady && <aside><button disabled={passkeyActionBusy} onClick={() => void initializePasskeyPlayer()}>{passkeyActionBusy ? "CREATING COMMANDER…" : "CREATE COMMANDER"}</button></aside>}
                </article>
              </div>
              <details className="ug-onboarding-advanced">
                <summary>Advanced account details</summary>
                <dl>
                  <div><dt>GAME ACCOUNT</dt><dd>{(Number(vaultBalance) / 1_000_000_000).toFixed(4)} SOL</dd></div>
                  <div><dt>NETWORK FEES</dt><dd>{passkey.paymasterReady ? "SPONSORED" : "CHECKING"}</dd></div>
                  <div><dt>SPONSOR</dt><dd>{passkey.sponsorPayerAddress ?? "Preparing…"}</dd></div>
                  <div><dt>DEVICE PERMISSION</dt><dd>{passkey.sessionFeeAddress ?? "Preparing…"}</dd></div>
                </dl>
              </details>
            </li>
            <li className={`${onboardingFunded && onboardingSessionReady && onboardingProfileReady ? "active" : ""} production-stage homeworld-stage`}>
              <b>3</b><div><strong>Claim your first world</strong><small>Name your homeworld. The game will reserve a genuinely available devnet position.</small></div><em>FINAL</em>
              {onboardingFunded && onboardingSessionReady && onboardingProfileReady && <aside className="ug-onboarding-homeworld"><label><span>HOMEWORLD NAME</span><input aria-label="Homeworld name" placeholder="Enter a world name" value={homeworldName} maxLength={32} onChange={(event) => setHomeworldName(event.target.value)} /></label><button disabled={busy || !homeworldName.trim()} onClick={createHomeworld}>{busy ? "CLAIMING…" : "CLAIM MY HOMEWORLD"}</button></aside>}
            </li>
          </ol>
          <footer>
            <span>PLAYER ID</span>
            <code>{publicKey.toBase58()}</code>
          </footer>
        </section>
      ) : (
        <section className="ug-onboarding" aria-label="New commander onboarding">
          <header className="ug-onboarding-header">
            <div>
              <span>WELCOME, COMMANDER</span>
              <h1>Create your first world</h1>
            </div>
            <b>STEP {onboardingStep} / 5</b>
          </header>
          <div className="ug-onboarding-progress" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((step) => <i key={step} className={step < onboardingStep ? "done" : step === onboardingStep ? "active" : ""} />)}
          </div>
          <ol className="ug-onboarding-steps">
            <li className="done">
              <b>1</b><div><strong>Game account created</strong><small>Your device passkey keeps your account safe and lets you return later.</small></div><em>READY</em>
            </li>
            <li className={onboardingFunded ? "done" : "active"}>
              <b>2</b><div><strong>Check sponsored play</strong><small>GAMESOL covers supported devnet fees and game-account space. Your permanent passkey account remains the only place that owns your assets.</small>
                <section className="ug-funding-breakdown">
                  <span><i>NETWORK FEES</i><b className={onboardingFunded ? "good" : ""}>{onboardingFunded ? "SPONSORED" : "CHECKING"}</b></span>
                  <details>
                    <summary>Advanced details</summary>
                    <span><i>GAME ACCOUNT</i><b className={vaultBalance >= 50_000_000n ? "good" : ""}>{(Number(vaultBalance) / 1_000_000_000).toFixed(4)} SOL</b></span>
                    <span><i>FEE SPONSOR</i><b className={onboardingFunded ? "good" : ""}>{onboardingFunded ? "AVAILABLE" : "UNAVAILABLE"}</b></span>
                    <code>{passkey.sponsorPayerAddress ?? "Checking sponsor…"}</code>
                  </details>
                </section>
              </div><em>{onboardingFunded ? "READY" : "ACTION NEEDED"}</em>
              {!onboardingFunded && <aside><button className="ug-balance-refresh" disabled={balanceRefreshBusy} onClick={() => void checkOnboardingFunding()}>{balanceRefreshBusy ? "CHECKING..." : "CHECK SPONSOR"}</button></aside>}
            </li>
            <li className={onboardingSessionReady ? "done" : onboardingFunded ? "active" : ""}>
              <b>3</b><div><strong>Turn on Quick Play</strong><small>Approve once, then play for up to 8 hours without confirming every action.</small></div><em>{onboardingSessionReady ? "ON" : "OFF"}</em>
              {!onboardingSessionReady && <aside><button disabled={!onboardingFunded || passkeyActionBusy} onClick={() => void enableGameplaySession()}>TURN ON QUICK PLAY</button></aside>}
            </li>
            <li className={onboardingProfileReady ? "done" : onboardingSessionReady ? "active" : ""}>
              <b>4</b><div><strong>Create your commander</strong><small>Set up your player profile in the GAMESOL universe.</small></div><em>{onboardingProfileReady ? "READY" : "NEXT"}</em>
              {!onboardingProfileReady && <aside><button disabled={!onboardingSessionReady || passkeyActionBusy} onClick={() => void initializePasskeyPlayer()}>CREATE COMMANDER</button></aside>}
            </li>
            <li className={onboardingSessionReady && onboardingProfileReady ? "active" : ""}>
              <b>5</b><div><strong>Name your homeworld</strong><small>Choose a name and claim your first available world.</small></div><em>FINAL</em>
              {onboardingSessionReady && onboardingProfileReady && <aside className="ug-onboarding-homeworld"><input aria-label="Homeworld name" placeholder="Enter a world name" value={homeworldName} maxLength={32} onChange={(event) => setHomeworldName(event.target.value)} /><button disabled={busy || !homeworldName.trim()} onClick={createHomeworld}>CLAIM MY HOMEWORLD</button></aside>}
            </li>
          </ol>
          <footer>
            <span>PLAYER ID</span>
            <code>{publicKey.toBase58()}</code>
          </footer>
        </section>
      ))}
      {status && <div className="ug-status" role="status" aria-live="polite"><span>{status}</span><button type="button" aria-label="Dismiss message" onClick={() => setStatus("")}>×</button></div>}
      {fundsOpen && passkey.vaultPublicKey && <FundsModal
        vaultAddress={passkey.vaultPublicKey}
        vaultSol={vaultBalance}
        antimatter={antimatterBalance}
        usdc={usdcBalance}
        antimatterAvailable={Boolean(antimatterMint)}
        usdcAvailable={Boolean(usdcMint)}
        returnFocusTo={fundsOpenerRef.current}
        onClose={() => setFundsOpen(false)}
        onSend={sendPlayerFunds}
        onClaimDevnetAntimatter={IS_DEVNET ? claimDevnetAntimatter : undefined}
        onRefreshBalances={refreshPlayerBalances}
      />}
      <OperationModal
        operation={vaultRequest ? null : operation}
        onClose={() => setOperation(null)}
      />
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
            cacheVaultPasswordForSession(vaultRequest.wallet, password);
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
      <LiveCaptureControl />
    </main>
  );
}
