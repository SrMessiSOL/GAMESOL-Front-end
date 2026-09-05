const bs58Module = require("bs58");
const { AnchorProvider, BN } = require("@coral-xyz/anchor");
const {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} = require("@solana/spl-token");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");

const bs58 = bs58Module.default || bs58Module;
const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const FUTARCHY_V0_6_PROGRAM = "FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq";
const CONDITIONAL_VAULT_V0_4_PROGRAM = "VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg";
const MAX_FINALIZATIONS_PER_RUN = 5;

function stateName(state) {
  return state && typeof state === "object" ? String(Object.keys(state)[0] || "unknown").toLowerCase() : "unknown";
}

function numberFromAnchor(value) {
  return typeof value === "number" ? value : Number(value.toString());
}

function keyString(value) {
  return typeof value === "string" ? value : value.toBase58();
}

function parseKeypair(raw) {
  if (!raw || !raw.trim()) throw new Error("FUTARCHY_KEEPER_SECRET_KEY is not configured.");
  const value = raw.trim();
  const bytes = value.startsWith("[") ? Uint8Array.from(JSON.parse(value)) : bs58.decode(value);
  return Keypair.fromSecretKey(bytes);
}

function allowedDaoAddresses(env = process.env) {
  const configured = env.FUTARCHY_DAO_ADDRESSES || env.FUTARCHY_DAO || env.VITE_FUTARCHY_DAO || "";
  const addresses = configured.split(",").map((value) => value.trim()).filter(Boolean);
  if (addresses.length === 0) throw new Error("FUTARCHY_DAO_ADDRESSES is not configured.");
  return new Set(addresses.map((address) => new PublicKey(address).toBase58()));
}

function isDevnet(env = process.env) {
  const cluster = String(env.SOLANA_CLUSTER || env.VITE_SOLANA_CLUSTER || "devnet").trim().toLowerCase();
  return cluster === "devnet";
}

function keeperKeypair(env = process.env) {
  // The faucet fallback keeps the existing devnet experiment operable while a
  // dedicated fee-payer is provisioned. This module refuses to run on mainnet.
  return parseKeypair(env.FUTARCHY_KEEPER_SECRET_KEY || env.ANTIMATTER_FAUCET_SECRET_KEY || "");
}

async function keeperClient(connection, keypair) {
  // MetaDAO publishes this entrypoint as ESM. Dynamic import keeps the Vercel
  // CommonJS function compatible without changing the rest of the keeper API.
  const { FutarchyClient } = await import("@metadaoproject/programs/futarchy/v0.6");
  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (transaction) => {
      transaction.partialSign(keypair);
      return transaction;
    },
    signAllTransactions: async (transactions) => {
      for (const transaction of transactions) transaction.partialSign(keypair);
      return transactions;
    },
  };
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return FutarchyClient.createClient({
    provider,
    futarchyProgramId: FUTARCHY_V0_6_PROGRAM,
    conditionalVaultProgramId: CONDITIONAL_VAULT_V0_4_PROGRAM,
  });
}

