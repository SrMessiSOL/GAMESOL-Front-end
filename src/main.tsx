import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import process from "process";
import { Connection } from "@solana/web3.js";
import { DialogManager, LazorKitClient, LazorkitProvider } from "@lazorkit/wallet";
import "./index.css";
import WalletConnectionProvider from "./WalletConnectionProvider";
import { IS_SHARED_PUBLIC_RPC, RPC_ENDPOINT } from "./game-state";
import { installSolanaRpcFetchGuard } from "./rpc-fetch-guard";
import gamesolMark from "./assets/ui/logobg.png";
import "./design-system/tokens.css";

if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer;
if (!(globalThis as any).process) (globalThis as any).process = process;
installSolanaRpcFetchGuard(RPC_ENDPOINT, IS_SHARED_PUBLIC_RPC);
const DEFAULT_PAYMASTER_URL = new URL("/api/lazor-paymaster", window.location.origin).toString();

// LazorKit 2.1 embeds its portal in a cross-origin iframe on desktop. Chromium
// can reject WebAuthn in that embedded context even when portal.lazor.sh works
// correctly as a top-level page. Force the SDK's supported popup path until the
// portal ships an iframe-compatible permissions policy.
(DialogManager.prototype as unknown as { shouldUsePopup(action: string): boolean }).shouldUsePopup = () => true;

// Some passkeys created by older portal releases return the P-256 public key as
// an uncompressed point (04 || X || Y), while the current Lazor program accepts
// the SEC1 compressed form (02/03 || X). Normalize it before the SDK builds the
// on-chain create-wallet instruction. No credential or key material is logged.
const originalOpenConnect = DialogManager.prototype.openConnect;
DialogManager.prototype.openConnect = async function openCompatiblePasskey() {
  const result = await originalOpenConnect.call(this);
  (globalThis as any).__gamesolLazorConnectDiagnostic = {
    connectionType: result.connectionType,
    hasPublicKey: Boolean(result.publicKey),
  };
  console.info("[GAMESOL/Lazor] Portal connection result", {
    connectionType: result.connectionType,
    hasPublicKey: Boolean(result.publicKey),
  });
  if (!result.publicKey) {
    const credentialBytes = new Uint8Array(Buffer.from(result.credentialId, "base64"));
    const credentialHash = new Uint8Array(await crypto.subtle.digest("SHA-256", credentialBytes));
    const existingWallets = await new LazorKitClient(new Connection(RPC_ENDPOINT, "confirmed"))
      .findWalletsByAuthority(credentialHash);
    if (!existingWallets?.length) {
      throw new Error(
        "This passkey is not linked to a Lazor devnet wallet. Open the passkey flow again, cancel the saved-passkey picker, "
        + "then enter a new GAMESOL account name in the Lazor portal and choose its create/register action.",
      );
    }
    return result;
  }

  const serializedKey = result.publicKey.trim();
  const publicKeyBytes = new Uint8Array(Buffer.from(
    /^(?:[0-9a-fA-F]{2})+$/.test(serializedKey) ? serializedKey : serializedKey.replace(/^data:.*?;base64,/, ""),
    /^(?:[0-9a-fA-F]{2})+$/.test(serializedKey) ? "hex" : "base64",
  ));
  let compressed = publicKeyBytes;

  if (publicKeyBytes.length === 65 && publicKeyBytes[0] === 0x04) {
    compressed = new Uint8Array(33);
    compressed[0] = 0x02 | (publicKeyBytes[64] & 1);
    compressed.set(publicKeyBytes.subarray(1, 33), 1);
  } else if (publicKeyBytes.length === 64) {
    compressed = new Uint8Array(33);
    compressed[0] = 0x02 | (publicKeyBytes[63] & 1);
    compressed.set(publicKeyBytes.subarray(0, 32), 1);
  } else if (publicKeyBytes.length > 65 && publicKeyBytes[publicKeyBytes.length - 65] === 0x04) {
    // WebCrypto may export a DER/SPKI wrapper whose final 65 bytes are the
    // uncompressed EC point.
    const point = publicKeyBytes.subarray(publicKeyBytes.length - 65);
    compressed = new Uint8Array(33);
    compressed[0] = 0x02 | (point[64] & 1);
    compressed.set(point.subarray(1, 33), 1);
  }

  const validCompressedKey = compressed.length === 33 && (compressed[0] === 0x02 || compressed[0] === 0x03);
  (globalThis as any).__gamesolLazorConnectDiagnostic.publicKeyBytes = publicKeyBytes.length;
  if (!validCompressedKey) {
    throw new Error(
      `This saved passkey uses an unsupported public-key format (${publicKeyBytes.length} bytes). `
      + "Create a new GAMESOL passkey in the Lazor portal; your existing passkeys do not need to be deleted.",
    );
  }

  return compressed === publicKeyBytes
    ? result
    : { ...result, publicKey: Buffer.from(compressed).toString("base64") };
};

async function bootstrap() {
  const pathname = window.location.pathname;
  const { default: App } = pathname === "/app" || pathname === "/universe-game" || pathname === "/universe-lab" || pathname === "/next"
    ? await import("./UniverseGame")
    : pathname === "/sovereignty-lab"
      ? await import("./UniverseLab")
      : await import("./App");

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <LazorkitProvider
      rpcUrl={RPC_ENDPOINT}
      portalUrl={import.meta.env.VITE_LAZORKIT_PORTAL_URL || "https://portal.lazor.sh"}
      paymasterConfig={{
        paymasterUrl: import.meta.env.VITE_LAZORKIT_PAYMASTER_URL || DEFAULT_PAYMASTER_URL,
        apiKey: import.meta.env.VITE_LAZORKIT_PAYMASTER_API_KEY || undefined,
      }}
    >
      <WalletConnectionProvider>
        <App />
      </WalletConnectionProvider>
    </LazorkitProvider>
  );
}

bootstrap().catch((cause) => {
  console.error("GAMESOL startup failed", cause);
  const root = document.getElementById("root");
  if (!root) return;
  root.replaceChildren();
  const panel = document.createElement("main");
  panel.className = "gamesol-boot is-error";
  panel.setAttribute("role", "alert");
  const logo = document.createElement("img");
  logo.src = gamesolMark;
  logo.alt = "";
  const kicker = document.createElement("small");
  kicker.textContent = "COMMAND NETWORK INTERRUPTED";
  const title = document.createElement("strong");
  title.textContent = "The universe did not finish loading";
  const detail = document.createElement("p");
  detail.textContent = "Your on-chain game state is unchanged. Check your connection and try opening GAMESOL again.";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "RETRY CONNECTION";
  retry.addEventListener("click", () => window.location.reload());
  panel.append(logo, kicker, title, detail, retry);
  root.append(panel);
});
