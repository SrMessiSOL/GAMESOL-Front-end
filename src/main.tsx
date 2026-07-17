import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import process from "process";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";
import WalletConnectionProvider from "./WalletConnectionProvider";

if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer;
if (!(globalThis as any).process) (globalThis as any).process = process;

async function bootstrap() {
  const pathname = window.location.pathname;
  const { default: App } = pathname === "/app" || pathname === "/universe-game"
    ? await import("./UniverseGame")
    : pathname === "/universe-lab"
      ? await import("./UniverseLab")
      : await import("./App");

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <WalletConnectionProvider>
      <App />
    </WalletConnectionProvider>
  );
}

bootstrap();
