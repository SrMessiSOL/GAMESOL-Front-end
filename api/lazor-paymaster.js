const bs58 = require("bs58");
const crypto = require("node:crypto");
const {
  ComputeBudgetProgram,
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  Ed25519Program,
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  VersionedTransaction,
} = require("@solana/web3.js");

const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const LAZOR_PROGRAM_ID = new PublicKey("4h3XoNReAgEcHVxcZ8sw2aufi9MTr7BbvYYjzjWDyDxS");
const SECP256R1_PROGRAM_ID = new PublicKey("Secp256r1SigVerify1111111111111111111111111");
const GAME_STATE_PROGRAM_ID = new PublicKey(
  process.env.GAMESOL_GAME_PROGRAM_ID || "J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq",
);
const MARKET_PROGRAM_ID = new PublicKey(
  process.env.GAMESOL_MARKET_PROGRAM_ID || "6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA",
);
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const FUTARCHY_PROGRAM_ID = new PublicKey("FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq");
const CONDITIONAL_VAULT_PROGRAM_ID = new PublicKey("VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg");
const MAX_BODY_BYTES = 8_000;
const MAX_TRANSACTION_BYTES = 1_232;
const MAX_ROUTINE_DEBIT_LAMPORTS = 250_000;
const MAX_LAZOR_ACCOUNT_DEBIT_LAMPORTS = 5_000_000;
const MAX_GAME_RENT_DEBIT_LAMPORTS = 50_000_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_PER_WINDOW = 20;

const allowedPrograms = new Set([
  LAZOR_PROGRAM_ID.toBase58(),
  SECP256R1_PROGRAM_ID.toBase58(),
  ComputeBudgetProgram.programId.toBase58(),
  Ed25519Program.programId.toBase58(),
]);
const UFO_DOMAIN = Buffer.from('gamesol:ufo:devnet:v1');
const UFO_PROGRAM = require('../server/ufo-attestations.cjs').PROGRAM;
const UFO_COLLECTION = new PublicKey('53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb');
const UFO_ISSUER = new PublicKey('9XEL6rVQ2GK85ic1j2Nf6kykybsAtsP8nYzNnNCMun4a');
const UFO_ACTIONS = ['start_ufo_expedition', 'advance_ufo_expedition', 'claim_ufo_loot', 'set_commander_identity'].map(name => crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0,8));
const UFO_LOOKUP = require('../src/ufo-lookup-table.json');
const ALLIANCE_LOOKUP = require('../src/alliance-lookup-table.json');
const cachedTables = new Map();
const lookupManifest = key => [UFO_LOOKUP, ALLIANCE_LOOKUP].find(item => item.table === key.toBase58());

function resolvedTransactionKeys(message, tables = []) {
  if (!message.addressTableLookups?.length) return message.staticAccountKeys;
  if (message.addressTableLookups.length !== 1 || tables.length !== 1) throw new Error('Only the verified UFO address table may be used.');
  const lookup = message.addressTableLookups[0];
  const table = tables[0];
  const manifest = lookupManifest(lookup.accountKey);
  if (!manifest || !table.key.equals(lookup.accountKey)
    || table.state.authority || !table.isActive() || table.state.addresses.length !== manifest.addresses.length
    || table.state.addresses.some((address, index) => address.toBase58() !== manifest.addresses[index])) {
    throw new Error('UFO address table failed verification.');
  }
  const indexes = [...lookup.writableIndexes, ...lookup.readonlyIndexes];
  if (!indexes.length || new Set(indexes).size !== indexes.length || indexes.some(index => index >= table.state.addresses.length)) {
    throw new Error('Malformed UFO address table indexes.');
  }
  const keys = message.getAccountKeys({ addressLookupTableAccounts: tables });
  const resolved = Array.from({ length: keys.length }, (_, index) => keys.get(index));
  if (resolved.some(key => !key) || new Set(resolved.map(key => key.toBase58())).size !== resolved.length) throw new Error('Duplicate or unresolved transaction accounts.');
  return resolved;
}

