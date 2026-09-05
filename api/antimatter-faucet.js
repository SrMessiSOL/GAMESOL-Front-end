const crypto = require("crypto");
const bs58 = require("bs58");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} = require("@solana/web3.js");

const GAME_STATE_PROGRAM_ID = new PublicKey(process.env.GAME_STATE_PROGRAM_ID || process.env.VITE_GAME_STATE_PROGRAM_ID || "FJGxh6SKgNoTVzHj98oBsC2oaEy8ovadVJf8rDUNaEHb");
const ANTIMATTER_MINT = new PublicKey(process.env.ANTIMATTER_MINT || process.env.VITE_ANTIMATTER_MINT || "FAeZLeqohcxNBpwGrbYBLj2TavFqt4353mT6qY6Z7YFh");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const SOLANA_CLUSTER = (process.env.SOLANA_CLUSTER || process.env.VITE_SOLANA_CLUSTER || "devnet").trim().toLowerCase();
const IS_MAINNET = SOLANA_CLUSTER === "mainnet" || SOLANA_CLUSTER === "mainnet-beta";
const PLAYER_PROFILE_ACCOUNT_SIZE = 8 + 32 + 4 + 1;
const PLAYER_PROFILE_DISCRIMINATOR = crypto
  .createHash("sha256")
  .update("account:PlayerProfile")
  .digest()
  .subarray(0, 8);

function faucetAuthorityFromEnv() {
  const raw = process.env.ANTIMATTER_FAUCET_SECRET_KEY || process.env.FAUCET_SECRET_KEY;
  if (!raw) throw new Error("ANTIMATTER_FAUCET_SECRET_KEY is not configured.");
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

function deriveAssociatedTokenAccount(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

function createAssociatedTokenAccountInstruction(payer, ata, owner, mint) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

function derivePlayerProfile(wallet) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player_profile"), wallet.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

function isInitializedPlayerProfile(accountInfo, wallet) {
  if (!accountInfo || !accountInfo.owner.equals(GAME_STATE_PROGRAM_ID)) return false;

  const data = Buffer.from(accountInfo.data);
  return data.length >= PLAYER_PROFILE_ACCOUNT_SIZE
    && data.subarray(0, 8).equals(PLAYER_PROFILE_DISCRIMINATOR)
    && data.subarray(8, 40).equals(wallet.toBuffer());
}

function claimFaucetInstruction(faucetAuthority, recipient, recipientAta) {
  const discriminator = crypto
    .createHash("sha256")
    .update("global:claim_antimatter_faucet")
    .digest()
    .subarray(0, 8);
  const faucetClaim = PublicKey.findProgramAddressSync(
    [Buffer.from("antimatter_faucet"), recipient.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];

  return new TransactionInstruction({
    programId: GAME_STATE_PROGRAM_ID,
    keys: [
      { pubkey: faucetAuthority, isSigner: true, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: false },
      { pubkey: faucetClaim, isSigner: false, isWritable: true },
      { pubkey: ANTIMATTER_MINT, isSigner: false, isWritable: true },
      { pubkey: recipientAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: discriminator,
  });
}

function parseBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  if (!req.body) return {};
  return JSON.parse(req.body);
}

function errorMessage(error) {
  const logs = error?.logs || error?.transactionLogs;
  if (Array.isArray(logs) && logs.some(line => line.includes("FaucetCooldownActive"))) {
    return "Faucet already claimed for this wallet. Try again after 24 hours.";
  }
  if (Array.isArray(logs) && logs.length) return logs.join("\n");
  return error?.message || "Faucet claim failed.";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (IS_MAINNET) {
    return res.status(404).json({ error: "Not found." });
  }

  try {
    const { wallet } = parseBody(req);
    const recipient = new PublicKey(wallet);
    const faucetAuthority = faucetAuthorityFromEnv();
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.VITE_SOLANA_RPC_ENDPOINT || DEFAULT_RPC_URL;
    const connection = new Connection(rpcUrl, "confirmed");
    const playerProfile = derivePlayerProfile(recipient);
    const profileInfo = await connection.getAccountInfo(playerProfile, "confirmed");
    if (!isInitializedPlayerProfile(profileInfo, recipient)) {
      return res.status(403).json({ error: "Initialize your game profile before claiming devnet ANTIMATTER." });
    }
    const recipientAta = deriveAssociatedTokenAccount(recipient, ANTIMATTER_MINT);
    const instructions = [];

    const ataInfo = await connection.getAccountInfo(recipientAta, "confirmed");
    if (!ataInfo) {
      instructions.push(createAssociatedTokenAccountInstruction(
        faucetAuthority.publicKey,
        recipientAta,
        recipient,
        ANTIMATTER_MINT,
      ));
    }
    instructions.push(claimFaucetInstruction(faucetAuthority.publicKey, recipient, recipientAta));

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: faucetAuthority.publicKey, blockhash, lastValidBlockHeight });
    tx.add(...instructions);
    tx.sign(faucetAuthority);

    const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return res.status(200).json({
      signature,
      amount: "10000",
      mint: ANTIMATTER_MINT.toBase58(),
      recipientTokenAccount: recipientAta.toBase58(),
    });
  } catch (error) {
    const message = errorMessage(error);
    const cooldown = message.toLowerCase().includes("cooldown") || message.includes("0x17");
    return res.status(cooldown ? 429 : 400).json({ error: message });
  }
};
