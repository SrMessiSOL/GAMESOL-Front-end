const fs = require("fs");
const bs58 = require("bs58");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

function parseEnvFile(filePath) {
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1].trim()] = value.replace(/\\n/g, "\n");
  }
  return values;
}

function keypairFromSecret(raw) {
  if (!raw) throw new Error("The devnet funding authority is not configured.");
  const trimmed = raw.trim();
  return Keypair.fromSecretKey(
    trimmed.startsWith("[") ? Uint8Array.from(JSON.parse(trimmed)) : bs58.decode(trimmed),
  );
}

async function main() {
  const [envPath, destinationText, amountText = "0.25"] = process.argv.slice(2);
  if (!envPath || !destinationText) {
    throw new Error("Usage: node scripts/fund-devnet-sponsor.cjs <env-file> <destination> [SOL]");
  }

  const env = parseEnvFile(envPath);
  const connection = new Connection(
    env.SOLANA_RPC_URL || env.VITE_SOLANA_RPC_ENDPOINT || "https://api.devnet.solana.com",
    "confirmed",
  );
  if (await connection.getGenesisHash() !== DEVNET_GENESIS_HASH) {
    throw new Error("Refusing to fund outside Solana devnet.");
  }

  const authority = keypairFromSecret(
    env.ANTIMATTER_FAUCET_SECRET_KEY
      || env.FAUCET_SECRET_KEY
      || env.FUTARCHY_KEEPER_SECRET_KEY,
  );
  const destination = new PublicKey(destinationText);
  const lamports = Math.round(Number(amountText) * 1_000_000_000);
  if (!Number.isSafeInteger(lamports) || lamports <= 0 || lamports > 500_000_000) {
    throw new Error("Funding amount must be greater than 0 and no more than 0.5 devnet SOL.");
  }
  if (authority.publicKey.equals(destination)) throw new Error("Funding source and destination must differ.");

  const sourceBalance = await connection.getBalance(authority.publicKey, "confirmed");
  if (sourceBalance < lamports + 10_000) {
    throw new Error(`Devnet funding authority has insufficient test SOL (${sourceBalance} lamports).`);
  }

  const transaction = new Transaction().add(SystemProgram.transfer({
    fromPubkey: authority.publicKey,
    toPubkey: destination,
    lamports,
  }));
  const signature = await sendAndConfirmTransaction(connection, transaction, [authority], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const destinationBalance = await connection.getBalance(destination, "confirmed");
  process.stdout.write(JSON.stringify({
    source: authority.publicKey.toBase58(),
    destination: destination.toBase58(),
    lamports,
    destinationBalance,
    signature,
  }));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