async function fetchTransactionTables(connection, message) {
  if (!message.addressTableLookups?.length) return [];
  const manifest = lookupManifest(message.addressTableLookups[0].accountKey);
  if (message.addressTableLookups.length !== 1 || !manifest) {
    throw new Error('Only the verified UFO address table may be used.');
  }
  if (!cachedTables.has(manifest.table)) {
    const key = new PublicKey(manifest.table);
    const account = await connection.getAccountInfo(key, 'confirmed');
    if (!account || !account.owner.equals(AddressLookupTableProgram.programId)) throw new Error('UFO address table is unavailable.');
    const table = new AddressLookupTableAccount({ key, state: AddressLookupTableAccount.deserialize(account.data) });
    resolvedTransactionKeys(message, [table]);
    cachedTables.set(manifest.table, table);
  }
  return [cachedTables.get(manifest.table)];
}

function assertUfoPrecompile(instruction) {
  const data = Buffer.from(instruction.data);
  const commanderDomain = Buffer.from('gamesol:commander:devnet:v1');
  const domain = data.subarray(112, 112 + commanderDomain.length).equals(commanderDomain) ? commanderDomain : UFO_DOMAIN;
  const messageLength = domain.length + 32 * 5 + 8 + 2 + 32 * 2 + 8;
  if (instruction.accountKeyIndexes.length || data.length !== 112 + messageLength || data[0] !== 1 || data[1] !== 0
    || data.readUInt16LE(2) !== 48 || data.readUInt16LE(4) !== 65535
    || data.readUInt16LE(6) !== 16 || data.readUInt16LE(8) !== 65535
    || data.readUInt16LE(10) !== 112 || data.readUInt16LE(12) !== messageLength || data.readUInt16LE(14) !== 65535
    || !data.subarray(16,48).equals(UFO_ISSUER.toBuffer())
    || !data.subarray(112,112+domain.length+64).equals(Buffer.concat([domain,UFO_PROGRAM.toBuffer(),UFO_COLLECTION.toBuffer()]))) {
    throw new Error('Only canonical GAMESOL UFO ownership proofs may be sponsored.');
  }
  return domain.equals(commanderDomain) ? 'commander' : 'expedition';
}
const rateWindows = new Map();
const RENT_SPONSOR_DISCRIMINATOR = Buffer.from([87, 113, 100, 97, 218, 156, 201, 21]);
const RENT_CREATING_DISCRIMINATORS = [
  crypto.createHash('sha256').update('global:set_commander_identity').digest().subarray(0,8),
  crypto.createHash('sha256').update('global:start_ufo_expedition').digest().subarray(0,8),
  // Permanent player + worlds.
  Buffer.from([189, 138, 205, 113, 18, 169, 30, 95]),
  Buffer.from([124, 7, 81, 167, 80, 191, 227, 173]),
  Buffer.from([91, 184, 105, 243, 90, 175, 137, 217]),
  // Quest migrations and paid-store purchase history.
  Buffer.from([228, 241, 34, 120, 153, 28, 158, 130]),
  Buffer.from([180, 174, 237, 53, 63, 6, 200, 222]),
  Buffer.from([248, 232, 250, 30, 79, 249, 214, 115]),
  Buffer.from([112, 75, 157, 242, 238, 109, 2, 252]),
  // Alliance membership, treasury, governance, decisions, and sovereignty.
  Buffer.from([201, 92, 183, 64, 131, 82, 174, 203]),
  Buffer.from([237, 35, 212, 158, 181, 98, 153, 166]),
  Buffer.from([194, 192, 5, 193, 32, 45, 240, 140]),
  Buffer.from([155, 51, 199, 71, 35, 84, 237, 59]),
  Buffer.from([60, 88, 8, 162, 213, 206, 46, 178]),
  Buffer.from([47, 188, 187, 250, 22, 115, 107, 127]),
  Buffer.from([46, 144, 196, 52, 81, 71, 246, 16]),
  Buffer.from([2, 217, 240, 33, 148, 170, 13, 111]),
  Buffer.from([213, 200, 82, 25, 118, 156, 175, 121]),
];
const MARKET_RENT_CREATING_DISCRIMINATORS = [
  // Player-created resource offer and planet listing accounts.
  Buffer.from([237, 233, 192, 168, 248, 7, 249, 241]),
  Buffer.from([168, 189, 82, 35, 166, 138, 116, 61]),
];
const MARKET_ATA_COMPANION_DISCRIMINATORS = [
  Buffer.from([227, 82, 234, 131, 1, 18, 48, 2]),
  Buffer.from([48, 116, 122, 166, 251, 1, 167, 31]),
];
const FUTARCHY_ATA_COMPANION_DISCRIMINATORS = [
  // conditional_swap
  Buffer.from([194, 136, 220, 89, 242, 169, 130, 157]),
];
const CONDITIONAL_VAULT_ATA_COMPANION_DISCRIMINATORS = [
  // split_tokens and redeem_tokens
  Buffer.from([79, 195, 116, 0, 140, 176, 73, 179]),
  Buffer.from([246, 98, 134, 41, 152, 33, 120, 69]),
];
let cachedGenesisHash = null;
let cachedGenesisAt = 0;

