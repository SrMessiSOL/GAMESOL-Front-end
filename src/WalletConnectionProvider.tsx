import React, { type PropsWithChildren, useCallback, useMemo } from "react";
import { ConnectionProvider, WalletContext, type WalletContextState } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { useWallet as useLazorWallet } from "@lazorkit/wallet";
import { executeWithPlayerSession } from "./player-funded-session";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const CONFIGURED_RPC_ENDPOINT = env.VITE_SOLANA_RPC_ENDPOINT?.trim() || "https://api.devnet.solana.com";
const USE_SAME_ORIGIN_RPC = CONFIGURED_RPC_ENDPOINT.startsWith("/") && typeof window !== "undefined";
// web3.js requires an absolute HTTP(S) URL even when Vite serves a same-origin proxy.
const RPC_ENDPOINT = USE_SAME_ORIGIN_RPC
  ? new URL(CONFIGURED_RPC_ENDPOINT, window.location.origin).toString()
  : CONFIGURED_RPC_ENDPOINT;
const RPC_WS_ENDPOINT = USE_SAME_ORIGIN_RPC
  ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/solana-ws`
  : undefined;

export function passkeyBrowserSupportError(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) {
    return "Passkeys require trusted HTTPS or a localhost address. Do not continue through a certificate warning.";
  }
  if (typeof window.PublicKeyCredential === "undefined") {
    return "This embedded browser cannot use device passkeys. Open GAMESOL directly in Chrome, Edge, or Safari.";
  }
  return null;
}

const LazorWalletContext: React.FC<PropsWithChildren> = ({ children }) => {
  const lazor = useLazorWallet();
  const publicKey = useMemo(
    () => lazor.wallet?.vaultPda ? new PublicKey(lazor.wallet.vaultPda) : null,
    [lazor.wallet?.vaultPda],
  );

  const sendTransaction = useCallback<WalletContextState["sendTransaction"]>(async (transaction) => {
    if (!lazor.wallet) throw new Error("Connect your passkey wallet first.");
    const instructions = transaction instanceof Transaction
      ? transaction.instructions
      : TransactionMessage.decompile((transaction as VersionedTransaction).message).instructions;
    return executeWithPlayerSession(lazor.wallet, instructions, "passkey");
  }, [lazor.wallet]);

  const unsupportedDetachedSigning = useCallback(async <T,>(_transaction: T): Promise<T> => {
    throw new Error("LazorKit authorizes and submits transactions directly; detached signing is unavailable.");
  }, []);

  const value = useMemo<WalletContextState>(() => ({
    autoConnect: false,
    wallets: [],
    wallet: null,
    publicKey,
    connecting: lazor.isConnecting,
    connected: Boolean(publicKey && lazor.isConnected),
    disconnecting: false,
    select: () => undefined,
    connect: async () => {
      const supportError = passkeyBrowserSupportError();
      if (supportError) throw new Error(supportError);
      try {
        await lazor.connect({ feeMode: "paymaster" });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        const diagnostic = (globalThis as any).__gamesolLazorConnectDiagnostic as
          | { connectionType?: string; hasPublicKey?: boolean }
          | undefined;
        if (message.includes("invalid instruction data") && diagnostic?.hasPublicKey === false) {
          throw new Error(
            "This saved passkey did not provide the public key needed to create a wallet in this devnet universe, "
            + "and Lazor could not find a compatible wallet already linked to it. Create a new GAMESOL passkey "
            + "from the Lazor portal, or retry after configuring a reliable devnet RPC.",
          );
        }
        throw cause;
      }
    },
    disconnect: lazor.disconnect,
    sendTransaction,
    signTransaction: unsupportedDetachedSigning as WalletContextState["signTransaction"],
    signAllTransactions: (async () => {
      throw new Error("LazorKit authorizes and submits transactions directly; detached signing is unavailable.");
    }) as WalletContextState["signAllTransactions"],
    signMessage: undefined,
    signIn: undefined,
  }), [lazor, publicKey, sendTransaction, unsupportedDetachedSigning]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const WalletConnectionProvider: React.FC<PropsWithChildren> = ({ children }) => (
  <ConnectionProvider endpoint={RPC_ENDPOINT} config={{ commitment: "confirmed", wsEndpoint: RPC_WS_ENDPOINT }}>
    <LazorWalletContext>{children}</LazorWalletContext>
  </ConnectionProvider>
);

export default WalletConnectionProvider;
