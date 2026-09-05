import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { FutarchyClient, getStakeAddr } from "@metadaoproject/programs/futarchy/v0.6";
import { getEventAuthorityAddr } from "@metadaoproject/programs";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { Connection, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";

export type DecisionMarketSide = "PASS" | "FAIL";

export type DecisionMarketSnapshot = {
  proposal: string;
  dao: string;
  state: "DRAFT" | "PENDING" | "PASSED" | "FAILED" | "UNKNOWN";
  closesAt: number;
  passPrice: number;
  failPrice: number;
  walletUsdc: number;
  walletAntimatter: number;
  walletPassAntimatter: number;
  walletFailAntimatter: number;
  walletPassUsdc: number;
  walletFailUsdc: number;
  baseMint: string;
  quoteMint: string;
  squadsProposal: string;
  requiredStake: number;
  totalStaked: number;
  walletStaked: number;
  requiredStakeRaw: bigint;
  totalStakedRaw: bigint;
  walletStakedRaw: bigint;
  canUnstake: boolean;
  baseDecimals: number;
  quoteDecimals: number;
  passBaseReserves: bigint;
  passQuoteReserves: bigint;
  failBaseReserves: bigint;
  failQuoteReserves: bigint;
};

type AnchorWallet = ConstructorParameters<typeof AnchorProvider>[1];
export type SponsoredTokenAccountBuilder = (
  tokenAccounts: PublicKey[],
) => Promise<TransactionInstruction | null>;

function uniquePublicKeys(keys: PublicKey[]): PublicKey[] {
  return [...new Map(keys.map((key) => [key.toBase58(), key])).values()];
}
type SendTransaction = (transaction: Transaction, connection: Connection, options?: { skipPreflight?: boolean; preflightCommitment?: "confirmed" }) => Promise<string>;

const READ_ONLY_KEY = new PublicKey("11111111111111111111111111111111");
const FUTARCHY_V0_6_PROGRAM = "FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq";
const CONDITIONAL_VAULT_V0_4_PROGRAM = "VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg";
const READ_ONLY_WALLET = {
  publicKey: READ_ONLY_KEY,
  signTransaction: async () => { throw new Error("Connect a wallet to trade."); },
  signAllTransactions: async () => { throw new Error("Connect a wallet to trade."); },
} as unknown as AnchorWallet;

function clientFor(connection: Connection, wallet?: AnchorWallet | null) {
  const provider = new AnchorProvider(connection, wallet ?? READ_ONLY_WALLET, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  // Pass strings across the SDK boundary so its pinned web3.js instance can
  // construct its own PublicKeys instead of receiving keys from the app copy.
  return FutarchyClient.createClient({
    provider: provider as any,
    futarchyProgramId: FUTARCHY_V0_6_PROGRAM as any,
    conditionalVaultProgramId: CONDITIONAL_VAULT_V0_4_PROGRAM as any,
  });
}

function enumName(value: Record<string, unknown> | null | undefined): DecisionMarketSnapshot["state"] {
  const key = value ? Object.keys(value)[0]?.toUpperCase() : "";
  return key === "DRAFT" || key === "PENDING" || key === "PASSED" || key === "FAILED" ? key : "UNKNOWN";
}

function asNumber(value: { toString(): string } | number): number {
  return typeof value === "number" ? value : Number(value.toString());
}

function normalizedKey(value: { toBase58(): string } | string): PublicKey {
  return new PublicKey(typeof value === "string" ? value : value.toBase58());
}

function poolPrice(pool: any, baseDecimals: number, quoteDecimals: number): number {
  const base = asNumber(pool.baseReserves);
  const quote = asNumber(pool.quoteReserves);
  if (!base) return 0;
  return (quote / base) * (10 ** (baseDecimals - quoteDecimals));
}

async function tokenBalance(connection: Connection, mint: PublicKey, owner: PublicKey, decimals: number): Promise<number> {
  try {
    const account = getAssociatedTokenAddressSync(mint, owner, true);
    const balance = await connection.getTokenAccountBalance(account, "confirmed");
    return Number(balance.value.amount) / (10 ** decimals);
  } catch {
    return 0;
  }
}

export async function fetchDecisionMarket(
  connection: Connection,
  daoAddress: string,
  proposalAddress: string,
  walletAddress?: PublicKey | null,
): Promise<DecisionMarketSnapshot> {
  const dao = new PublicKey(daoAddress);
  const proposal = new PublicKey(proposalAddress);
  const client = clientFor(connection);
  const [daoAccount, proposalAccount] = await Promise.all([
    client.v0_6_0_futarchy.account.dao.fetch(dao),
    client.v0_6_0_futarchy.account.proposal.fetch(proposal),
  ]);
  if (!normalizedKey(proposalAccount.dao).equals(dao)) {
    throw new Error("This proposal belongs to a different Futarchy DAO.");
  }
  const [baseMint, quoteMint] = [normalizedKey(daoAccount.baseMint), normalizedKey(daoAccount.quoteMint)];
  const [baseInfo, quoteInfo] = await Promise.all([
    getMint(connection, baseMint, "confirmed"),
    getMint(connection, quoteMint, "confirmed"),
  ]);
  const state = enumName(proposalAccount.state as any);
  const draftState = (proposalAccount.state as any).draft;
  const requiredStakeRaw = BigInt(daoAccount.baseToStake.toString());
  const totalStakedRaw = draftState ? BigInt(draftState.amountStaked.toString()) : 0n;
  const futarchyPools = (daoAccount.amm.state as any).futarchy;
  if (!futarchyPools && state === "PENDING") throw new Error("The proposal markets have not launched.");
  const { passBaseMint, failBaseMint, passQuoteMint, failQuoteMint } = client.getProposalPdas(proposal, baseMint, quoteMint, dao);
  const stakeAccountAddress = walletAddress ? getStakeAddr(new PublicKey(FUTARCHY_V0_6_PROGRAM), proposal, walletAddress)[0] : null;
  const [walletUsdc, walletAntimatter, walletPassAntimatter, walletFailAntimatter, walletPassUsdc, walletFailUsdc, stakeAccount] = walletAddress ? await Promise.all([
    tokenBalance(connection, quoteMint, walletAddress, quoteInfo.decimals),
    tokenBalance(connection, baseMint, walletAddress, baseInfo.decimals),
    tokenBalance(connection, passBaseMint, walletAddress, baseInfo.decimals),
    tokenBalance(connection, failBaseMint, walletAddress, baseInfo.decimals),
    tokenBalance(connection, passQuoteMint, walletAddress, quoteInfo.decimals),
    tokenBalance(connection, failQuoteMint, walletAddress, quoteInfo.decimals),
    client.v0_6_0_futarchy.account.stakeAccount.fetchNullable(stakeAccountAddress!),
  ]) : [0, 0, 0, 0, 0, 0, null];
  const walletStakedRaw = stakeAccount ? BigInt(stakeAccount.amount.toString()) : 0n;
  const timestampEnqueued = asNumber(proposalAccount.timestampEnqueued);

  return {
    proposal: proposal.toBase58(),
    dao: dao.toBase58(),
    state,
    closesAt: timestampEnqueued ? timestampEnqueued + proposalAccount.durationInSeconds : 0,
    passPrice: futarchyPools ? poolPrice(futarchyPools.pass, baseInfo.decimals, quoteInfo.decimals) : 0,
    failPrice: futarchyPools ? poolPrice(futarchyPools.fail, baseInfo.decimals, quoteInfo.decimals) : 0,
    walletUsdc,
    walletAntimatter,
    walletPassAntimatter,
    walletFailAntimatter,
    walletPassUsdc,
    walletFailUsdc,
    baseMint: baseMint.toBase58(),
    quoteMint: quoteMint.toBase58(),
    squadsProposal: normalizedKey(proposalAccount.squadsProposal).toBase58(),
    requiredStake: Number(requiredStakeRaw) / (10 ** baseInfo.decimals),
    totalStaked: Number(totalStakedRaw) / (10 ** baseInfo.decimals),
    walletStaked: Number(walletStakedRaw) / (10 ** baseInfo.decimals),
    requiredStakeRaw,
    totalStakedRaw,
    walletStakedRaw,
    canUnstake: walletStakedRaw > 0n && (timestampEnqueued === 0 || Math.floor(Date.now() / 1000) >= timestampEnqueued + 5),
    baseDecimals: baseInfo.decimals,
    quoteDecimals: quoteInfo.decimals,
    passBaseReserves: futarchyPools ? BigInt(futarchyPools.pass.baseReserves.toString()) : 0n,
    passQuoteReserves: futarchyPools ? BigInt(futarchyPools.pass.quoteReserves.toString()) : 0n,
    failBaseReserves: futarchyPools ? BigInt(futarchyPools.fail.baseReserves.toString()) : 0n,
    failQuoteReserves: futarchyPools ? BigInt(futarchyPools.fail.quoteReserves.toString()) : 0n,
  };
}

async function sendAndConfirm(
  connection: Connection,
  wallet: AnchorWallet,
  sendTransaction: SendTransaction,
  transaction: Transaction,
): Promise<string> {
  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = wallet.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  const signature = await sendTransaction(transaction, connection, { skipPreflight: false, preflightCommitment: "confirmed" });
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (confirmation.value.err) throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  return signature;
}

export async function stakeToDecisionProposal({ connection, wallet, sendTransaction, daoAddress, proposalAddress, amount }: {
  connection: Connection; wallet: AnchorWallet; sendTransaction: SendTransaction; daoAddress: string; proposalAddress: string; amount: string;
}): Promise<string> {
  const dao = new PublicKey(daoAddress);
  const proposal = new PublicKey(proposalAddress);
  const client = clientFor(connection, wallet);
  const [daoAccount, proposalAccount] = await Promise.all([
    client.v0_6_0_futarchy.account.dao.fetch(dao),
    client.v0_6_0_futarchy.account.proposal.fetch(proposal),
  ]);
  if (!normalizedKey(proposalAccount.dao).equals(dao)) throw new Error("This proposal belongs to a different Futarchy DAO.");
  if (enumName(proposalAccount.state as any) !== "DRAFT") throw new Error("This proposal is no longer accepting stake.");
  const baseMint = normalizedKey(daoAccount.baseMint);
  const decimals = (await getMint(connection, baseMint, "confirmed")).decimals;
  const rawAmount = decimalToRaw(amount, decimals);
  const balance = await connection.getTokenAccountBalance(getAssociatedTokenAddressSync(baseMint, wallet.publicKey), "confirmed").catch(() => null);
  if (!balance || BigInt(balance.value.amount) < rawAmount) throw new Error("Not enough ANTIMATTER in the connected wallet.");
  const transaction = await client.stakeToProposalIx({ proposal, dao, baseMint, amount: new BN(rawAmount.toString()) }).transaction();
  return sendAndConfirm(connection, wallet, sendTransaction, transaction);
}

export async function unstakeFromDecisionProposal({ connection, wallet, sendTransaction, daoAddress, proposalAddress, amount }: {
  connection: Connection; wallet: AnchorWallet; sendTransaction: SendTransaction; daoAddress: string; proposalAddress: string; amount: string;
}): Promise<string> {
  const dao = new PublicKey(daoAddress);
  const proposal = new PublicKey(proposalAddress);
  const client = clientFor(connection, wallet);
  const [daoAccount, proposalAccount] = await Promise.all([
    client.v0_6_0_futarchy.account.dao.fetch(dao),
    client.v0_6_0_futarchy.account.proposal.fetch(proposal),
  ]);
  if (!normalizedKey(proposalAccount.dao).equals(dao)) throw new Error("This proposal belongs to a different Futarchy DAO.");
  const baseMint = normalizedKey(daoAccount.baseMint);
  const decimals = (await getMint(connection, baseMint, "confirmed")).decimals;
  const rawAmount = decimalToRaw(amount, decimals);
  const stakeAddress = getStakeAddr(new PublicKey(FUTARCHY_V0_6_PROGRAM), proposal, wallet.publicKey)[0];
  const stakeAccount = await client.v0_6_0_futarchy.account.stakeAccount.fetchNullable(stakeAddress);
  if (!stakeAccount || BigInt(stakeAccount.amount.toString()) < rawAmount) throw new Error("The connected wallet does not have that much ANTIMATTER staked here.");
  const timestampEnqueued = asNumber(proposalAccount.timestampEnqueued);
  if (timestampEnqueued && Math.floor(Date.now() / 1000) < timestampEnqueued + 5) throw new Error("Stake unlocks five seconds after the proposal launches.");
  const transaction = await client.unstakeFromProposalIx({ proposal, dao, baseMint, amount: new BN(rawAmount.toString()) }).transaction();
  return sendAndConfirm(connection, wallet, sendTransaction, transaction);
}

export async function launchDecisionProposal({ connection, wallet, sendTransaction, daoAddress, proposalAddress }: {
  connection: Connection; wallet: AnchorWallet; sendTransaction: SendTransaction; daoAddress: string; proposalAddress: string;
}): Promise<string> {
  const dao = new PublicKey(daoAddress);
  const proposal = new PublicKey(proposalAddress);
  const client = clientFor(connection, wallet);
  const [daoAccount, proposalAccount] = await Promise.all([
    client.v0_6_0_futarchy.account.dao.fetch(dao),
    client.v0_6_0_futarchy.account.proposal.fetch(proposal),
  ]);
  if (!normalizedKey(proposalAccount.dao).equals(dao)) throw new Error("This proposal belongs to a different Futarchy DAO.");
  const draftState = (proposalAccount.state as any).draft;
  if (!draftState) throw new Error("Only a draft proposal can be launched.");
  if (BigInt(draftState.amountStaked.toString()) < BigInt(daoAccount.baseToStake.toString())) throw new Error("The proposal has not reached its required ANTIMATTER stake.");
  const transaction = await client.launchProposalIx({
    proposal,
    dao,
    baseMint: normalizedKey(daoAccount.baseMint),
    quoteMint: normalizedKey(daoAccount.quoteMint),
    squadsProposal: normalizedKey(proposalAccount.squadsProposal),
  }).transaction();
  return sendAndConfirm(connection, wallet, sendTransaction, transaction);
}

export async function requestDecisionMarketFinalization(proposalAddress: string): Promise<{
  outcome: string;
  state?: string;
  signature?: string;
  retryable?: boolean;
}> {
  const response = await fetch("/api/futarchy-finalizer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal: proposalAddress }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) {
    throw new Error(payload.error || "The automatic finalization keeper is unavailable.");
  }
  const result = payload.results?.[0];
  return result ?? { outcome: payload.eligible ? "FINALIZATION_QUEUED" : "NOT_ELIGIBLE" };
}

export async function redeemDecisionMarketPositions({ connection, wallet, sendTransaction, daoAddress, proposalAddress, sponsorTokenAccounts }: {
  connection: Connection; wallet: AnchorWallet; sendTransaction: SendTransaction; daoAddress: string; proposalAddress: string; sponsorTokenAccounts?: SponsoredTokenAccountBuilder;
}): Promise<string> {
  const dao = new PublicKey(daoAddress);
  const proposal = new PublicKey(proposalAddress);
  const client = clientFor(connection, wallet);
  const [daoAccount, proposalAccount] = await Promise.all([
    client.v0_6_0_futarchy.account.dao.fetch(dao),
    client.v0_6_0_futarchy.account.proposal.fetch(proposal),
  ]);
  if (!normalizedKey(proposalAccount.dao).equals(dao)) throw new Error("This proposal belongs to a different Futarchy DAO.");
  const state = enumName(proposalAccount.state as any);
  if (state !== "PASSED" && state !== "FAILED") throw new Error("Positions can be redeemed only after proposal finalization.");

  const baseMint = normalizedKey(daoAccount.baseMint);
  const quoteMint = normalizedKey(daoAccount.quoteMint);
  const { question, baseVault, quoteVault, passBaseMint, failBaseMint, passQuoteMint, failQuoteMint } = client.getProposalPdas(proposal, baseMint, quoteMint, dao);
  const baseRedeem = await client.vaultClient
    .redeemTokensIx(question, baseVault, baseMint, 2, wallet.publicKey, wallet.publicKey)
    .transaction();
  const quoteRedeem = await client.vaultClient
    .redeemTokensIx(question, quoteVault, quoteMint, 2, wallet.publicKey, wallet.publicKey)
    .transaction();
  const redeemTokenAccounts = uniquePublicKeys([
    baseMint,
    quoteMint,
    passBaseMint,
    failBaseMint,
    passQuoteMint,
    failQuoteMint,
  ].map((mint) => getAssociatedTokenAddressSync(mint, wallet.publicKey)));
  const sponsoredRentInstruction = sponsorTokenAccounts
    ? await sponsorTokenAccounts(redeemTokenAccounts)
    : null;
  const transaction = new Transaction().add(
    ...(sponsoredRentInstruction ? [sponsoredRentInstruction] : []),
    createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, getAssociatedTokenAddressSync(baseMint, wallet.publicKey), wallet.publicKey, baseMint),
    createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, getAssociatedTokenAddressSync(quoteMint, wallet.publicKey), wallet.publicKey, quoteMint),
    ...baseRedeem.instructions,
    ...quoteRedeem.instructions,
  );
  return sendAndConfirm(connection, wallet, sendTransaction, transaction);
}