function jsonRpcError(res, id, code, message, status = 400) {
  return res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: id ?? null });
}

function requestOriginMatchesHost(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const requestHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
    return originHost === requestHost;
  } catch {
    return false;
  }
}

function sponsorFromEnv() {
  const raw = process.env.GAMESOL_DEVNET_SPONSOR_SECRET;
  if (!raw) throw new Error("The devnet sponsor is not configured.");
  const value = raw.trim();
  const secret = value.startsWith("[")
    ? Uint8Array.from(JSON.parse(value))
    : bs58.decode(value);
  return Keypair.fromSecretKey(secret);
}

function parseBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  if (!req.body) return {};
  return JSON.parse(req.body);
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function enforceRateLimit(req) {
  const key = clientIp(req);
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > RATE_LIMIT_PER_WINDOW) throw new Error("Too many sponsored requests. Wait one minute and try again.");
}

async function assertDevnet(connection) {
  if (cachedGenesisHash === DEVNET_GENESIS_HASH && cachedGenesisAt > Date.now() - 5 * 60_000) return;
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== DEVNET_GENESIS_HASH) throw new Error("The sponsor is restricted to Solana devnet.");
  cachedGenesisHash = genesisHash;
  cachedGenesisAt = Date.now();
}

function decodeTransaction(encoded) {
  if (typeof encoded !== "string" || encoded.length === 0) throw new Error("A base64 transaction is required.");
  const raw = Buffer.from(encoded, "base64");
  if (raw.length === 0 || raw.length > MAX_TRANSACTION_BYTES) throw new Error("Transaction size is not allowed.");
  return { raw, transaction: VersionedTransaction.deserialize(raw) };
}

function parseCompactInstructions(message, outerInstruction, keys = message.staticAccountKeys) {
  const data = Buffer.from(outerInstruction.data);
  if (data.length < 2 || data[0] !== 4) return [];
  const count = data[1];
  const parsed = [];
  let offset = 2;
  for (let index = 0; index < count; index += 1) {
    if (offset + 2 > data.length) throw new Error("Malformed Lazor execute instruction.");
    const programIdIndex = data[offset];
    const accountCount = data[offset + 1];
    offset += 2;
    if (offset + accountCount + 2 > data.length) throw new Error("Malformed Lazor execute accounts.");
    const compactAccountIndexes = data.subarray(offset, offset + accountCount);
    const accounts = Array.from(compactAccountIndexes, (compactIndex) => {
      const globalIndex = outerInstruction.accountKeyIndexes[compactIndex];
      const account = keys[globalIndex];
      if (!account) throw new Error("Lazor command contains an unresolved account.");
      return account;
    });
    offset += accountCount;
    const dataLength = data.readUInt16LE(offset);
    offset += 2;
    if (offset + dataLength > data.length) throw new Error("Malformed Lazor execute payload.");
    const globalProgramIndex = outerInstruction.accountKeyIndexes[programIdIndex];
    const programId = keys[globalProgramIndex];
    if (!programId) throw new Error("Lazor command contains an unresolved program.");
    parsed.push({ programId, accounts, data: data.subarray(offset, offset + dataLength) });
    offset += dataLength;
  }
  return parsed;
}

function isDiscriminator(data, expected) {
  return data.length >= expected.length && Buffer.from(data.subarray(0, expected.length)).equals(expected);
}

