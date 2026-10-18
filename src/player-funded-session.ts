import { DialogManager, LazorKitClient, Paymaster } from "@lazorkit/wallet";
import {
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { fetchUfoLookupTable } from './ufo-lookup-table';
import { fetchAllianceLookupTable } from './alliance-lookup-table';
import { fetchMarketLookupTable } from './market-lookup-table';
import { runPlanetPurchase, type PendingPlanetPurchase } from './planet-purchase-recovery';
import { serializeDeferredPayload, deserializeDeferredPayload } from './lazor-deferred-payload';
import { paymentTestPhase } from './payment-recovery-qa';
import { assertFreshPasskeyApproval } from './passkey-approval-age';
import { signWithPopupRecovery, withPreparationTimeout } from './passkey-connect-recovery';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedTokenInstruction,
  deriveAssociatedTokenAccount,
  GAME_STATE_PROGRAM_ID,
  IS_SHARED_PUBLIC_RPC,
  MARKET_PROGRAM_ID,
  RPC_ENDPOINT,
  WS_ENDPOINT,
} from "./game-state";

const SESSION_STORAGE_KEY = "lazorkit-session";
const SESSION_DURATION_SLOTS = 72_000n;
const VAULT_TARGET_LAMPORTS = 50_000_000n;
const SESSION_FEE_RESERVE_LAMPORTS = 25_000_000n;
const SESSION_MIN_BOOTSTRAP_LAMPORTS = 100_000n;
const SESSION_REFILL_TARGET_LAMPORTS = SESSION_FEE_RESERVE_LAMPORTS + SESSION_MIN_BOOTSTRAP_LAMPORTS;
const SESSION_RETURN_FEE_CUSHION_LAMPORTS = 10_000n;
const SESSION_SOL_LIFETIME_CAP = 100_000_000n;
const SESSION_SOL_PER_TX_CAP = 50_000_000n;

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const PORTAL_URL = env.VITE_LAZORKIT_PORTAL_URL?.trim() || "https://portal.lazor.sh";
const DEFAULT_PAYMASTER_URL = typeof window !== "undefined"
  ? new URL("/api/lazor-paymaster", window.location.origin).toString()
  : "https://kora.devnet.lazorkit.com";
const PAYMASTER_URL = env.VITE_LAZORKIT_PAYMASTER_URL?.trim() || DEFAULT_PAYMASTER_URL;
const PAYMASTER_API_KEY = env.VITE_LAZORKIT_PAYMASTER_API_KEY?.trim() || undefined;

export type PlayerFundedSessionState = {
  publicKey: string;
  balanceLamports: bigint;
  active: boolean;
  expiresAtSlot: bigint | null;
  sponsored: boolean;
  sponsorPayer: string;
};

type StoredPlayerSession = {
  secretKey: number[];
  publicKey: string;
  walletPda: string;
  sessionPda?: string;
  expiresAt?: string;
  active?: boolean;
  fundingMode?: "player" | "sponsored";
  sponsoredBootstrapComplete?: boolean;
  allowedPrograms?: string[];
};

type LazorWalletInfo = {
  credentialId: string;
  smartWallet: string;
  vaultPda?: string;
};

type CachedPasskeyResolution = {
  expiresAtMs: number;
  walletPda: PublicKey;
  authorityPda: PublicKey;
  credentialIdHash: Uint8Array;
  publicKeyBytes: Uint8Array;
};

const PASSKEY_RESOLUTION_CACHE_MS = 5 * 60_000;
const passkeyResolutionCache = new Map<string, CachedPasskeyResolution>();
type LatestBlockhash = Awaited<ReturnType<Connection["getLatestBlockhash"]>>;
type CachedLatestBlockhash = { value: LatestBlockhash; expiresAtMs: number };
const BLOCKHASH_CACHE_MS = 20_000;
let sharedRpc: Connection | null = null;
let sharedLazorClient: LazorKitClient | null = null;
let sharedPaymaster: Paymaster | null = null;
let cachedSponsorPayer: PublicKey | null = null;
let cachedLatestBlockhash: CachedLatestBlockhash | null = null;
let blockhashRequest: Promise<LatestBlockhash> | null = null;

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function withRateLimitBackoff<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/\b429\b|rate limit|too many requests/i.test(message) || attempt === attempts - 1) throw error;
      await waitMs(700 * (2 ** attempt));
    }
  }
  throw new Error("The test network is temporarily busy. Wait a moment and try again.");
}

function sessionStorageKey(walletPda: string): string {
  return `gamesol:quick-play:v2:${GAME_STATE_PROGRAM_ID.toBase58()}:${MARKET_PROGRAM_ID.toBase58()}:${walletPda}`;
}

