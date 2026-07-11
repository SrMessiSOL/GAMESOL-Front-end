# Chained Universe Frontend

Frontend for GAMESOL, an on-chain space strategy game on Solana.

The current app is a React + TypeScript client for the `game_state` and
`market` programs in the main Chained Universe backend repository. Gameplay
uses wallet identity plus a wallet-approved in-app vault for routine actions.

## Current Features

- wallet connection with Phantom, Solflare, and mobile wallet handoff
- first-time homeworld creation
- multi-planet loading and planet switching
- resource production, storage, and energy tracking
- building, research, shipyard, and defense queues
- instant-finish actions powered by ANTIMATTER
- fleet launch and mission resolution flows
- galaxy browsing with owned and foreign planets
- espionage and battle report surfaces
- player-to-player resource and planet market
- alliance creation, join requests, treasury deposits, and leader upgrades
- quest, store, shield, and vault-management UI

## Backend Repository

The Solana programs and deployment scripts live here:

```text
https://github.com/SrMessiSOL/chained-universe
```

Program IDs and account layouts are mirrored in `src/game-state.ts` and
`src/market-client.ts`. Keep those files aligned with backend deployments.

## Tech Stack

- React 18
- TypeScript 5
- Vite 8
- Anchor client utilities
- `@solana/web3.js`
- Solana wallet adapter
- Capacitor for Android builds

## Repository Layout

- `src/App.tsx`: app shell, tabs, wallet lifecycle, vault UI, and gameplay actions
- `src/game-state.ts`: game-state account decoding, PDA derivation, and transactions
- `src/market-client.ts`: market account decoding, PDA derivation, and transactions
- `src/Markettab.tsx`: resource and planet market UI
- `src/GalaxyTab.tsx`: galaxy browser and mission launcher
- `src/GalaxyMap.tsx`: map rendering for owned and foreign planets
- `src/mobileWalletAdapter.ts`: mobile wallet bridge
- `android/`: Capacitor Android project

## Requirements

- Node.js 18 or newer
- npm
- a Solana wallet such as Phantom or Solflare

## Local Development

```bash
npm install
npm run dev
```

Default Vite URL:

```text
http://localhost:5173
```

## Production Build

```bash
npm run build
```

## Verification

Run the same production checks used by GitHub Actions:

```bash
npm ci
npm run verify
```

This compiles TypeScript, builds the production bundle, and fails on high or
critical production dependency advisories. It runs automatically on every pull
request and every push to `main`.

## Configuration Checklist

Before deploying to a new cluster, verify:

- `GAME_STATE_PROGRAM_ID`
- `MARKET_PROGRAM_ID`
- ANTIMATTER mint
- USDC mint
- treasury/admin wallet assumptions
- RPC endpoint
- Vercel environment variables

## Android

After frontend changes:

```bash
npx cap sync android
cd android
./gradlew assembleDebug
```

On Windows, use `npm.cmd` / `npx.cmd` if PowerShell blocks script shims.