function canonicalAssociatedTokenAccount(instruction) {
  if (!instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) return null;
  if (!(instruction.data.length === 0 || (instruction.data.length === 1 && instruction.data[0] === 1))) return null;
  if (!(instruction.accounts.length === 6 || instruction.accounts.length === 7)) return null;
  const [payer, ata, owner, mint, systemProgram, tokenProgram] = instruction.accounts;
  if (!systemProgram.equals(SystemProgram.programId)) return null;
  if (!tokenProgram.equals(TOKEN_PROGRAM_ID)) return null;
  if (instruction.accounts.length === 7 && !instruction.accounts[6].equals(SYSVAR_RENT_PUBKEY)) return null;
  const expected = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
  if (!ata.equals(expected)) return null;
  return { payer, ata };
}

function approvedRentPolicy(innerInstructions) {
  if (innerInstructions.length < 2) return false;
  let hasSponsor = false;
  let hasAccountCreation = false;
  let sponsorReceiver = null;
  let hasAtaCompanion = false;
  const owners = new Set();
  const accounts = new Set();
  for (const instruction of innerInstructions) {
    if (
      instruction.programId.equals(GAME_STATE_PROGRAM_ID)
      && isDiscriminator(instruction.data, RENT_SPONSOR_DISCRIMINATOR)
    ) {
      hasSponsor = true;
      if (instruction.accounts.length !== 3) return false;
      sponsorReceiver = instruction.accounts[1];
      continue;
    }
    if (
      instruction.programId.equals(GAME_STATE_PROGRAM_ID)
      && RENT_CREATING_DISCRIMINATORS.some((discriminator) => isDiscriminator(instruction.data, discriminator))
    ) {
      hasAccountCreation = true;
      owners.add(GAME_STATE_PROGRAM_ID.toBase58());
      continue;
    }
    if (
      instruction.programId.equals(MARKET_PROGRAM_ID)
      && MARKET_RENT_CREATING_DISCRIMINATORS.some((discriminator) => isDiscriminator(instruction.data, discriminator))
    ) {
      hasAccountCreation = true;
      owners.add(MARKET_PROGRAM_ID.toBase58());
      continue;
    }
    const canonicalAta = canonicalAssociatedTokenAccount(instruction);
    if (canonicalAta) {
      if (!sponsorReceiver || !canonicalAta.payer.equals(sponsorReceiver)) return false;
      hasAccountCreation = true;
      accounts.add(canonicalAta.ata.toBase58());
      continue;
    }
    if (
      instruction.programId.equals(MARKET_PROGRAM_ID)
      && MARKET_ATA_COMPANION_DISCRIMINATORS.some((discriminator) => isDiscriminator(instruction.data, discriminator))
    ) {
      hasAtaCompanion = true;
      continue;
    }
    if (
      instruction.programId.equals(FUTARCHY_PROGRAM_ID)
      && FUTARCHY_ATA_COMPANION_DISCRIMINATORS.some((discriminator) => isDiscriminator(instruction.data, discriminator))
    ) {
      hasAtaCompanion = true;
      continue;
    }
    if (
      instruction.programId.equals(CONDITIONAL_VAULT_PROGRAM_ID)
      && CONDITIONAL_VAULT_ATA_COMPANION_DISCRIMINATORS.some((discriminator) => isDiscriminator(instruction.data, discriminator))
    ) {
      hasAtaCompanion = true;
      continue;
    }
    return false;
  }
  if (!(hasSponsor && hasAccountCreation)) return false;
  if (accounts.size > 0 && !hasAtaCompanion) return false;
  return { ownerAddresses: [...owners], accountAddresses: [...accounts] };
}

function isApprovedRentBundle(innerInstructions) {
  return approvedRentPolicy(innerInstructions) !== false;
}