async function crankProposalTwap(client, keypair, proposal, proposalAccount, daoAccount) {
  const { getEventAuthorityAddr } = await import("@metadaoproject/programs");
  const dao = proposalAccount.dao;
  const baseMint = daoAccount.baseMint;
  const quoteMint = daoAccount.quoteMint;
  const {
    question,
    baseVault,
    quoteVault,
    passBaseMint,
    passQuoteMint,
    failBaseMint,
    failQuoteMint,
  } = client.getProposalPdas(proposal, baseMint, quoteMint, dao);
  const userInputAccount = getAssociatedTokenAddressSync(passQuoteMint, keypair.publicKey);
  const userOutputAccount = getAssociatedTokenAddressSync(passBaseMint, keypair.publicKey);

  // conditionalSwap updates the spot/pass/fail TWAPs before applying the swap.
  // A zero-amount swap therefore performs the permissionless close-time crank
  // without changing market reserves, prices, or the keeper's token balances.
  return client.v0_6_0_futarchy.methods
    .conditionalSwap({
      market: { pass: {} },
      swapType: { buy: {} },
      inputAmount: new BN(0),
      minOutputAmount: new BN(0),
    })
    .accounts({
      dao,
      ammBaseVault: getAssociatedTokenAddressSync(baseMint, dao, true),
      ammQuoteVault: getAssociatedTokenAddressSync(quoteMint, dao, true),
      proposal,
      ammPassBaseVault: getAssociatedTokenAddressSync(passBaseMint, dao, true),
      ammPassQuoteVault: getAssociatedTokenAddressSync(passQuoteMint, dao, true),
      ammFailBaseVault: getAssociatedTokenAddressSync(failBaseMint, dao, true),
      ammFailQuoteVault: getAssociatedTokenAddressSync(failQuoteMint, dao, true),
      trader: keypair.publicKey,
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
    })
    .preInstructions([
      createAssociatedTokenAccountIdempotentInstruction(
        keypair.publicKey,
        userInputAccount,
        keypair.publicKey,
        passQuoteMint,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        keypair.publicKey,
        userOutputAccount,
        keypair.publicKey,
        passBaseMint,
      ),
    ])
    .rpc();
}

async function clusterTimestamp(connection) {
  const slot = await connection.getSlot("confirmed");
  const blockTime = await connection.getBlockTime(slot);
  if (blockTime === null) throw new Error("Solana cluster time is unavailable; finalization stopped safely.");
  return blockTime;
}

function proposalSummary(publicKey, account, now) {
  const timestampEnqueued = numberFromAnchor(account.timestampEnqueued);
  const duration = numberFromAnchor(account.durationInSeconds);
  const closesAt = timestampEnqueued > 0 ? timestampEnqueued + duration : 0;
  return {
    proposal: keyString(publicKey),
    dao: keyString(account.dao),
    state: stateName(account.state),
    closesAt,
    eligible: stateName(account.state) === "pending" && closesAt > 0 && closesAt <= now,
  };
}

function errorDetails(error) {
  const message = error && error.message ? error.message : String(error);
  const logs = Array.isArray(error && error.logs) ? error.logs : [];
  const combined = `${message}\n${logs.join("\n")}`;
  // Anchor numeric error codes are program-local; matching 0x1775/0x1776 can
  // misclassify an error emitted by Squads or a token program in the same tx.
  if (/MarketsTooYoung|ProposalTooYoung|too young|TWAP might need to be cranked/i.test(combined)) {
    return {
      code: "TWAP_NOT_READY",
      retryable: true,
      message: "Trading is closed, but the on-chain TWAP is not ready. The keeper will retry.",
      diagnostic: message.slice(0, 500),
    };
  }
  if (/ProposalAlreadyFinalized|already been finalized|0x1777/i.test(combined)) {
    return { code: "ALREADY_FINALIZED", retryable: false, message: "The proposal was finalized by another transaction." };
  }
  return { code: "FINALIZE_FAILED", retryable: true, message };
}

