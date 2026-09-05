import * as anchor from "@coral-xyz/anchor";
import * as multisig from "@sqds/multisig";
import { PERMISSIONLESS_ACCOUNT } from "@metadaoproject/programs";
import { FutarchyClient } from "@metadaoproject/programs/futarchy/v0.6";
import { PublicKey, Transaction } from "@solana/web3.js";

const EXPECTED_DAO = new PublicKey("DAU9JQSN6kVffGBUnMyDXv1AfQWoCUfdWAxPuE8BH9un");
const EXPECTED_PROPOSAL = new PublicKey("Bmq1wRF5DCZyFp3E3ZfeUg1sFWxhTN3xkvgeXPcp7Dsm");
const EXPECTED_SQUADS_PROPOSAL = new PublicKey("14oMFXpZYd3vHoyucF9WFTwmHDufP9YxxHHS8HTQaCEj");
const EXPECTED_MULTISIG = new PublicKey("AQ6GiFiHWs23PYn6GdMkx2cxq6mZSLYX6ESCEB7MpiFh");
const EXPECTED_TRANSACTION_INDEX = 1n;
const DECISION = new PublicKey("GoBLqBewgFVsKEUvCTQ43BHBfyQXG4AqtMBFVv6qCWcY");
const SOVEREIGNTY = new PublicKey("6DjJFfSuWoSt6vQ6oxZrZsAwrKeCN6qtdAbkpjddqe8r");

function normalizedKey(value) {
  return new PublicKey(typeof value === "string" ? value : value.toBase58());
}

function assertAddress(actual, expected, label) {
  const normalized = normalizedKey(actual);
  if (!normalized.equals(expected)) {
    throw new Error(`${label} mismatch: expected ${expected.toBase58()}, got ${normalized.toBase58()}`);
  }
}

async function readExecutionState(connection) {
  const [decisionInfo, sovereigntyInfo] = await connection.getMultipleAccountsInfo(
    [DECISION, SOVEREIGNTY],
    "confirmed",
  );
  if (!decisionInfo || decisionInfo.data.length < 178) {
    throw new Error(`Game decision ${DECISION.toBase58()} is missing or malformed.`);
  }
  return {
    executed: decisionInfo.data[176] === 1,
    sovereigntyExists: sovereigntyInfo !== null,
  };
}

async function main() {
  const shouldSend = process.argv.includes("--send");
  const provider = anchor.AnchorProvider.env();
  const payer = provider.wallet.payer;
  if (!payer) throw new Error("ANCHOR_WALLET must point to a local devnet fee-payer keypair.");
  const futarchy = FutarchyClient.createClient({ provider });

  const before = await readExecutionState(provider.connection);
  if (before.executed && before.sovereigntyExists) {
    console.log("Decision is already executed and G6:S175 sovereignty exists.");
    return;
  }
  if (before.executed !== before.sovereigntyExists) {
    throw new Error(`Inconsistent game state: ${JSON.stringify(before)}`);
  }

  const [proposal, dao] = await Promise.all([
    futarchy.v0_6_0_futarchy.account.proposal.fetch(EXPECTED_PROPOSAL),
    futarchy.v0_6_0_futarchy.account.dao.fetch(EXPECTED_DAO),
  ]);
  assertAddress(proposal.dao, EXPECTED_DAO, "Futarchy DAO");
  assertAddress(proposal.squadsProposal, EXPECTED_SQUADS_PROPOSAL, "Squads proposal");
  const proposalState = Object.keys(proposal.state)[0] ?? "unknown";
  if (proposalState !== "passed") {
    throw new Error(`Proposal is not executable: expected passed, got ${proposalState}.`);
  }
  assertAddress(dao.squadsMultisig, EXPECTED_MULTISIG, "DAO Squads multisig");

  const squadsProposal = await multisig.accounts.Proposal.fromAccountAddress(
    provider.connection,
    EXPECTED_SQUADS_PROPOSAL,
  );
  const transactionIndex = BigInt(squadsProposal.transactionIndex.toString());
  if (transactionIndex !== EXPECTED_TRANSACTION_INDEX) {
    throw new Error(
      `Squads transaction mismatch: expected ${EXPECTED_TRANSACTION_INDEX}, got ${transactionIndex}.`,
    );
  }

  const execute = await multisig.instructions.vaultTransactionExecute({
    connection: provider.connection,
    multisigPda: EXPECTED_MULTISIG,
    transactionIndex,
    member: PERMISSIONLESS_ACCOUNT.publicKey,
  });
  const latest = await provider.connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(execute.instruction);
  transaction.sign(payer, PERMISSIONLESS_ACCOUNT);

  const simulation = await provider.connection.simulateTransaction(transaction);
  if (simulation.value.err) {
    console.error(simulation.value.logs?.join("\n"));
    throw new Error(`Execution simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }
  console.log("Simulation passed for the exact G6:S175 claim transaction.");
  if (!shouldSend) {
    console.log("Dry run only. Re-run with --send to execute on devnet.");
    return;
  }

  const signature = await provider.connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
  });
  await provider.connection.confirmTransaction({ signature, ...latest }, "confirmed");
  console.log(`Executed G6:S175 claim: ${signature}`);
  const after = await readExecutionState(provider.connection);
  if (!after.executed || !after.sovereigntyExists) {
    throw new Error(`Transaction confirmed but game state was not updated: ${JSON.stringify(after)}`);
  }
  console.log(`Decision ${DECISION.toBase58()}: executed`);
  console.log(`Sovereignty ${SOVEREIGNTY.toBase58()}: created`);
}

main().catch((error) => {
  console.error(error);
  if (error?.logs) console.error(error.logs.join("\n"));
  process.exit(1);
});