function isCompressedStoreBundle(inner, sponsor) {
  if (inner.length < 1 || inner.length > 2) return false;
  const purchase = inner[inner.length - 1];
  const data = purchase.data;
  if (!purchase.programId.equals(GAME_STATE_PROGRAM_ID) || purchase.accounts.length !== 11
    || data.length !== 10 || !isDiscriminator(data, Buffer.from([112, 75, 157, 242, 238, 109, 2, 252]))) return false;
  const [period, pack] = data.subarray(8);
  if (![1, 2, 3].includes(period) || !(pack === 16 || pack <= (period === 3 ? 9 : 5))) return false;
  const owner = purchase.accounts[0];
  const pda = seed => PublicKey.findProgramAddressSync([Buffer.from(seed), owner.toBuffer()], GAME_STATE_PROGRAM_ID)[0];
  const config = PublicKey.findProgramAddressSync([Buffer.from('store_config')], GAME_STATE_PROGRAM_ID)[0];
  if (!purchase.accounts[1].equals(config) || !purchase.accounts[2].equals(pda('store_purchase_state'))
    || !purchase.accounts[4].equals(new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'))
    || !purchase.accounts[7].equals(TOKEN_PROGRAM_ID) || !purchase.accounts[8].equals(SystemProgram.programId)
    || !purchase.accounts[9].equals(pda('quest_progress')) || !purchase.accounts[10].equals(pda('quest_reward_targets'))) return false;
  if (inner.length === 1) return true;
  const rent = inner[0];
  return Boolean(approvedRentPolicy(inner)) && rent.data.length === 16
    && rent.accounts[0].equals(sponsor.publicKey) && rent.accounts[1].equals(owner)
    && rent.accounts[2].equals(SystemProgram.programId);
}

function isCompressedAllianceBundle(inner, sponsor) {
  if (inner.length < 1 || inner.length > 2) return false;
  const create = inner.at(-1);
  const data = create.data;
  if (!create.programId.equals(GAME_STATE_PROGRAM_ID) || create.accounts.length !== 15
    || !isDiscriminator(data, Buffer.from([201, 92, 183, 64, 131, 82, 174, 203]))) return false;
  let offset = 8;
  const strings = [];
  for (const max of [32, 3, 160]) {
    if (offset + 4 > data.length) return false;
    const size = data.readUInt32LE(offset); offset += 4;
    if (size > max || offset + size > data.length) return false;
    const bytes = data.subarray(offset, offset + size);
    const value = bytes.toString('utf8');
    if (!Buffer.from(value).equals(bytes)) return false;
    strings.push(value); offset += size;
  }
  if (offset !== data.length || !strings[0].trim() || strings[0] !== strings[0].trim() || !/^[A-Z]{3}$/.test(strings[1])) return false;
  const owner = create.accounts[0];
  const pda = (seed, account) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...(account ? [account.toBuffer()] : [])], GAME_STATE_PROGRAM_ID)[0];
  const am = new PublicKey(ALLIANCE_LOOKUP.antimatterMint), usdc = new PublicKey(ALLIANCE_LOOKUP.usdcMint);
  const ata = mint => PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0];
  const alliance = pda('alliance', owner);
  const expected = [owner, pda('player_profile', owner), alliance, pda('alliance_metadata', alliance), pda('alliance_membership', owner),
    pda('game_config'), pda('store_config'), am, ata(am), new PublicKey(ALLIANCE_LOOKUP.treasuryAntimatter),
    usdc, ata(usdc), new PublicKey(ALLIANCE_LOOKUP.treasuryUsdc), TOKEN_PROGRAM_ID, SystemProgram.programId];
  if (expected.some((key, index) => !create.accounts[index].equals(key))) return false;
  if (inner.length === 1) return true;
  const rent = inner[0];
  return Boolean(approvedRentPolicy(inner)) && rent.data.length === 16 && rent.accounts.length === 3
    && rent.accounts[0].equals(sponsor.publicKey) && rent.accounts[1].equals(owner) && rent.accounts[2].equals(SystemProgram.programId);
}