export function decimalToRaw(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error("Enter a valid positive amount.");
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) throw new Error(`Use no more than ${decimals} decimal places.`);
  const raw = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
  if (raw <= 0n) throw new Error("Enter an amount greater than zero.");
  return raw;
}

function conservativeSwapOutput(inputReserve: bigint, outputReserve: bigint, inputAmount: bigint, slippageBps: number): bigint {
  const afterProtocolFee = inputAmount * 9_950n / 10_000n;
  const output = afterProtocolFee * outputReserve / (inputReserve + afterProtocolFee);
  return output * BigInt(10_000 - slippageBps) / 10_000n;
}

function conservativeBuyOutput(pool: any, inputAmount: bigint, slippageBps: number): bigint {
  return conservativeSwapOutput(BigInt(pool.quoteReserves.toString()), BigInt(pool.baseReserves.toString()), inputAmount, slippageBps);
}

function conservativeSellOutput(pool: any, inputAmount: bigint, slippageBps: number): bigint {
  return conservativeSwapOutput(BigInt(pool.baseReserves.toString()), BigInt(pool.quoteReserves.toString()), inputAmount, slippageBps);
}

export function estimateDecisionMarketBuyMinimum(
  market: DecisionMarketSnapshot,
  side: DecisionMarketSide,
  amount: string,
  slippageBps: number,
): number {
  if (slippageBps < 10 || slippageBps > 1_000) throw new Error("Slippage must be between 0.1% and 10%.");
  const inputAmount = decimalToRaw(amount, market.quoteDecimals);
  const pool = side === "PASS"
    ? { baseReserves: market.passBaseReserves, quoteReserves: market.passQuoteReserves }
    : { baseReserves: market.failBaseReserves, quoteReserves: market.failQuoteReserves };
  const minimumOutput = conservativeBuyOutput(pool, inputAmount, slippageBps);
  return Number(minimumOutput) / (10 ** market.baseDecimals);
}

