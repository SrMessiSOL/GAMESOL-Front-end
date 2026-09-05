import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

const shorten = (address: string) => `${address.slice(0, 5)}…${address.slice(-5)}`;

export const WalletConnectControl: React.FC<{
  disconnectedLabel?: string;
  connectingLabel?: string;
  compactConnectingLabel?: string;
}> = ({
  disconnectedLabel = "CREATE / CONNECT PASSKEY",
  connectingLabel = "OPENING PASSKEY…",
  compactConnectingLabel,
}) => {
  const { connected, connecting, publicKey, connect, disconnect } = useWallet();
  const [error, setError] = useState("");
  if (connected && publicKey) {
    return (
      <button type="button" className="wallet-adapter-button wallet-connect-btn connected" onClick={() => void disconnect()} title={publicKey.toBase58()}>
        {shorten(publicKey.toBase58())}
      </button>
    );
  }
  const openPasskey = async () => {
    setError("");
    try {
      await connect();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open the passkey wallet.");
    }
  };
  return <div className="passkey-connect-control">
    <button
      type="button"
      className="wallet-adapter-button wallet-connect-btn"
      disabled={connecting}
      aria-label={connecting ? connectingLabel : undefined}
      onClick={() => void openPasskey()}
    >
      {connecting ? compactConnectingLabel ? <>
        <span className="passkey-label-full" aria-hidden="true">{connectingLabel}</span>
        <span className="passkey-label-compact" aria-hidden="true">{compactConnectingLabel}</span>
      </> : connectingLabel : disconnectedLabel}
    </button>
    {error && <small className="passkey-connect-error" role="alert">{error}</small>}
  </div>;
};

export default WalletConnectControl;