function assertTransactionPolicy(transaction, sponsor, tables = []) {
  const message = transaction.message;
  const keys = resolvedTransactionKeys(message, tables);
  if (!keys?.[0]?.equals(sponsor.publicKey)) throw new Error("The configured sponsor must be the transaction fee payer.");

  let hasLazorInstruction = false;
  let ufoPrecompiles = 0;
  let hasUfoAction = false;
  let proofPurpose = null;
  let hasCommanderAction = false;
  let passkeyPrecompiles = 0;
  let executeCount = 0;
  let lazorCount = 0;
  let hasCompressedStore = false;
  let hasCompressedAlliance = false;
  let maximumDebit = MAX_ROUTINE_DEBIT_LAMPORTS;
  let approvedRentBundle = false;
  let approvedRentOwnerAddresses = [];
  let approvedRentAccountAddresses = [];
  for (const instruction of message.compiledInstructions) {
    const program = keys[instruction.programIdIndex];
    if (!program) throw new Error("Transaction contains an unresolved program.");
    const programAddress = program.toBase58();
    if (!allowedPrograms.has(programAddress)) {
      throw new Error(`Program ${programAddress} is not allowed by the GAMESOL devnet sponsor.`);
    }
    if (program.equals(Ed25519Program.programId)) {
      proofPurpose = assertUfoPrecompile(instruction);
      if (++ufoPrecompiles > 1 || hasLazorInstruction) throw new Error('UFO proof must execute once before the Lazor command.');
    }
    if (program.equals(SECP256R1_PROGRAM_ID)) {
      if (tables.length && hasLazorInstruction) throw new Error('Passkey verification must precede the wallet command.');
      passkeyPrecompiles += 1;
    }
    if (program.equals(LAZOR_PROGRAM_ID)) {
      lazorCount += 1;
      hasLazorInstruction = true;
      const discriminator = Buffer.from(instruction.data)[0];
      if (discriminator === 0 || discriminator === 1 || discriminator === 5) {
        maximumDebit = Math.max(maximumDebit, MAX_LAZOR_ACCOUNT_DEBIT_LAMPORTS);
      } else if (discriminator === 4) {
        executeCount += 1;
        const innerInstructions = parseCompactInstructions(message, instruction, keys);
        hasCompressedStore = isCompressedStoreBundle(innerInstructions, sponsor);
        hasCompressedAlliance = isCompressedAllianceBundle(innerInstructions, sponsor);
        hasUfoAction ||= innerInstructions.some(inner => inner.programId.equals(UFO_PROGRAM) && UFO_ACTIONS.slice(0,3).some(discriminator => isDiscriminator(inner.data,discriminator)));
        hasCommanderAction ||= innerInstructions.some(inner => inner.programId.equals(UFO_PROGRAM) && isDiscriminator(inner.data,UFO_ACTIONS[3]));
        const rentPolicy = approvedRentPolicy(innerInstructions);
        if (rentPolicy) {
          approvedRentBundle = true;
          approvedRentOwnerAddresses = rentPolicy.ownerAddresses;
          approvedRentAccountAddresses = rentPolicy.accountAddresses;
          maximumDebit = MAX_GAME_RENT_DEBIT_LAMPORTS;
        }
      }
    }
  }
  if (!hasLazorInstruction) throw new Error("A sponsored transaction must contain a Lazor wallet instruction.");
  const matchingUfoAction = proofPurpose === 'commander' ? hasCommanderAction : hasUfoAction;
  if (ufoPrecompiles && !matchingUfoAction) throw new Error('UFO ownership proof requires a matching UFO gameplay action.');
  if (tables.length && tables[0].key.toBase58() === ALLIANCE_LOOKUP.table) {
    if (!(ufoPrecompiles === 0 && passkeyPrecompiles === 1 && lazorCount === 1 && executeCount === 1 && hasCompressedAlliance)) {
      throw new Error('Alliance address table requires one canonical passkey-approved alliance creation.');
    }
  } else if (tables.length && !(ufoPrecompiles && matchingUfoAction)
    && !(ufoPrecompiles === 0 && passkeyPrecompiles === 1 && lazorCount === 1 && executeCount === 1 && hasCompressedStore)) {
    throw new Error('Address tables are restricted to verified UFO gameplay or passkey store purchases.');
  }
  return { maximumDebit, approvedRentBundle, approvedRentOwnerAddresses, approvedRentAccountAddresses };
}