function readStoredSession(walletPda: string): StoredPlayerSession | null {
  try {
    const key = sessionStorageKey(walletPda);
    const current = window.localStorage.getItem(key);
    const raw = current ?? window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPlayerSession;
    if (!Array.isArray(parsed.secretKey) || typeof parsed.publicKey !== "string" || parsed.walletPda !== walletPda) {
      return null;
    }
    keypairFromStored(parsed);
    if (current === null) window.localStorage.setItem(key, JSON.stringify(parsed));
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredPlayerSession): void {
  window.localStorage.setItem(sessionStorageKey(session.walletPda), JSON.stringify(session));
}

function keypairFromStored(session: StoredPlayerSession): Keypair {
  const keypair = Keypair.fromSecretKey(new Uint8Array(session.secretKey));
  if (keypair.publicKey.toBase58() !== session.publicKey) {
    throw new Error("We couldn't use the saved game access on this device. Sign out, reconnect, and try again.");
  }
  return keypair;
}

function requiredSessionPrograms(): string[] {
  return [GAME_STATE_PROGRAM_ID.toBase58(), MARKET_PROGRAM_ID.toBase58()];
}

function sessionPolicyMatchesCurrentUniverse(session: StoredPlayerSession): boolean {
  const allowed = new Set(session.allowedPrograms ?? []);
  return requiredSessionPrograms().every((program) => allowed.has(program));
}

export function ensurePlayerFeeSession(walletPda: string): StoredPlayerSession {
  const existing = readStoredSession(walletPda);
  if (existing?.walletPda === walletPda) {
    keypairFromStored(existing);
    return existing;
  }

  const keypair = Keypair.generate();
  const created: StoredPlayerSession = {
    secretKey: Array.from(keypair.secretKey),
    publicKey: keypair.publicKey.toBase58(),
    walletPda,
    active: false,
    fundingMode: "player",
  };
  writeStoredSession(created);
  return created;
}

export function hasPlayerFundedSession(walletPda: string): boolean {
  const stored = readStoredSession(walletPda);
  return Boolean(
    stored
    && (!walletPda || stored.walletPda === walletPda)
    && stored.sessionPda
    && (stored.active ?? true)
    && sessionPolicyMatchesCurrentUniverse(stored)
  );
}

export function playerSessionFundingRequired(vaultBalanceLamports: bigint): bigint {
  const vaultShortfall = vaultBalanceLamports >= VAULT_TARGET_LAMPORTS
    ? 0n
    : VAULT_TARGET_LAMPORTS - vaultBalanceLamports;
  return vaultShortfall + SESSION_FEE_RESERVE_LAMPORTS;
}

export function playerVaultFeeSurplus(vaultBalanceLamports: bigint): bigint {
  return vaultBalanceLamports > VAULT_TARGET_LAMPORTS
    ? vaultBalanceLamports - VAULT_TARGET_LAMPORTS
    : 0n;
}

function connection(): Connection {
  if (!sharedRpc) {
    sharedRpc = new Connection(RPC_ENDPOINT, {
      commitment: "confirmed",
      ...(WS_ENDPOINT ? { wsEndpoint: WS_ENDPOINT } : {}),
    });
    // Most players spend time reading the UI before their first command. Use
    // that idle time to prepare the blockhash needed for immediate submission.
    if (!IS_SHARED_PUBLIC_RPC) void warmLatestBlockhash(sharedRpc).catch(() => undefined);
  }
  return sharedRpc;
}

function lazorClient(rpc: Connection): LazorKitClient {
  if (!sharedLazorClient) sharedLazorClient = new LazorKitClient(rpc);
  return sharedLazorClient;
}

async function freshPasskeySlot(rpc: Connection): Promise<bigint> {
  // Lazor accepts WebAuthn proofs for only 150 slots. Use the freshest bank
  // available and leave a tiny cushion for RPC nodes that are a few slots
  // ahead of the validator that simulates the sponsored transaction.
  const slot = BigInt(await withPreparationTimeout(rpc.getSlot("processed")));
  return slot > 4n ? slot - 4n : slot;
}

function paymasterClient(): Paymaster {
  if (!sharedPaymaster) {
    sharedPaymaster = new Paymaster({
      paymasterUrl: PAYMASTER_URL,
      ...(PAYMASTER_API_KEY ? { apiKey: PAYMASTER_API_KEY } : {}),
    });
  }
  return sharedPaymaster;
}

export async function getSponsorPayer(): Promise<PublicKey> {
  if (!cachedSponsorPayer) cachedSponsorPayer = await paymasterClient().getPayer();
  return cachedSponsorPayer;
}

function warmLatestBlockhash(rpc: Connection, force = false): Promise<LatestBlockhash> {
  if (!force && cachedLatestBlockhash && cachedLatestBlockhash.expiresAtMs > Date.now()) {
    return Promise.resolve(cachedLatestBlockhash.value);
  }
  if (!force && blockhashRequest) return blockhashRequest;
  if (force) cachedLatestBlockhash = null;
  const request = withRateLimitBackoff(() => rpc.getLatestBlockhash("confirmed")).then((value) => {
    cachedLatestBlockhash = { value, expiresAtMs: Date.now() + BLOCKHASH_CACHE_MS };
    return value;
  }).finally(() => {
    if (blockhashRequest === request) blockhashRequest = null;
  });
  blockhashRequest = request;
  return request;
}

async function takeLatestBlockhash(rpc: Connection, force = false): Promise<LatestBlockhash> {
  const latest = await warmLatestBlockhash(rpc, force);
  if (cachedLatestBlockhash?.value.blockhash === latest.blockhash) cachedLatestBlockhash = null;
  // Consume the prepared entry and warm the next lookup while this transaction
  // is being signed or submitted.
  if (!IS_SHARED_PUBLIC_RPC) void warmLatestBlockhash(rpc).catch(() => undefined);
  return latest;
}

async function sendDirect(
  rpc: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
  initialLatest?: Awaited<ReturnType<Connection["getLatestBlockhash"]>>,
): Promise<string> {
  const maxBlockhashAttempts = 2;

  for (let attempt = 0; attempt < maxBlockhashAttempts; attempt += 1) {
    const latest = attempt === 0 && initialLatest
      ? initialLatest
      : await takeLatestBlockhash(rpc, attempt > 0);
    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: latest.blockhash,
      instructions,
    }).compileToV0Message();
    const transaction = new VersionedTransaction(message);
    transaction.sign([payer]);
    const signature = await withRateLimitBackoff(() => rpc.sendRawTransaction(transaction.serialize(), {
      // These instructions are built from already-validated game state. Skipping
      // the duplicate simulation removes a full devnet round trip; the landed
      // transaction status below still reports program errors and never marks
      // an unconfirmed transaction as successful.
      skipPreflight: true,
      maxRetries: 5,
    }));

    try {
      // Race the fastest path (the websocket notification) against polling so
      // either transport can confirm the transaction without depending on the
      // reliability of the other one.
      const websocketConfirmation = rpc.confirmTransaction({
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }, "confirmed").then((result) => {
        if (result.value.err) {
          throw new Error(`Player-funded transaction failed: ${JSON.stringify(result.value.err)}`);
        }
        return signature;
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("Player-funded transaction failed:")) throw error;
        // A disconnected websocket must not fail a transaction that RPC polling
        // can still verify.
        return new Promise<string>(() => undefined);
      });

      const confirmationDeadline = Date.now() + 20_000;
      const pollingConfirmation = (async (): Promise<string> => {
        let lastStatus: Awaited<ReturnType<Connection["getSignatureStatuses"]>>["value"][number] = null;
        await waitMs(IS_SHARED_PUBLIC_RPC ? 1_800 : 350);
        while (Date.now() < confirmationDeadline) {
          // A freshly submitted signature is in the recent-status cache. Avoid
          // the slower historical ledger search during the normal fast path.
          lastStatus = (await withRateLimitBackoff(() => rpc.getSignatureStatuses([signature]))).value[0];
          if (lastStatus?.err) {
            throw new Error(`Player-funded transaction failed: ${JSON.stringify(lastStatus.err)}`);
          }
          if (lastStatus?.confirmationStatus === "confirmed" || lastStatus?.confirmationStatus === "finalized") {
            return signature;
          }
          await waitMs(IS_SHARED_PUBLIC_RPC ? 1_500 : 400);
        }
        // Use the historical lookup once, only as a fallback for an RPC node
        // whose recent-status cache missed the transaction.
        const finalStatus = (await withRateLimitBackoff(() => rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }))).value[0];
        if (
          finalStatus
          && !finalStatus.err
          && (finalStatus.confirmationStatus === "confirmed" || finalStatus.confirmationStatus === "finalized")
        ) {
          return signature;
        }
        const currentBlockHeight = await rpc.getBlockHeight("confirmed");
        if (currentBlockHeight <= latest.lastValidBlockHeight) {
          throw new Error("The transaction was submitted, but devnet confirmation is delayed. Check the balance before retrying.");
        }
        throw new Error("The transaction blockhash expired before devnet confirmed it.");
      })();

      return await Promise.race([websocketConfirmation, pollingConfirmation]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const blockhashExpired = /block height exceeded|blockheight exceeded|blockhash not found|expired/i.test(message);
      if (!blockhashExpired) throw error;

      // A lagging devnet RPC can miss confirmation until the transaction's
      // blockhash expires. Check history before rebuilding so an already-landed
      // command is never submitted twice.
      const status = (await withRateLimitBackoff(() => rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }))).value[0];
      if (status) {
        if (status.err) {
          throw new Error(`Player-funded transaction failed: ${JSON.stringify(status.err)}`);
        }
        return signature;
      }
      if (attempt === maxBlockhashAttempts - 1) {
        throw new Error("The test network is busy. Nothing was moved. Wait a moment, refresh, and try again.");
      }
    }
  }

  throw new Error("The player-funded transaction could not be submitted.");
}