async function runFutarchyKeeper({ proposalAddress = null, env = process.env, dryRun = false } = {}) {
  if (!isDevnet(env)) throw new Error("The sovereignty keeper is devnet-only and will not sign for another cluster.");
  const allowedDaos = allowedDaoAddresses(env);
  const rpcUrl = env.SOLANA_RPC_URL || env.VITE_SOLANA_RPC_ENDPOINT || DEFAULT_RPC_URL;
  const connection = new Connection(rpcUrl, "confirmed");
  const now = await clusterTimestamp(connection);
  const keypair = dryRun ? Keypair.generate() : keeperKeypair(env);
  const client = await keeperClient(connection, keypair);

  let proposals;
  if (proposalAddress) {
    const proposal = new PublicKey(proposalAddress);
    const account = await client.v0_6_0_futarchy.account.proposal.fetch(proposal);
    proposals = [{ publicKey: proposal, account }];
  } else {
    proposals = await client.v0_6_0_futarchy.account.proposal.all();
  }

  const inspected = proposals
    .map(({ publicKey, account }) => ({ publicKey, account, summary: proposalSummary(publicKey, account, now) }))
    .filter(({ summary }) => allowedDaos.has(summary.dao));
  const rejected = proposalAddress && inspected.length === 0;
  if (rejected) throw new Error("The proposal does not belong to an allowlisted GAMESOL Futarchy DAO.");

  const eligibleCandidates = inspected.filter(({ summary }) => summary.eligible).slice(0, MAX_FINALIZATIONS_PER_RUN);
  const results = dryRun
    ? eligibleCandidates.map(({ summary }) => ({ ...summary, outcome: "ELIGIBLE_DRY_RUN" }))
    : [];
  for (const candidate of dryRun ? [] : eligibleCandidates) {
    // Refetch immediately before signing. Concurrent keepers are safe because
    // the on-chain proposal state is the source of truth.
    const latest = await client.v0_6_0_futarchy.account.proposal.fetch(candidate.publicKey);
    const latestSummary = proposalSummary(candidate.publicKey, latest, now);
    if (!latestSummary.eligible || !allowedDaos.has(latestSummary.dao)) {
      results.push({ ...latestSummary, outcome: "SKIPPED_STATE_CHANGED" });
      continue;
    }
    try {
      // This experiment was initialized with the v0.6.0 account layout. The
      // SDK's convenience finalizeProposal() decodes through its newer account
      // layout first, which rejects these valid legacy accounts. Use the
      // explicitly decoded v0.6.0 fields to build the same finalize instruction.
      const dao = await client.v0_6_0_futarchy.account.dao.fetch(latest.dao);
      let crankSignature = null;
      let signature;
      try {
        signature = await client
          .finalizeProposalIx(candidate.publicKey, latest.squadsProposal, latest.dao, dao.baseMint, dao.quoteMint)
          .rpc();
      } catch (firstError) {
        if (errorDetails(firstError).code !== "TWAP_NOT_READY") throw firstError;
        crankSignature = await crankProposalTwap(client, keypair, candidate.publicKey, latest, dao);
        signature = await client
          .finalizeProposalIx(candidate.publicKey, latest.squadsProposal, latest.dao, dao.baseMint, dao.quoteMint)
          .rpc();
      }
      const finalized = await client.v0_6_0_futarchy.account.proposal.fetch(candidate.publicKey);
      results.push({
        ...proposalSummary(candidate.publicKey, finalized, now),
        outcome: "FINALIZED",
        signature,
        ...(crankSignature ? { crankSignature } : {}),
      });
    } catch (error) {
      console.error("[futarchy-keeper] finalize failed", {
        proposal: candidate.summary.proposal,
        message: error && error.message ? error.message : String(error),
        logs: Array.isArray(error && error.logs) ? error.logs : [],
      });
      const details = errorDetails(error);
      const refreshed = await client.v0_6_0_futarchy.account.proposal.fetch(candidate.publicKey).catch(() => null);
      if (refreshed && stateName(refreshed.state) !== "pending") {
        results.push({ ...proposalSummary(candidate.publicKey, refreshed, now), outcome: "FINALIZED_BY_ANOTHER_KEEPER" });
      } else {
        results.push({
          ...candidate.summary,
          outcome: details.code,
          retryable: details.retryable,
          error: details.message,
          ...(details.diagnostic ? { diagnostic: details.diagnostic } : {}),
        });
      }
    }
  }

  return {
    ok: true,
    cluster: "devnet",
    clusterTimestamp: now,
    keeper: dryRun ? null : keypair.publicKey.toBase58(),
    inspected: inspected.length,
    eligible: inspected.filter(({ summary }) => summary.eligible).length,
    results,
  };
}

module.exports = {
  allowedDaoAddresses,
  errorDetails,
  proposalSummary,
  runFutarchyKeeper,
  stateName,
};