export function estimateDecisionMarketSellMinimum(
  market: DecisionMarketSnapshot,
  side: DecisionMarketSide,
  amount: string,
  slippageBps: number,
): number {
  if (slippageBps < 10 || slippageBps > 1_000) throw new Error("Slippage must be between 0.1% and 10%.");
  const inputAmount = decimalToRaw(amount, market.baseDecimals);
  const pool = side === "PASS"
    ? { baseReserves: market.passBaseReserves, quoteReserves: market.passQuoteReserves }
    : { baseReserves: market.failBaseReserves, quoteReserves: market.failQuoteReserves };
  const minimumOutput = conservativeSellOutput(pool, inputAmount, slippageBps);
  return Number(minimumOutput) / (10 ** market.quoteDecimals);
}

export async function buyDecisionMarketSide({
  connection,
  wallet,
  sendTransaction,
  daoAddress,
  proposalAddress,
  side,
  amount,
  slippageBps,
  sponsorTokenAccounts,
}: {
  connection: Connection;
  wallet: AnchorWallet;
  sendTransaction: (transaction: Transaction, connection: Connection, options?: { skipPreflight?: boolean; preflightCommitment?: "confirmed" }) => Promise<string>;
  daoAddress: string;
  proposalAddress: string;
  side: DecisionMarketSide;
  amount: string;
  slippageBps: number;
  sponsorTokenAccounts?: SponsoredTokenAccountBuilder;
}): Promise<{ signature: string; minimumOutput: number }> {
  if (slippageBps < 10 || slippageBps > 1_000) throw new Error("Slippage must be between 0.1% and 10%.");
  const dao = new PublicKey(daoAddress);
  const proposal = new PublicKey(proposalAddress);
  const trader = wallet.publicKey;
  const client = clientFor(connection, wallet);
  const [daoAccount, proposalAccount] = await Promise.all([
    client.v0_6_0_futarchy.account.dao.fetch(dao),
    client.v0_6_0_futarchy.account.proposal.fetch(proposal),
  ]);
  if (enumName(proposalAccount.state as any) !== "PENDING") throw new Error("This decision market is no longer open.");

  const baseMint = normalizedKey(daoAccount.baseMint);
  const quoteMint = normalizedKey(daoAccount.quoteMint);
  const [baseInfo, quoteInfo] = await Promise.all([
    getMint(connection, baseMint, "confirmed"),
    getMint(connection, quoteMint, "confirmed"),
  ]);
  const inputAmount = decimalToRaw(amount, quoteInfo.decimals);
  const underlyingQuoteAccount = getAssociatedTokenAddressSync(quoteMint, trader);
  const underlyingBalance = await connection.getTokenAccountBalance(underlyingQuoteAccount, "confirmed").catch(() => null);
  if (!underlyingBalance || BigInt(underlyingBalance.value.amount) < inputAmount) throw new Error("Not enough devnet USDC in the connected wallet.");

  const futarchyPools = (daoAccount.amm.state as any).futarchy;
  if (!futarchyPools) throw new Error("The proposal markets have not launched.");
  const pool = side === "PASS" ? futarchyPools.pass : futarchyPools.fail;
  const minOutput = conservativeBuyOutput(pool, inputAmount, slippageBps);
  if (minOutput <= 0n) throw new Error("The trade is too small for this market.");

  const {
    question,
    baseVault,
    quoteVault,
    passBaseMint,
    passQuoteMint,
    failBaseMint,
    failQuoteMint,
  } = client.getProposalPdas(proposal, baseMint, quoteMint, dao);
  const outputMint = side === "PASS" ? passBaseMint : failBaseMint;
  const userOutputAccount = getAssociatedTokenAddressSync(outputMint, trader);
  const sponsoredRentInstruction = sponsorTokenAccounts
    ? await sponsorTokenAccounts(uniquePublicKeys([
      getAssociatedTokenAddressSync(passQuoteMint, trader),
      getAssociatedTokenAddressSync(failQuoteMint, trader),
      userOutputAccount,
    ]))
    : null;
  const splitTransaction = await client.vaultClient
    .splitTokensIx(question, quoteVault, quoteMint, new BN(inputAmount.toString()), 2, trader, trader)
    .transaction();
  const swapTransaction = await client.v0_6_0_futarchy.methods.conditionalSwap({
    market: side === "PASS" ? { pass: {} } : { fail: {} },
    swapType: { buy: {} },
    inputAmount: new BN(inputAmount.toString()),
    minOutputAmount: new BN(minOutput.toString()),
  }).accounts({
    dao,
    ammBaseVault: getAssociatedTokenAddressSync(baseMint, dao, true),
    ammQuoteVault: getAssociatedTokenAddressSync(quoteMint, dao, true),
    proposal,
    ammPassBaseVault: getAssociatedTokenAddressSync(passBaseMint, dao, true),
    ammPassQuoteVault: getAssociatedTokenAddressSync(passQuoteMint, dao, true),
    ammFailBaseVault: getAssociatedTokenAddressSync(failBaseMint, dao, true),
    ammFailQuoteVault: getAssociatedTokenAddressSync(failQuoteMint, dao, true),
    trader,
    userInputAccount: getAssociatedTokenAddressSync(side === "PASS" ? passQuoteMint : failQuoteMint, trader),
    userOutputAccount,
    baseVault,
    baseVaultUnderlyingTokenAccount: getAssociatedTokenAddressSync(baseMint, baseVault, true),
    quoteVault,
    quoteVaultUnderlyingTokenAccount: getAssociatedTokenAddressSync(quoteMint, quoteVault, true),
    passBaseMint,
    failBaseMint,
    passQuoteMint,
    failQuoteMint,
    conditionalVaultProgram: client.vaultClient.vaultProgram.programId,
    vaultEventAuthority: getEventAuthorityAddr(client.vaultClient.vaultProgram.programId)[0],
    question,
    tokenProgram: TOKEN_PROGRAM_ID,
  }).preInstructions([
    createAssociatedTokenAccountIdempotentInstruction(trader, userOutputAccount, trader, outputMint),
  ]).transaction();

  const transaction = new Transaction().add(
    ...(sponsoredRentInstruction ? [sponsoredRentInstruction] : []),
    ...splitTransaction.instructions,
    ...swapTransaction.instructions,
  );
  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = trader;
  transaction.recentBlockhash = latest.blockhash;
  const signature = await sendTransaction(transaction, connection, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (confirmation.value.err) throw new Error(`Trade failed: ${JSON.stringify(confirmation.value.err)}`);
  return { signature, minimumOutput: Number(minOutput) / (10 ** baseInfo.decimals) };
}

export async function sellDecisionMarketSide({
  connection,
  wallet,
  sendTransaction,
  daoAddress,
  proposalAddress,
  side,
  amount,
  slippageBps,
  sponsorTokenAccounts,
}: {
  connection: Connection;
  wallet: AnchorWallet;
  sendTransaction: (transaction: Transaction, connection: Connection, options?: { skipPreflight?: boolean; preflightCommitment?: "confirmed" }) => Promise<string>;
  daoAddress: string;
  proposalAddress: string;
  side: DecisionMarketSide;
  amount: string;
  slippageBps: number;
  sponsorTokenAccounts?: SponsoredTokenAccountBuilder;
}): Promise<{ signature: string; minimumOutput: number }> {
  if (slippageBps < 10 || slippageBps > 1_000) throw new Error("Slippage must be between 0.1% and 10%.");
  const dao = new PublicKey(daoAddress);
  const proposal = new PublicKey(proposalAddress);
  const trader = wallet.publicKey;
  const client = clientFor(connection, wallet);
  const [daoAccount, proposalAccount] = await Promise.all([
    client.v0_6_0_futarchy.account.dao.fetch(dao),
    client.v0_6_0_futarchy.account.proposal.fetch(proposal),
  ]);
  if (enumName(proposalAccount.state as any) !== "PENDING") throw new Error("This decision market is no longer open.");

  const baseMint = normalizedKey(daoAccount.baseMint);
  const quoteMint = normalizedKey(daoAccount.quoteMint);
  const [baseInfo, quoteInfo] = await Promise.all([
    getMint(connection, baseMint, "confirmed"),
    getMint(connection, quoteMint, "confirmed"),
  ]);
  const inputAmount = decimalToRaw(amount, baseInfo.decimals);
  const futarchyPools = (daoAccount.amm.state as any).futarchy;
  if (!futarchyPools) throw new Error("The proposal markets have not launched.");
  const pool = side === "PASS" ? futarchyPools.pass : futarchyPools.fail;
  const minOutput = conservativeSellOutput(pool, inputAmount, slippageBps);
  if (minOutput <= 0n) throw new Error("The trade is too small for this market.");

  const {
    question,
    baseVault,
    quoteVault,
    passBaseMint,
    passQuoteMint,
    failBaseMint,
    failQuoteMint,
  } = client.getProposalPdas(proposal, baseMint, quoteMint, dao);
  const inputMint = side === "PASS" ? passBaseMint : failBaseMint;
  const outputMint = side === "PASS" ? passQuoteMint : failQuoteMint;
  const userInputAccount = getAssociatedTokenAddressSync(inputMint, trader);
  const userOutputAccount = getAssociatedTokenAddressSync(outputMint, trader);
  const sponsoredRentInstruction = sponsorTokenAccounts
    ? await sponsorTokenAccounts([userOutputAccount])
    : null;
  const inputBalance = await connection.getTokenAccountBalance(userInputAccount, "confirmed").catch(() => null);
  if (!inputBalance || BigInt(inputBalance.value.amount) < inputAmount) {
    throw new Error(`Not enough conditional ${side} ANTIMATTER in the connected wallet.`);
  }

  const swapTransaction = await client.v0_6_0_futarchy.methods.conditionalSwap({
    market: side === "PASS" ? { pass: {} } : { fail: {} },
    swapType: { sell: {} },
    inputAmount: new BN(inputAmount.toString()),
    minOutputAmount: new BN(minOutput.toString()),
  }).accounts({
    dao,
    ammBaseVault: getAssociatedTokenAddressSync(baseMint, dao, true),
    ammQuoteVault: getAssociatedTokenAddressSync(quoteMint, dao, true),
    proposal,
    ammPassBaseVault: getAssociatedTokenAddressSync(passBaseMint, dao, true),
    ammPassQuoteVault: getAssociatedTokenAddressSync(passQuoteMint, dao, true),
    ammFailBaseVault: getAssociatedTokenAddressSync(failBaseMint, dao, true),
    ammFailQuoteVault: getAssociatedTokenAddressSync(failQuoteMint, dao, true),
    trader,
    userInputAccount,
    userOutputAccount,
    baseVault,
    baseVaultUnderlyingTokenAccount: getAssociatedTokenAddressSync(baseMint, baseVault, true),
    quoteVault,
    quoteVaultUnderlyingTokenAccount: getAssociatedTokenAddressSync(quoteMint, quoteVault, true),
    passBaseMint,
    failBaseMint,
    passQuoteMint,
    failQuoteMint,
    conditionalVaultProgram: client.vaultClient.vaultProgram.programId,
    vaultEventAuthority: getEventAuthorityAddr(client.vaultClient.vaultProgram.programId)[0],
    question,
    tokenProgram: TOKEN_PROGRAM_ID,
  }).preInstructions([
    createAssociatedTokenAccountIdempotentInstruction(trader, userOutputAccount, trader, outputMint),
  ]).transaction();

  const transaction = new Transaction().add(
    ...(sponsoredRentInstruction ? [sponsoredRentInstruction] : []),
    ...swapTransaction.instructions,
  );
  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = trader;
  transaction.recentBlockhash = latest.blockhash;
  const signature = await sendTransaction(transaction, connection, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (confirmation.value.err) throw new Error(`Trade failed: ${JSON.stringify(confirmation.value.err)}`);
  return { signature, minimumOutput: Number(minOutput) / (10 ** quoteInfo.decimals) };
}
