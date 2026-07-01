import {
  createDefaultAuthorizationCache,
  registerMwa,
} from "@solana-mobile/wallet-standard-mobile";

const PUBLIC_APP_URL = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_APP_URL
  || "https://chained-universe.vercel.app");
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const SOLANA_CLUSTER = (env.VITE_SOLANA_CLUSTER?.trim() || "devnet").toLowerCase();
const WALLET_CHAIN =
  SOLANA_CLUSTER === "mainnet" || SOLANA_CLUSTER === "mainnet-beta"
    ? "solana:mainnet"
    : "solana:devnet";

const APP_NAME = "GAMESOL";
const APP_DESCRIPTION = `On-chain space strategy on Solana ${WALLET_CHAIN === "solana:mainnet" ? "mainnet" : "devnet"}`;
const DEVNET_CHAIN = WALLET_CHAIN;
export const MOBILE_WALLET_STATUS_EVENT = "chained-universe:mobile-wallet-status";

let hasRegisteredMwa = false;

function buildAppIconUrl() {
  try {
    return new URL("/favicon.ico", PUBLIC_APP_URL).toString();
  } catch {
    return "https://chained-universe.vercel.app/favicon.ico";
  }
}

function shouldRegisterMwa() {
  if (typeof window === "undefined") return false;
  return /android/i.test(window.navigator.userAgent);
}

export function registerMobileWalletAdapter() {
  if (hasRegisteredMwa || !shouldRegisterMwa()) return;

  registerMwa({
    appIdentity: {
      name: APP_NAME,
      uri: PUBLIC_APP_URL,
      icon: buildAppIconUrl(),
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: [DEVNET_CHAIN],
    chainSelector: {
      select: async chains => chains.find(chain => chain === DEVNET_CHAIN) ?? chains[0],
    },
    onWalletNotFound: async () => {
      window.dispatchEvent(new CustomEvent(MOBILE_WALLET_STATUS_EVENT, {
        detail: {
          code: "wallet_not_found",
          message: "No Solana Mobile Wallet Adapter wallet responded on this device.",
        },
      }));
    },
  });

  hasRegisteredMwa = true;
}

export { APP_DESCRIPTION, APP_NAME, DEVNET_CHAIN, PUBLIC_APP_URL };