async function sendSponsored(
  rpc: Connection,
  instructions: TransactionInstruction[],
  signers: Keypair[] = [],
  initialLatest?: LatestBlockhash,
  compressStore: boolean | 'alliance' | 'market' = false,
  options?: { deferredExecution?: VersionedTransaction; submitted?: (signature: string) => void },
): Promise<string> {
  const [payer, latest] = await Promise.all([
    getSponsorPayer(),
    initialLatest ? Promise.resolve(initialLatest) : takeLatestBlockhash(rpc),
  ]);
  const lookupTables = compressStore === 'market' ? [await fetchMarketLookupTable(rpc, payer)]
    : compressStore === 'alliance' ? [await fetchAllianceLookupTable(rpc, payer)]
    : compressStore || instructions.some(instruction => instruction.programId.equals(Ed25519Program.programId))
    ? [await fetchUfoLookupTable(rpc, payer)] : [];
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: latest.blockhash,
    instructions,
  }).compileToV0Message(lookupTables);
  const transaction = new VersionedTransaction(message);
  let bytes: number;
  try { bytes = transaction.serialize().length; }
  catch { throw new Error('This command exceeds the Solana transaction size limit. No command was submitted.'); }
  if (bytes > 1232) throw new Error(`This command is too large (${bytes}/1232 bytes). No command was submitted.`);
  if (signers.length > 0) transaction.sign(signers);

  let signature: string;
  try {
    // Policy errors cannot recover by resubmitting the same transaction. Keep
    // the UI responsive and surface the exact sponsor blocker immediately.
    if (options?.deferredExecution) {
      const response = await fetch(PAYMASTER_URL, {
        method: 'POST', headers: {'Content-Type': 'application/json', ...(PAYMASTER_API_KEY ? {'x-api-key': PAYMASTER_API_KEY} : {})},
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'signAndSendTransaction', params: {
          transaction: Buffer.from(transaction.serialize()).toString('base64'), signer_key: payer.toBase58(),
          deferred_execution: Buffer.from(options.deferredExecution.serialize()).toString('base64'),
        }}),
      });
      const result = await response.json();
      if (!response.ok || result.error || typeof result.result?.signature !== 'string') {
        throw Object.assign(new Error(result.error?.message || 'Purchase authorization was not submitted.'),
          {purchaseNotSubmitted: result.error?.data?.submissionAttempted === false});
      }
      signature = result.result.signature;
    } else {
      signature = await paymasterClient().signAndSendVersionedTransaction(transaction, 1);
    }
  } catch (error) {
    if (error instanceof Error && 'purchaseNotSubmitted' in error && error.purchaseNotSubmitted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/allowed list|allowlist|not allowed/i.test(message)) {
      const rejectedProgram = message.match(/Program\s+([1-9A-HJ-NP-Za-km-z]{32,44})/i)?.[1];
      throw new Error(
        rejectedProgram
          ? `The GAMESOL devnet sponsor rejected required program ${rejectedProgram}.`
          : `The GAMESOL devnet sponsor rejected this transaction: ${message}`,
      );
    }
    throw new Error(`Sponsored transaction failed: ${message}`);
  }

  options?.submitted?.(signature);
  const deadline = Date.now() + 24_000;
  while (Date.now() < deadline) {
    const status = (await withRateLimitBackoff(() => rpc.getSignatureStatuses([signature]))).value[0];
    if (status?.err) throw new Error(`Sponsored transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return signature;
    }
    await waitMs(IS_SHARED_PUBLIC_RPC ? 1_500 : 450);
  }
  throw new Error("The sponsored command was submitted, but devnet confirmation is delayed. Check the game state before retrying.");
}

async function credentialHash(credentialId: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(Buffer.from(credentialId, "base64"));
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

async function resolvePasskeyWallet(rpc: Connection, wallet: LazorWalletInfo) {
  const client = lazorClient(rpc);
  const cacheKey = `${wallet.smartWallet}:${wallet.credentialId}`;
  const cached = passkeyResolutionCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now()) {
    return { client, ...cached };
  }
  const credentialIdHash = await credentialHash(wallet.credentialId);
  const matches = await client.findWalletsByAuthority(credentialIdHash, "secp256r1");
  if (matches.length === 0) throw new Error("We couldn't find your game account. Sign out, reconnect, and try again.");
  const match = matches.find((candidate) => candidate.walletPda.toBase58() === wallet.smartWallet) ?? matches[0];
  const account = await rpc.getAccountInfo(match.authorityPda, "confirmed");
  if (!account || account.data.length < 113 || account.data[0] !== 2 || account.data[1] !== 1) {
    throw new Error("This game account could not be opened. Sign out, reconnect, and try again.");
  }
  const resolved: CachedPasskeyResolution = {
    expiresAtMs: Date.now() + PASSKEY_RESOLUTION_CACHE_MS,
    walletPda: match.walletPda,
    authorityPda: match.authorityPda,
    credentialIdHash,
    publicKeyBytes: new Uint8Array(account.data.slice(80, 113)),
  };
  passkeyResolutionCache.set(cacheKey, resolved);
  return { client, ...resolved };
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function decodeSignResult(result: {
  signature: string;
  authenticatorDataBase64: string;
  clientDataJsonBase64: string;
}) {
  const clientDataJson = new Uint8Array(Buffer.from(result.clientDataJsonBase64, "base64"));
  return {
    signature: new Uint8Array(Buffer.from(result.signature, "base64")),
    authenticatorData: new Uint8Array(Buffer.from(result.authenticatorDataBase64, "base64")),
    clientDataJson,
    clientDataJsonHash: new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", clientDataJson)),
  };
}

async function requestPasskeySignature(
  challenge: Uint8Array,
  credentialId: string,
  displayTransaction = "",
) {
  const dialog = new DialogManager({ portalUrl: PORTAL_URL, rpcUrl: RPC_ENDPOINT });
  try {
    const result = await signWithPopupRecovery(dialog, () => dialog.openSign(toBase64Url(challenge), displayTransaction, credentialId, "devnet"));
    return decodeSignResult(result);
  } finally {
    dialog.destroy();
  }
}

async function buildDisplayTransaction(
  rpc: Connection,
  payer: PublicKey,
  instructions: TransactionInstruction[],
  recentBlockhash?: string,
): Promise<string> {
  const blockhash = recentBlockhash ?? (await takeLatestBlockhash(rpc)).blockhash;
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions })
    .compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
}

function sessionExpiry(accountData: Uint8Array): bigint | null {
  if (accountData.length < 80) return null;
  const view = new DataView(accountData.buffer, accountData.byteOffset, accountData.byteLength);
  return view.getBigUint64(72, true);
}

export async function refreshPlayerFundedSession(walletPda: string, retry = 0): Promise<PlayerFundedSessionState> {
  const stored = ensurePlayerFeeSession(walletPda);
  const rpc = connection();
  const sponsorPayer = await getSponsorPayer();
  let active = false;
  let expiresAtSlot: bigint | null = stored.expiresAt ? BigInt(stored.expiresAt) : null;

  if (stored.sessionPda) {
    const [account, slot] = await Promise.all([
      rpc.getAccountInfo(new PublicKey(stored.sessionPda), "confirmed"),
      rpc.getSlot("confirmed"),
    ]);
    expiresAtSlot = account ? sessionExpiry(account.data) : expiresAtSlot;
    active = Boolean(
      account
      && expiresAtSlot
      && expiresAtSlot > BigInt(slot)
      && sessionPolicyMatchesCurrentUniverse(stored),
    );
  }

  // Activation/revocation can finish while this RPC read is pending. Never
  // overwrite the newer session with the snapshot taken before the request.
  const current = readStoredSession(walletPda);
  if (current?.walletPda !== walletPda) throw new Error("Your game account changed while checking Quick Play. Please retry.");
  if (JSON.stringify(current) !== JSON.stringify(stored)) {
    if (retry >= 2) throw new Error("Quick Play changed while checking its status. Please retry.");
    return refreshPlayerFundedSession(walletPda, retry + 1);
  }
  if (stored.active !== active || (expiresAtSlot && stored.expiresAt !== expiresAtSlot.toString())) {
    writeStoredSession({ ...stored, active, expiresAt: expiresAtSlot?.toString() });
  }
  return {
    publicKey: stored.publicKey,
    balanceLamports: 0n,
    active,
    expiresAtSlot,
    sponsored: true,
    sponsorPayer: sponsorPayer.toBase58(),
  };
}

async function topUpVaultFromSession(
  rpc: Connection,
  sessionKeypair: Keypair,
  vaultPda: PublicKey,
): Promise<void> {
  const vaultBalance = BigInt(await rpc.getBalance(vaultPda, "confirmed"));
  if (vaultBalance >= VAULT_TARGET_LAMPORTS) return;
  const shortfall = VAULT_TARGET_LAMPORTS - vaultBalance;
  await sendDirect(rpc, sessionKeypair, [SystemProgram.transfer({
    fromPubkey: sessionKeypair.publicKey,
    toPubkey: vaultPda,
    lamports: Number(shortfall),
  })]);
}

async function revokeStoredSession(
  rpc: Connection,
  wallet: LazorWalletInfo,
  stored: StoredPlayerSession,
  _sessionKeypair: Keypair,
): Promise<void> {
  if (!stored.sessionPda) return;
  const sessionPda = new PublicKey(stored.sessionPda);
  if (!(await withPreparationTimeout(rpc.getAccountInfo(sessionPda, "confirmed")))) return;
  const [resolved, sponsorPayer] = await withPreparationTimeout(Promise.all([
    resolvePasskeyWallet(rpc, wallet),
    getSponsorPayer(),
  ]));
  const signatureSlot = await freshPasskeySlot(rpc);
  const prepared = await withPreparationTimeout(resolved.client.prepareRevokeSession({
    payer: sponsorPayer,
    walletPda: resolved.walletPda,
    secp256r1: {
      credentialIdHash: resolved.credentialIdHash,
      publicKeyBytes: resolved.publicKeyBytes,
      authorityPda: resolved.authorityPda,
      slotOverride: signatureSlot,
    },
    sessionPda,
    refundDestination: sponsorPayer,
  }));
  const response = await requestPasskeySignature(prepared.challenge, wallet.credentialId);
  const { instructions } = resolved.client.finalizeRevokeSession(prepared, response);
  await sendSponsored(rpc, instructions);
}

export async function activatePlayerFundedSession(wallet: LazorWalletInfo): Promise<PlayerFundedSessionState> {
  if (!wallet.vaultPda) throw new Error("Your game account is still loading. Reconnect and try again.");
  let stored = ensurePlayerFeeSession(wallet.smartWallet);
  let sessionKeypair = keypairFromStored(stored);
  const rpc = connection();
  const [resolved, currentSlotRaw, sponsorPayer] = await withPreparationTimeout(Promise.all([
    resolvePasskeyWallet(rpc, wallet),
    rpc.getSlot("confirmed"),
    getSponsorPayer(),
  ]));
  const currentSlot = BigInt(currentSlotRaw);

  if (stored.sessionPda) {
    const existing = await withPreparationTimeout(rpc.getAccountInfo(new PublicKey(stored.sessionPda), "confirmed"));
    const existingExpiry = existing ? sessionExpiry(existing.data) : null;
    if (
      existing
      && existingExpiry
      && existingExpiry > currentSlot
      && sessionPolicyMatchesCurrentUniverse(stored)
    ) {
      const next = { ...stored, active: true, expiresAt: existingExpiry.toString(), fundingMode: "sponsored" as const };
      writeStoredSession(next);
      return withPreparationTimeout(refreshPlayerFundedSession(wallet.smartWallet));
    }
    if (existing && sessionPolicyMatchesCurrentUniverse(stored)) {
      await revokeStoredSession(rpc, wallet, stored, sessionKeypair);
    } else if (existing) {
      // Sessions are immutable. When a deployment moves to a different game
      // program, rotate the browser key and create a new scoped session with a
      // single passkey approval. The old key is discarded locally and its
      // on-chain permission expires naturally.
      sessionKeypair = Keypair.generate();
      stored = {
        secretKey: Array.from(sessionKeypair.secretKey),
        publicKey: sessionKeypair.publicKey.toBase58(),
        walletPda: wallet.smartWallet,
        active: false,
        fundingMode: "sponsored",
      };
      writeStoredSession(stored);
    }
  }

  const expiresAt = currentSlot + SESSION_DURATION_SLOTS;
  const actions = [
    { type: 1, remaining: SESSION_SOL_LIFETIME_CAP },
    { type: 3, max: SESSION_SOL_PER_TX_CAP },
    { type: 10, programId: GAME_STATE_PROGRAM_ID },
    { type: 10, programId: MARKET_PROGRAM_ID },
  ];
  const signatureSlot = await freshPasskeySlot(rpc);
  const prepared = await withPreparationTimeout(resolved.client.prepareCreateSession({
    payer: sponsorPayer,
    walletPda: resolved.walletPda,
    secp256r1: {
      credentialIdHash: resolved.credentialIdHash,
      publicKeyBytes: resolved.publicKeyBytes,
      authorityPda: resolved.authorityPda,
      slotOverride: signatureSlot,
    },
    sessionKey: sessionKeypair.publicKey,
    expiresAt,
    actions: actions as never,
  }));
  const response = await requestPasskeySignature(prepared.challenge, wallet.credentialId);
  const { instructions, sessionPda } = resolved.client.finalizeCreateSession(prepared, response);
  // Session creation is authorized by the passkey proof embedded by Lazor.
  // The new session public key is registered as data here; it only becomes a
  // transaction signer later when it executes an approved gameplay command.
  await sendSponsored(rpc, instructions);

  writeStoredSession({
    ...stored,
    sessionPda: sessionPda.toBase58(),
    expiresAt: expiresAt.toString(),
    active: true,
    fundingMode: "sponsored",
    allowedPrograms: requiredSessionPrograms(),
  });
  return withPreparationTimeout(refreshPlayerFundedSession(wallet.smartWallet), 'Quick Play approval was submitted, but its status check timed out. Select Check Sponsor before trying again.');
}

export async function executeWithPlayerSession(
  wallet: LazorWalletInfo,
  instructions: TransactionInstruction[],
  authorization: "session" | "passkey",
): Promise<string> {
  if (authorization === "session") {
    const state = await refreshPlayerFundedSession(wallet.smartWallet);
    if (!state.active) {
      throw new Error("Quick Play session expired. Turn it on again before continuing. No command was submitted.");
    }
  }
  // Signature precompiles must execute at the transaction level, never as CPIs.
  const precompiles = instructions.filter(instruction => instruction.programId.equals(Ed25519Program.programId));
  instructions = instructions.filter(instruction => !instruction.programId.equals(Ed25519Program.programId));
  const stored = readStoredSession(wallet.smartWallet);
  if (!stored || stored.walletPda !== wallet.smartWallet) {
    throw new Error("This device is not ready to submit account actions. Sign out, reconnect, and try again.");
  }
  if (authorization === "session" && (!stored.sessionPda || !(stored.active ?? true))) {
    throw new Error("Quick Play is off. Turn it on with your passkey first.");
  }
  const sessionKeypair = keypairFromStored(stored);
  const rpc = connection();
  const client = lazorClient(rpc);
  const walletPda = new PublicKey(stored.walletPda);
  const sponsorPayer = await getSponsorPayer();

  if (authorization === "session") {
    const [{ instructions: wrapped }, latest] = await Promise.all([
      client.execute({
        payer: sponsorPayer,
        walletPda,
        signer: {
          type: "session",
          sessionPda: new PublicKey(stored.sessionPda!),
          sessionKeyPubkey: sessionKeypair.publicKey,
        },
        instructions,
      }),
      takeLatestBlockhash(rpc),
    ]);
    return sendSponsored(rpc, [...precompiles, ...wrapped], [sessionKeypair], latest);
  }

  const [resolved, displayBlockhash] = await Promise.all([
    resolvePasskeyWallet(rpc, wallet),
    takeLatestBlockhash(rpc),
  ]);
  const signatureSlot = await freshPasskeySlot(rpc);
  if (isPlanetPurchaseBundle(instructions)) {
    const testPause = env.VITE_DEVNET_PAYMENT_QA === '1' && typeof window !== 'undefined'
      ? paymentTestPhase(env.VITE_DEVNET_PAYMENT_QA, window.location.hostname, window.location.search, await rpc.getGenesisHash()) : null;
    const intent = JSON.stringify(instructions.slice(-1).map(ix => ({program: ix.programId.toBase58(),
      accounts: ix.keys.map(key => key.pubkey.toBase58()), data: Array.from(ix.data)})));
    const storageKey = `gamesol:planet-purchase:devnet:${wallet.smartWallet}`;
    const table = await fetchMarketLookupTable(rpc, sponsorPayer);
    let authorization: TransactionInstruction[] | null = null;
    let approvalSlot: bigint | null = null;
    const execution = async (record: PendingPlanetPurchase) => resolved.client.executeDeferredFromPayload({
      payer: sponsorPayer, deferredPayload: deserializeDeferredPayload(record.payload, wallet.smartWallet), refundDestination: sponsorPayer,
    });
    return runPlanetPurchase(wallet.smartWallet, intent, {
      load: () => { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) as PendingPlanetPurchase : null; },
      save: record => { if (record) localStorage.setItem(storageKey, JSON.stringify(record)); else localStorage.removeItem(storageKey); },
      prepare: async () => {
        const display = await buildDisplayTransaction(rpc, sponsorPayer, instructions, displayBlockhash.blockhash);
        approvalSlot = await freshPasskeySlot(rpc);
        const prepared = await resolved.client.authorizePrepare({payer: sponsorPayer, walletPda,
          authorityPda: resolved.authorityPda, publicKeyBytes: resolved.publicKeyBytes,
          instructions, expiryOffset: 300, slotOverride: approvalSlot});
        const response = await requestPasskeySignature(prepared.challenge, wallet.credentialId, display);
        assertFreshPasskeyApproval(approvalSlot, BigInt(await withPreparationTimeout(rpc.getSlot('processed'))));
        authorization = prepared.finalize(response).instructions;
        return {version: 1, wallet: wallet.smartWallet, intent, createdAt: Date.now(), payload: serializeDeferredPayload(prepared.deferredPayload)};
      },
      authorize: async (record, submitted) => {
        if (!authorization) throw new Error('Purchase approval is missing.');
        const {instructions: execute} = await execution(record);
        const intentTransaction = new VersionedTransaction(new TransactionMessage({payerKey: sponsorPayer,
          recentBlockhash: (await rpc.getLatestBlockhash('confirmed')).blockhash, instructions: execute}).compileToV0Message([table]));
        if (intentTransaction.serialize().length > 1232) throw new Error('Purchase exceeds the transaction limit. No authorization was submitted.');
        if (approvalSlot === null) throw new Error('Purchase approval is missing.');
        assertFreshPasskeyApproval(approvalSlot, BigInt(await withPreparationTimeout(rpc.getSlot('processed'))));
        await sendSponsored(rpc, authorization, [], undefined, false, {deferredExecution: intentTransaction, submitted});
        if (testPause === 'approval') throw new Error('Devnet recovery test paused after confirmed approval. No purchase payment was submitted.');
      },
      execute: async (record, submitted) => {
        const {instructions: execute} = await execution(record);
        return sendSponsored(rpc, execute, [], undefined, 'market', {submitted: signature => {
          submitted(signature);
          if (testPause === 'execution') throw new Error('Devnet recovery test paused after payment submission. Reconcile the saved signature before retrying.');
        }});
      },
      exists: async record => {
        const payload = deserializeDeferredPayload(record.payload, wallet.smartWallet);
        const account = await rpc.getAccountInfo(payload.deferredExecPda, 'confirmed');
        if (account && !account.owner.equals(resolved.client.programId)) throw new Error('Purchase approval account failed verification.');
        return Boolean(account);
      },
      status: async signature => {
        const status = (await rpc.getSignatureStatuses([signature], {searchTransactionHistory: true})).value[0];
        return status?.err ? 'failed' : status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized' ? 'confirmed' : 'pending';
      },
      reclaim: async record => {
        const payload = deserializeDeferredPayload(record.payload, wallet.smartWallet);
        const {instructions: reclaim} = resolved.client.reclaimDeferred({payer: sponsorPayer, deferredExecPda: payload.deferredExecPda, refundDestination: sponsorPayer});
        await sendSponsored(rpc, reclaim);
      },
    });
  }
  const prepared = await resolved.client.prepareExecute({
    payer: sponsorPayer,
    walletPda,
    secp256r1: {
      credentialIdHash: resolved.credentialIdHash,
      publicKeyBytes: resolved.publicKeyBytes,
      authorityPda: resolved.authorityPda,
      slotOverride: signatureSlot,
    },
    instructions,
  });
  const displayTransaction = await buildDisplayTransaction(rpc, sponsorPayer, instructions, displayBlockhash.blockhash);
  const response = await requestPasskeySignature(prepared.challenge, wallet.credentialId, displayTransaction);
  const { instructions: wrapped } = resolved.client.finalizeExecute(prepared, response);
  // Passkey approval can outlive the display transaction's blockhash.
  const submissionBlockhash = await withRateLimitBackoff(() => rpc.getLatestBlockhash('confirmed'));
  return sendSponsored(rpc, [...precompiles, ...wrapped], [], submissionBlockhash,
    isMarketPurchaseBundle(instructions) ? 'market' : isAllianceCreationBundle(instructions) || isAllianceDepositBundle(instructions) ? 'alliance' : isStorePurchaseBundle(instructions) || isMarketListingBundle(instructions));
}

function isAllianceDepositBundle(instructions: TransactionInstruction[]): boolean {
  const deposit = instructions[0];
  return instructions.length === 1 && deposit.programId.equals(GAME_STATE_PROGRAM_ID)
    && deposit.keys.length === 11 && deposit.data.length === 42
    && deposit.data.subarray(0, 8).equals(Buffer.from([64, 70, 103, 74, 35, 162, 164, 162]))
    && (deposit.data[8] === 1 || deposit.data[8] === 2) && deposit.data[9] === 3
    && deposit.data.subarray(10, 34).equals(Buffer.alloc(24))
    && deposit.data.readBigUInt64LE(34) === (deposit.data[8] === 1 ? 100_000_000n : 1_000_000_000n);
}

function isMarketPurchaseBundle(instructions: TransactionInstruction[]): boolean {
  const purchase = instructions[instructions.length - 1];
  if (!purchase || instructions.length > 3 || !purchase.programId.equals(MARKET_PROGRAM_ID)
    || purchase.data.length !== 8
    || !((purchase.keys.length === 17 && purchase.data.equals(Buffer.from([227, 82, 234, 131, 1, 18, 48, 2])))
      || (purchase.keys.length === 21 && purchase.data.equals(Buffer.from([48, 116, 122, 166, 251, 1, 167, 31]))))) return false;
  return instructions.slice(0, -1).every(ix =>
    (ix.programId.equals(GAME_STATE_PROGRAM_ID) && ix.keys.length === 3 && ix.data.length === 16
      && ix.data.subarray(0, 8).equals(Buffer.from([87, 113, 100, 97, 218, 156, 201, 21])))
    || (ix.programId.toBase58() === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' && ix.keys.length === 6 && ix.data.length === 0));
}

function isPlanetPurchaseBundle(instructions: TransactionInstruction[]): boolean {
  return isMarketPurchaseBundle(instructions) && instructions[instructions.length - 1]?.keys.length === 21;
}

function isMarketListingBundle(instructions: TransactionInstruction[]): boolean {
  const create = instructions[instructions.length - 1];
  if (!create || instructions.length > 2 || !create.programId.equals(MARKET_PROGRAM_ID)
    || !((create.keys.length === 9 && create.data.length === 25
      && create.data.subarray(0, 8).equals(Buffer.from([237, 233, 192, 168, 248, 7, 249, 241])))
      || (create.keys.length === 10 && create.data.length === 16
        && create.data.subarray(0, 8).equals(Buffer.from([168, 189, 82, 35, 166, 138, 116, 61]))))) return false;
  if (instructions.length === 1) return true;
  const rent = instructions[0];
  return rent.programId.equals(GAME_STATE_PROGRAM_ID) && rent.keys.length === 3 && rent.data.length === 16
    && rent.data.subarray(0, 8).equals(Buffer.from([87, 113, 100, 97, 218, 156, 201, 21]));
}

function isAllianceCreationBundle(instructions: TransactionInstruction[]): boolean {
  const create = instructions[instructions.length - 1];
  if (!create || instructions.length > 2 || !create.programId.equals(GAME_STATE_PROGRAM_ID)
    || create.keys.length !== 15 || create.data.length < 23 || create.data.length > 215
    || !create.data.subarray(0, 8).equals(Buffer.from([201, 92, 183, 64, 131, 82, 174, 203]))) return false;
  if (instructions.length === 1) return true;
  const rent = instructions[0];
  return rent.programId.equals(GAME_STATE_PROGRAM_ID) && rent.keys.length === 3 && rent.data.length === 16
    && rent.data.subarray(0, 8).equals(Buffer.from([87, 113, 100, 97, 218, 156, 201, 21]));
}

function isStorePurchaseBundle(instructions: TransactionInstruction[]): boolean {
  const purchase = instructions[instructions.length - 1];
  if (!purchase || instructions.length > 2 || !purchase.programId.equals(GAME_STATE_PROGRAM_ID)
    || purchase.keys.length !== 11 || purchase.data.length !== 10
    || !purchase.data.subarray(0, 8).equals(Buffer.from([112, 75, 157, 242, 238, 109, 2, 252]))) return false;
  if (instructions.length === 1) return true;
  const rent = instructions[0];
  return rent.programId.equals(GAME_STATE_PROGRAM_ID) && rent.keys.length === 3 && rent.data.length === 16
    && rent.data.subarray(0, 8).equals(Buffer.from([87, 113, 100, 97, 218, 156, 201, 21]));
}

export async function fundPlayerFeeFromVault(
  wallet: LazorWalletInfo,
  sponsoredSend?: (instructions: TransactionInstruction[]) => Promise<string>,
): Promise<PlayerFundedSessionState> {
  if (!wallet.vaultPda) throw new Error("Your game account is still loading. Reconnect and try again.");
  const stored = ensurePlayerFeeSession(wallet.smartWallet);
  const feeKeypair = keypairFromStored(stored);
  const rpc = connection();
  const vaultPda = new PublicKey(wallet.vaultPda);
  const [vaultBalanceRaw, feeBalanceRaw] = await Promise.all([
    rpc.getBalance(vaultPda, "confirmed"),
    rpc.getBalance(feeKeypair.publicKey, "confirmed"),
  ]);
  const vaultBalance = BigInt(vaultBalanceRaw);
  const feeBalance = BigInt(feeBalanceRaw);
  const surplus = playerVaultFeeSurplus(vaultBalance);
  if (surplus <= 0n) {
    throw new Error("Your account needs more test SOL before it can prepare your play balance.");
  }
  // Keep a small cushion above the advertised reserve because this fee signer
  // also pays for the vault-refill transaction itself.
  const targetTopUp = feeBalance >= SESSION_REFILL_TARGET_LAMPORTS
    ? 0n
    : SESSION_REFILL_TARGET_LAMPORTS - feeBalance;
  if (targetTopUp <= 0n) return refreshPlayerFundedSession(wallet.smartWallet);
  const transferLamports = surplus < targetTopUp ? surplus : targetTopUp;
  const transferInstruction = SystemProgram.transfer({
    fromPubkey: vaultPda,
    toPubkey: feeKeypair.publicKey,
    lamports: Number(transferLamports),
  });
  if (feeBalance < SESSION_MIN_BOOTSTRAP_LAMPORTS) {
    if (stored.sponsoredBootstrapComplete || !sponsoredSend) {
      throw new Error(
        "Automatic setup was already used for this play account. Add 0.001 test SOL, check the balance, and try again.",
      );
    }
    try {
      const signature = await sponsoredSend([transferInstruction]);
      // Record the one-time sponsorship as soon as Lazor accepts the transaction
      // so a delayed devnet confirmation cannot trigger an accidental duplicate.
      writeStoredSession({ ...stored, sponsoredBootstrapComplete: true });
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const status = (await withRateLimitBackoff(() => rpc.getSignatureStatuses([signature]))).value[0];
        if (status?.err) throw new Error(`Automatic setup failed: ${JSON.stringify(status.err)}`);
        if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
          return refreshPlayerFundedSession(wallet.smartWallet);
        }
        await waitMs(500);
      }
      throw new Error("Automatic setup was submitted, but devnet confirmation is delayed. Check the balance before retrying.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/submitted, but devnet confirmation is delayed/i.test(message)) throw error;
      throw new Error(
        "Automatic setup is temporarily unavailable. Use Get Test SOL for 0.001 test SOL, then check the balance and try again.",
      );
    }
  }
  const [resolved, displayBlockhash] = await Promise.all([
    resolvePasskeyWallet(rpc, wallet),
    takeLatestBlockhash(rpc),
  ]);
  const signatureSlot = await freshPasskeySlot(rpc);
  const prepared = await resolved.client.prepareExecute({
    payer: feeKeypair.publicKey,
    walletPda: resolved.walletPda,
    secp256r1: {
      credentialIdHash: resolved.credentialIdHash,
      publicKeyBytes: resolved.publicKeyBytes,
      authorityPda: resolved.authorityPda,
      slotOverride: signatureSlot,
    },
    instructions: [transferInstruction],
  });
  const displayTransaction = await buildDisplayTransaction(rpc, feeKeypair.publicKey, [transferInstruction], displayBlockhash.blockhash);
  const response = await requestPasskeySignature(prepared.challenge, wallet.credentialId, displayTransaction);
  const { instructions } = resolved.client.finalizeExecute(prepared, response);
  await sendDirect(rpc, feeKeypair, instructions, displayBlockhash);
  return refreshPlayerFundedSession(wallet.smartWallet);
}

export async function returnPlayerFeeSolToVault(wallet: LazorWalletInfo): Promise<PlayerFundedSessionState> {
  if (!wallet.vaultPda) throw new Error("Your game account is still loading. Reconnect and try again.");
  const stored = ensurePlayerFeeSession(wallet.smartWallet);
  const feeKeypair = keypairFromStored(stored);
  const rpc = connection();
  const balance = BigInt(await rpc.getBalance(feeKeypair.publicKey, "confirmed"));
  if (balance <= SESSION_RETURN_FEE_CUSHION_LAMPORTS) {
    throw new Error("There is no unused play balance to return.");
  }
  await sendDirect(rpc, feeKeypair, [SystemProgram.transfer({
    fromPubkey: feeKeypair.publicKey,
    toPubkey: new PublicKey(wallet.vaultPda),
    lamports: Number(balance - SESSION_RETURN_FEE_CUSHION_LAMPORTS),
  })]);
  return refreshPlayerFundedSession(wallet.smartWallet);
}

export async function returnPlayerFeeTokenToVault(
  wallet: LazorWalletInfo,
  mint: PublicKey,
  rawAmount: bigint,
  decimals: number,
): Promise<PlayerFundedSessionState> {
  if (!wallet.vaultPda) throw new Error("Your game account is still loading. Reconnect and try again.");
  if (rawAmount <= 0n) throw new Error("Enter an amount greater than zero.");
  const stored = ensurePlayerFeeSession(wallet.smartWallet);
  const feeKeypair = keypairFromStored(stored);
  const rpc = connection();
  const feeBalance = await rpc.getBalance(feeKeypair.publicKey, "confirmed");
  if (feeBalance < 10_000) throw new Error("The play balance needs a little test SOL to return this token.");
  const vault = new PublicKey(wallet.vaultPda);
  const source = deriveAssociatedTokenAccount(feeKeypair.publicKey, mint);
  const destination = deriveAssociatedTokenAccount(vault, mint);
  const sourceBalance = await rpc.getTokenAccountBalance(source, "confirmed").catch(() => null);
  if (!sourceBalance || BigInt(sourceBalance.value.amount) < rawAmount) {
    throw new Error("The play balance does not hold that amount.");
  }
  const instructions: TransactionInstruction[] = [];
  if (!(await rpc.getAccountInfo(destination, "confirmed"))) {
    instructions.push(createAssociatedTokenAccountInstruction(
      feeKeypair.publicKey,
      vault,
      mint,
    ));
  }
  instructions.push(createTransferCheckedTokenInstruction(
    source,
    mint,
    destination,
    feeKeypair.publicKey,
    rawAmount,
    decimals,
  ));
  await sendDirect(rpc, feeKeypair, instructions);
  return refreshPlayerFundedSession(wallet.smartWallet);
}

export async function revokePlayerFundedSession(wallet: LazorWalletInfo): Promise<PlayerFundedSessionState> {
  const stored = readStoredSession(wallet.smartWallet);
  if (!stored || stored.walletPda !== wallet.smartWallet) {
    throw new Error("Quick Play has not been set up for this account.");
  }
  const rpc = connection();
  await revokeStoredSession(rpc, wallet, stored, keypairFromStored(stored));
  writeStoredSession({ ...stored, active: false, sessionPda: undefined, expiresAt: undefined });
  return refreshPlayerFundedSession(wallet.smartWallet);
}
