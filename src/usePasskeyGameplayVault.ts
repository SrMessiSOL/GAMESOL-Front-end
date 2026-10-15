import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet as useLazorWallet } from "@lazorkit/wallet";
import { PublicKey } from "@solana/web3.js";
import { GAME_STATE_PROGRAM_ID, MARKET_PROGRAM_ID, type GameplayVaultExecutor } from "./game-state";
import { isUfoSessionBundle } from './ufo-onchain';
import {
  activatePlayerFundedSession,
  ensurePlayerFeeSession,
  executeWithPlayerSession,
  hasPlayerFundedSession,
  refreshPlayerFundedSession,
  revokePlayerFundedSession,
} from "./player-funded-session";

export function usePasskeyGameplayVault() {
  const lazor = useLazorWallet();
  const walletPda = lazor.wallet?.smartWallet ?? null;
  const vaultAddress = lazor.wallet?.vaultPda ?? null;
  const [hasSession, setHasSession] = useState(false);
  const walletRef = useRef(walletPda);
  walletRef.current = walletPda;
  const revision = useRef(0);
  const [sessionFeeAddress, setSessionFeeAddress] = useState<string | null>(null);
  const [sessionFeeBalance, setSessionFeeBalance] = useState(0n);
  const [sponsorPayerAddress, setSponsorPayerAddress] = useState<string | null>(null);
  const [paymasterReady, setPaymasterReady] = useState(false);
  const [sessionExpiresAtSlot, setSessionExpiresAtSlot] = useState<bigint | null>(null);
  const vaultPublicKey = useMemo(
    () => (vaultAddress ? new PublicKey(vaultAddress) : null),
    [vaultAddress],
  );

  const refreshSessionFunding = useCallback(async () => {
    const request = ++revision.current;
    if (!walletPda) {
      setSessionFeeAddress(null);
      setSessionFeeBalance(0n);
      setSessionExpiresAtSlot(null);
      setSponsorPayerAddress(null);
      setPaymasterReady(false);
      setHasSession(false);
      return null;
    }
    const state = await refreshPlayerFundedSession(walletPda);
    if (walletRef.current !== walletPda || request !== revision.current) return null;
    setSessionFeeAddress(state.publicKey);
    setSessionFeeBalance(state.balanceLamports);
    setSessionExpiresAtSlot(state.expiresAtSlot);
    setSponsorPayerAddress(state.sponsorPayer);
    setPaymasterReady(state.sponsored);
    setHasSession(state.active);
    return state;
  }, [walletPda]);

  useEffect(() => {
    setHasSession(false);
    setSponsorPayerAddress(null);
    setPaymasterReady(false);
    setSessionExpiresAtSlot(null);
    if (!walletPda) {
      setSessionFeeAddress(null);
      setSessionFeeBalance(0n);
      setHasSession(false);
      return;
    }
    const stored = ensurePlayerFeeSession(walletPda);
    setSessionFeeAddress(stored.publicKey);
    void refreshSessionFunding().catch(() => undefined);
    return () => { revision.current++; };
  }, [refreshSessionFunding, walletPda]);

  const connect = useCallback(async () => {
    // The permanent passkey vault owns the player account. Lazor's paymaster
    // covers network fees; the restricted browser session only authorizes
    // routine GAMESOL commands and never becomes a second funded wallet.
    await lazor.connect({ feeMode: "paymaster" });
  }, [lazor]);

  const createGameplaySession = useCallback(async () => {
    if (!lazor.wallet) throw new Error("Sign in to your game account first.");
    const request = ++revision.current;
    const state = await activatePlayerFundedSession(lazor.wallet);
    if (walletRef.current !== lazor.wallet.smartWallet || request !== revision.current) throw new Error("Your game account or Quick Play session changed. Check the current account before retrying.");
    setSessionFeeAddress(state.publicKey);
    setSessionFeeBalance(state.balanceLamports);
    setSessionExpiresAtSlot(state.expiresAtSlot);
    setSponsorPayerAddress(state.sponsorPayer);
    setPaymasterReady(state.sponsored);
    setHasSession(state.active);
  }, [lazor.wallet]);

  const revokeGameplaySession = useCallback(async () => {
    if (!lazor.wallet) throw new Error("Sign in to your game account first.");
    const request = ++revision.current;
    const state = await revokePlayerFundedSession(lazor.wallet);
    if (walletRef.current !== lazor.wallet.smartWallet || request !== revision.current) return;
    setSessionFeeAddress(state.publicKey);
    setSessionFeeBalance(state.balanceLamports);
    setSessionExpiresAtSlot(state.expiresAtSlot);
    setSponsorPayerAddress(state.sponsorPayer);
    setPaymasterReady(state.sponsored);
    setHasSession(false);
  }, [lazor.wallet]);

  const disconnect = useCallback(async () => {
    revision.current++;
    await lazor.disconnect();
    setHasSession(false);
    setSessionFeeAddress(null);
    setSessionFeeBalance(0n);
    setSessionExpiresAtSlot(null);
    setSponsorPayerAddress(null);
    setPaymasterReady(false);
  }, [lazor]);

  const executor = useMemo<GameplayVaultExecutor | null>(() => {
    if (!vaultPublicKey || !lazor.wallet || !sponsorPayerAddress) return null;
    const wallet = lazor.wallet;
    return {
      vaultPublicKey,
      payerPublicKey: new PublicKey(sponsorPayerAddress),
      execute: async (instructions, authorization) => {
        const routineProgramsOnly = instructions.every((instruction) =>
          instruction.programId.equals(GAME_STATE_PROGRAM_ID)
          || instruction.programId.equals(MARKET_PROGRAM_ID),
        );
        const verifiedUfoBundle = !routineProgramsOnly && await isUfoSessionBundle(instructions, vaultPublicKey);
        // Never silently broaden the session allowlist. Commands containing
        // direct System/SPL instructions fall back to explicit passkey approval.
        const effectiveAuthorization = authorization === "session" && (routineProgramsOnly || verifiedUfoBundle)
          ? "session"
          : "passkey";
        if (effectiveAuthorization === "session" && !hasPlayerFundedSession(wallet.smartWallet)) {
          setHasSession(false);
          throw new Error("Quick Play is off. Turn it on with your passkey first.");
        }
        const signature = await executeWithPlayerSession(wallet, instructions, effectiveAuthorization);
        void refreshSessionFunding().catch(() => undefined);
        return signature;
      },
    };
  }, [lazor.wallet, refreshSessionFunding, sponsorPayerAddress, vaultPublicKey]);

  return {
    connected: lazor.isConnected,
    connecting: lazor.isConnecting,
    signing: lazor.isSigning,
    error: lazor.error,
    wallet: lazor.wallet,
    vaultPublicKey,
    executor,
    hasSession,
    sessionFeeAddress,
    sessionFeeBalance,
    sponsorPayerAddress,
    paymasterReady,
    sessionExpiresAtSlot,
    refreshSessionFunding,
    connect,
    disconnect,
    createGameplaySession,
    revokeGameplaySession,
  };
}