async function simulateAndMeasure(connection, transaction, sponsor, policy, tables = []) {
  const message = transaction.message;
  const writableKeys = resolvedTransactionKeys(message, tables).filter((_, index) => message.isAccountWritable(index));
  const addresses = writableKeys.map((key) => key.toBase58());
  const [beforeAccounts, simulation] = await Promise.all([
    connection.getMultipleAccountsInfo(writableKeys, "confirmed"),
    connection.simulateTransaction(transaction, {
      commitment: "confirmed",
      sigVerify: true,
      accounts: { encoding: "base64", addresses },
    }),
  ]);
  if (simulation.value.err) {
    const relevantLogs = simulation.value.logs?.slice(-8).join(" | ");
    throw new Error(
      relevantLogs
        ? `Transaction simulation failed (${JSON.stringify(simulation.value.err)}): ${relevantLogs}`
        : `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`,
    );
  }
  const sponsorIndex = writableKeys.findIndex((key) => key.equals(sponsor.publicKey));
  const sponsorBefore = beforeAccounts[sponsorIndex]?.lamports ?? 0;
  const sponsorAfter = simulation.value.accounts?.[sponsorIndex];
  if (!sponsorAfter) throw new Error("Could not verify the sponsor balance after simulation.");
  const debit = Math.max(0, sponsorBefore - sponsorAfter.lamports);
  if (debit > policy.maximumDebit) {
    throw new Error("This transaction exceeds the devnet sponsorship limit.");
  }
  if (policy.approvedRentBundle) {
    const approvedOwners = new Set(policy.approvedRentOwnerAddresses);
    const approvedAccounts = new Set(policy.approvedRentAccountAddresses);
    const sponsoredRentCreated = (simulation.value.accounts ?? []).reduce((total, after, index) => {
      if (!after) return total;
      const address = writableKeys[index]?.toBase58();
      const isApprovedOwner = approvedOwners.has(after.owner);
      const isApprovedAta = approvedAccounts.has(address) && after.owner === TOKEN_PROGRAM_ID.toBase58();
      if (!isApprovedOwner && !isApprovedAta) return total;
      const beforeLamports = beforeAccounts[index]?.lamports ?? 0;
      return total + Math.max(0, after.lamports - beforeLamports);
    }, 0);
    if (debit > sponsoredRentCreated + MAX_ROUTINE_DEBIT_LAMPORTS) {
      throw new Error("Sponsored rent must be consumed by GAMESOL accounts in the same command.");
    }
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requestOriginMatchesHost(req)) {
    return jsonRpcError(res, null, -32001, "Origin not allowed.", 403);
  }

  const serializedBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(serializedBody, "utf8") > MAX_BODY_BYTES) {
    return jsonRpcError(res, null, -32600, "Request is too large.", 413);
  }

  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return jsonRpcError(res, null, -32700, "Invalid JSON.");
  }
  const id = payload.id ?? null;

  try {
    const sponsor = sponsorFromEnv();
    const rpcUrl = process.env.SOLANA_RPC_URL
      || process.env.GAMESOL_RPC_PROXY_TARGET
      || process.env.VITE_SOLANA_RPC_ENDPOINT
      || DEFAULT_RPC_URL;
    const connection = new Connection(rpcUrl, "confirmed");
    await assertDevnet(connection);

    if (payload.method === "getPayerSigner") {
      return res.status(200).json({
        jsonrpc: "2.0",
        result: { signer_address: sponsor.publicKey.toBase58(), payment_address: sponsor.publicKey.toBase58() },
        id,
      });
    }
    if (payload.method === "getBlockhash") {
      const latest = await connection.getLatestBlockhash("confirmed");
      return res.status(200).json({ jsonrpc: "2.0", result: latest, id });
    }
    if (payload.method !== "signAndSendTransaction") {
      return jsonRpcError(res, id, -32601, "Method not found.");
    }

    enforceRateLimit(req);
    const encoded = payload.params?.transaction;
    const requestedSigner = payload.params?.signer_key;
    if (requestedSigner && requestedSigner !== sponsor.publicKey.toBase58()) {
      throw new Error("Requested signer does not match the configured sponsor.");
    }
    const { transaction } = decodeTransaction(encoded);
    const tables = await fetchTransactionTables(connection, transaction.message);
    const policy = assertTransactionPolicy(transaction, sponsor, tables);
    transaction.sign([sponsor]);
    await simulateAndMeasure(connection, transaction, sponsor, policy, tables);
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 4,
    });
    return res.status(200).json({ jsonrpc: "2.0", result: { signature }, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sponsored transaction failed.";
    const rateLimited = /too many sponsored requests/i.test(message);
    // Kora-compatible clients read the JSON-RPC error body only for successful
    // HTTP responses. Keep policy/simulation failures at HTTP 200 so the UI
    // receives the real on-chain diagnostic instead of an empty status text.
    return jsonRpcError(res, id, -32000, message, rateLimited ? 429 : 200);
  }
};

module.exports._test = {
  assertTransactionPolicy,
  isApprovedRentBundle,
  parseCompactInstructions,
  resolvedTransactionKeys,
  fetchTransactionTables,
  simulateAndMeasure,
};
