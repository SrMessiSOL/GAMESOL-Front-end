/**
 * market-client.ts
 *
 * P2P resource-for-ANTIMATTER market client for Chained Universe.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  SendTransactionError,
} from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import bs58 from "bs58";
import {
  derivePlanetCoordsPda,
  derivePlanetOwnerIndexPda,
  derivePlayerProfilePda,
  type GameClient,
  type PlayerState,
} from "./game-state";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const SOLANA_CLUSTER = (env.VITE_SOLANA_CLUSTER?.trim() || "devnet").toLowerCase();

function envPublicKey(name: string, fallback: string): PublicKey {
  const configured = env[name]?.trim();
  if (!configured && (SOLANA_CLUSTER === "mainnet" || SOLANA_CLUSTER === "mainnet-beta")) {
    throw new Error(`${name} is required when VITE_SOLANA_CLUSTER=mainnet.`);
  }
  const value = configured || fallback;
  return new PublicKey(value);
}
// ─── Constants ─────────────────────────────────────────────────────────────────

export const MARKET_PROGRAM_ID = envPublicKey(
  "VITE_MARKET_PROGRAM_ID",
  "Dow7f1UqLGKyvs1D2uNR5c6bmAdnKRy2ZDtnsa4UhApp",
);

export const GAME_STATE_PROGRAM_ID = envPublicKey(
  "VITE_GAME_STATE_PROGRAM_ID",
  "FJGxh6SKgNoTVzHj98oBsC2oaEy8ovadVJf8rDUNaEHb",
);
export const ANTIMATTER_SCALE = 1_000_000n;
export const MIN_RESOURCE_AMOUNT = 1_000n;
const MARKET_TX_COMPUTE_UNITS = 250_000;
const MARKET_PRIORITY_FEE_MICROLAMPORTS = 0;

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

// ─── Discriminators ────────────────────────────────────────────────────────────

const MARKET_OFFER_DISCRIMINATOR   = Buffer.from([0xc9, 0xb8, 0x91, 0x18, 0xae, 0xc0, 0x4b, 0x7b]);
const MARKET_CONFIG_DISCRIMINATOR  = Buffer.from([0x77, 0xff, 0xc8, 0x58, 0xfc, 0x52, 0x80, 0x18]);
const SELLER_COUNTER_DISCRIMINATOR = Buffer.from([0xba, 0x07, 0x93, 0x63, 0xea, 0x2b, 0xa0, 0x3c]);
const PLANET_LISTING_DISCRIMINATOR = Buffer.from([156, 211, 160, 84, 247, 200, 233, 109]);

// Instruction discriminators - sha256("global:<ix_name>")[0..8]
// Instruction discriminators - sha256("global:<ix_name>")[0..8]
const IX = {
  initializeMarket:   Buffer.from([35, 35, 189, 193, 155, 48, 170, 203]),
  initializeEscrow:   Buffer.from([243, 160, 77, 153, 11, 92, 48, 209]),
  updateMarketConfig: Buffer.from([91, 87, 149, 101, 110, 116, 16, 120]),
  createOffer:        Buffer.from([237, 233, 192, 168, 248, 7, 249, 241]),
  cancelOffer:        Buffer.from([92, 203, 223, 40, 92, 89, 53, 119]),
  acceptOffer:        Buffer.from([227, 82, 234, 131, 1, 18, 48, 2]),
  createPlanetListing: Buffer.from([168, 189, 82, 35, 166, 138, 116, 61]),
  cancelPlanetListing: Buffer.from([7, 217, 165, 138, 227, 253, 25, 112]),
  buyPlanetListing:    Buffer.from([48, 116, 122, 166, 251, 1, 167, 31]),
} as const;

// ─── Resource type ─────────────────────────────────────────────────────────────

export enum ResourceType {
  Metal     = 0,
  Crystal   = 1,
  Deuterium = 2,
}

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  [ResourceType.Metal]:     "Metal",
  [ResourceType.Crystal]:   "Crystal",
  [ResourceType.Deuterium]: "Deuterium",
};

export const RESOURCE_COLORS: Record<ResourceType, string> = {
  [ResourceType.Metal]:     "var(--metal)",
  [ResourceType.Crystal]:   "var(--crystal)",
  [ResourceType.Deuterium]: "var(--deut)",
};

export const RESOURCE_ICONS: Record<ResourceType, string> = {
  [ResourceType.Metal]:     "⛏",
  [ResourceType.Crystal]:   "💎",
  [ResourceType.Deuterium]: "🧪",
};

// ─── Public interfaces ─────────────────────────────────────────────────────────

export interface MarketOffer {
  pubkey: string;
  seller: string;
  sellerPlanet: string;
  resourceType: ResourceType;
  resourceAmount: bigint;
  priceAntimatter: bigint;
  createdAt: number;
  offerId: number;
  filled: boolean;
  pricePerUnit: bigint;
  isOwn: boolean;
}

export interface PlanetListing {
  pubkey: string;
  seller: string;
  planet: string;
  planetCoords: string;
  priceAntimatter: bigint;
  createdAt: number;
  listingId: number;
  filled: boolean;
  isOwn: boolean;
  planetName?: string;
  planetIndex?: number;
  coords?: { galaxy: number; system: number; position: number };
  diameter?: number;
  temperature?: number;
  maxFields?: number;
  usedFields?: number;
  metal?: bigint;
  crystal?: bigint;
  deuterium?: bigint;
  metalHour?: bigint;
  crystalHour?: bigint;
  deuteriumHour?: bigint;
  metalCap?: bigint;
  crystalCap?: bigint;
  deuteriumCap?: bigint;
  energyProduction?: bigint;
  energyConsumption?: bigint;
  metalMine?: number;
  crystalMine?: number;
  deuteriumSynthesizer?: number;
  solarPlant?: number;
  fusionReactor?: number;
  roboticsFactory?: number;
  naniteFactory?: number;
  shipyard?: number;
  researchLab?: number;
  weaponsTechnology?: number;
  shieldingTechnology?: number;
  armorTechnology?: number;
  fleetUnits?: number;
  defenseUnits?: number;
}

export interface MarketConfig {
  admin: string;
  antimatterMint: string;
  treasuryAntimatterAccount: string;
  totalVolume: bigint;
  totalOffers: bigint;
}

export interface CreateOfferParams {
  resourceType: ResourceType;
  resourceAmount: bigint;
  priceAntimatter: bigint;
}

// ─── Borsh helpers ─────────────────────────────────────────────────────────────

class BorshWriter {
  private chunks: Buffer[] = [];
  writeU8(v: number)  { this.chunks.push(Buffer.from([v & 0xff])); }
  writeU32(v: number) { const b = Buffer.alloc(4); b.writeUInt32LE(v, 0); this.chunks.push(b); }
  writeU64(v: bigint) { const b = Buffer.alloc(8); b.writeBigUInt64LE(v, 0); this.chunks.push(b); }
  writeFixedBytes(v: Uint8Array) { this.chunks.push(Buffer.from(v)); }
  toBuffer() { return Buffer.concat(this.chunks); }
}

function readU8(d: Buffer, o: number)  { return d.readUInt8(o); }
function readU32(d: Buffer, o: number) { return d.readUInt32LE(o); }
function readU64(d: Buffer, o: number) { return d.readBigUInt64LE(o); }
function readI64(d: Buffer, o: number) { return Number(d.readBigInt64LE(o)); }
function readU128(d: Buffer, o: number): bigint {
  const lo = d.readBigUInt64LE(o);
  const hi = d.readBigUInt64LE(o + 8);
  return lo | (hi << 64n);
}
function readPubkey(d: Buffer, o: number) { return new PublicKey(d.slice(o, o + 32)); }

// ─── PDA derivations ───────────────────────────────────────────────────────────

export function deriveMarketConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market_config")],
    MARKET_PROGRAM_ID,
  )[0];
}

export function deriveSellerCounterPda(seller: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("seller_counter"), seller.toBuffer()],
    MARKET_PROGRAM_ID,
  )[0];
}

export function deriveOfferPda(seller: PublicKey, offerId: number): PublicKey {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(offerId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market_offer"), seller.toBuffer(), idBuf],
    MARKET_PROGRAM_ID,
  )[0];
}

export function derivePlanetListingPda(seller: PublicKey, listingId: number): PublicKey {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(listingId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("planet_listing"), seller.toBuffer(), idBuf],
    MARKET_PROGRAM_ID,
  )[0];
}

export function deriveMarketEscrowPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market_escrow")],
    MARKET_PROGRAM_ID,
  );
}

export function deriveMarketAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market_authority")],
    MARKET_PROGRAM_ID,
  );
}

function deriveAssociatedTokenAccount(mint: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

// ─── Deserializers ─────────────────────────────────────────────────────────────

function deserializeMarketOffer(
  pubkey: PublicKey,
  data: Buffer,
  walletPubkey?: PublicKey,
): MarketOffer {
  if (!data.slice(0, 8).equals(MARKET_OFFER_DISCRIMINATOR)) {
    throw new Error("Invalid MarketOffer discriminator");
  }
  let o = 8;
  const seller = readPubkey(data, o); o += 32;
  const sellerPlanet = readPubkey(data, o); o += 32;
  const resourceType: ResourceType = readU8(data, o) as ResourceType; o += 1;
  const resourceAmount = readU64(data, o); o += 8;
  const priceAntimatter = readU64(data, o); o += 8;
  const createdAt = readI64(data, o); o += 8;
  const offerId = readU32(data, o); o += 4;
  const filled = readU8(data, o) !== 0; o += 1;

  const pricePerUnit = resourceAmount > 0n
    ? (priceAntimatter * 1000n) / resourceAmount
    : 0n;

  return {
    pubkey: pubkey.toBase58(),
    seller: seller.toBase58(),
    sellerPlanet: sellerPlanet.toBase58(),
    resourceType,
    resourceAmount,
    priceAntimatter,
    createdAt,
    offerId,
    filled,
    pricePerUnit,
    isOwn: walletPubkey ? seller.equals(walletPubkey) : false,
  };
}

function deserializePlanetListing(
  pubkey: PublicKey,
  data: Buffer,
  walletPubkey?: PublicKey,
): PlanetListing {
  if (!data.slice(0, 8).equals(PLANET_LISTING_DISCRIMINATOR)) {
    throw new Error("Invalid PlanetListing discriminator");
  }
  let o = 8;
  const seller = readPubkey(data, o); o += 32;
  const planet = readPubkey(data, o); o += 32;
  const planetCoords = readPubkey(data, o); o += 32;
  const priceAntimatter = readU64(data, o); o += 8;
  const createdAt = readI64(data, o); o += 8;
  const listingId = readU32(data, o); o += 4;
  const filled = readU8(data, o) !== 0; o += 1;

  return {
    pubkey: pubkey.toBase58(),
    seller: seller.toBase58(),
    planet: planet.toBase58(),
    planetCoords: planetCoords.toBase58(),
    priceAntimatter,
    createdAt,
    listingId,
    filled,
    isOwn: walletPubkey ? seller.equals(walletPubkey) : false,
  };
}

function deserializeMarketConfig(data: Buffer): MarketConfig {
  if (!data.slice(0, 8).equals(MARKET_CONFIG_DISCRIMINATOR)) {
    throw new Error("Invalid MarketConfig discriminator");
  }
  let o = 8;
  const admin = readPubkey(data, o); o += 32;
  const antimatterMint = readPubkey(data, o); o += 32;
  const treasuryAntimatterAccount = deriveAssociatedTokenAccount(antimatterMint, admin);
  const totalVolume = readU128(data, o); o += 16;
  const totalOffers = readU64(data, o);
  return {
    admin: admin.toBase58(),
    antimatterMint: antimatterMint.toBase58(),
    treasuryAntimatterAccount: treasuryAntimatterAccount.toBase58(),
    totalVolume,
    totalOffers,
  };
}

function deserializeSellerCounter(data: Buffer): { nextOfferId: number; activeOffers: number } {
  let o = 8;
  o += 32;
  const nextOfferId = readU32(data, o); o += 4;
  const activeOffers = readU32(data, o);
  return { nextOfferId, activeOffers };
}

// ─── Instruction encoders ──────────────────────────────────────────────────────

function encodeCreateOffer(
  resourceType: ResourceType,
  resourceAmount: bigint,
  priceAntimatter: bigint,
): Buffer {
  const w = new BorshWriter();
  w.writeU8(resourceType);
  w.writeU64(resourceAmount);
  w.writeU64(priceAntimatter);
  return w.toBuffer();
}

function encodeCreatePlanetListing(priceAntimatter: bigint): Buffer {
  const w = new BorshWriter();
  w.writeU64(priceAntimatter);
  return w.toBuffer();
}

function encodeInstruction(disc: Buffer, args?: Buffer): Buffer {
  return args ? Buffer.concat([disc, args]) : disc;
}

// ─── MarketClient ──────────────────────────────────────────────────────────────

export class MarketClient {
  private connection: Connection;
  private provider: AnchorProvider;
  private gameClient: GameClient;
  private activePlanetPda: PublicKey | null = null;

  constructor(
    connection: Connection,
    provider: AnchorProvider,
    gameClient: GameClient,
  ) {
    this.connection = connection;
    this.provider = provider;
    this.gameClient = gameClient;
  }

  setActivePlanet(planetPda: PublicKey | null): void {
    this.activePlanetPda = planetPda;
  }

  private requireActivePlanet(): PublicKey {
    if (!this.activePlanetPda) {
      throw new Error("Select a planet before using the market.");
    }
    return this.activePlanetPda;
  }

  private async sendInstruction(
    instructions: TransactionInstruction[],
    extraSigners: Keypair[] = [],
  ): Promise<string> {
    const fullIxs = [ComputeBudgetProgram.setComputeUnitLimit({ units: MARKET_TX_COMPUTE_UNITS })];
    if (MARKET_PRIORITY_FEE_MICROLAMPORTS > 0) {
      fullIxs.push(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: MARKET_PRIORITY_FEE_MICROLAMPORTS }),
      );
    }
    fullIxs.push(...instructions);
    const tx = new Transaction().add(...fullIxs);
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;

    if (extraSigners.length > 0) {
      tx.feePayer = extraSigners[0].publicKey;
      tx.sign(...extraSigners);
      const sig = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await this.connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      return sig;
    }

    tx.feePayer = this.provider.wallet.publicKey;
    return this.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  }

  // ── Config ───────────────────────────────────────────────────────────────────

  async getMarketConfig(): Promise<MarketConfig | null> {
    const pda = deriveMarketConfigPda();
    const info = await this.connection.getAccountInfo(pda, "confirmed");
    if (!info?.owner.equals(MARKET_PROGRAM_ID)) return null;
    try {
      return deserializeMarketConfig(Buffer.from(info.data));
    } catch {
      return null;
    }
  }

  /** Check if escrow is initialized */
  async isEscrowInitialized(): Promise<boolean> {
    const [escrowPda] = deriveMarketEscrowPda();
    const info = await this.connection.getAccountInfo(escrowPda, "confirmed");
    return info !== null && info.owner.equals(TOKEN_PROGRAM_ID);
  }

  /** Admin: one-time market setup. */
  async initializeMarket(antimatterMint: PublicKey): Promise<string> {
    const admin = this.provider.wallet.publicKey;
    const marketConfigPda = deriveMarketConfigPda();
    const w = new BorshWriter();
    w.writeFixedBytes(antimatterMint.toBytes());
    const ix = new TransactionInstruction({
      programId: MARKET_PROGRAM_ID,
      keys: [
        { pubkey: admin,            isSigner: true,  isWritable: true  },
        { pubkey: marketConfigPda,  isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.initializeMarket, w.toBuffer()),
    });
    return this.sendInstruction([ix]);
  }

  /** Admin: one-time escrow account setup. Must be called after initializeMarket. */
  async initializeEscrow(): Promise<string> {
    const admin = this.provider.wallet.publicKey;
    const marketConfigPda = deriveMarketConfigPda();

    const config = await this.getMarketConfig();
    if (!config) {
      throw new Error("Market config not initialized. Call initializeMarket first.");
    }

    const antimatterMint = new PublicKey(config.antimatterMint);
    const [marketEscrow] = deriveMarketEscrowPda();
    const [marketEscrowAuthority] = deriveMarketAuthorityPda();

    const ix = new TransactionInstruction({
      programId: MARKET_PROGRAM_ID,
      keys: [
        { pubkey: admin,                    isSigner: true,  isWritable: true },   // payer
        { pubkey: marketConfigPda,          isSigner: false, isWritable: false },  // has_one check
        { pubkey: antimatterMint,           isSigner: false, isWritable: false },  // mint validation
        { pubkey: marketEscrow,             isSigner: false, isWritable: true },   // token account to init
        { pubkey: marketEscrowAuthority,    isSigner: false, isWritable: false },  // PDA authority
        { pubkey: TOKEN_PROGRAM_ID,         isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY,       isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId,  isSigner: false, isWritable: false },
      ],
      data: IX.initializeEscrow,   // ← now using the updated IX constant
    });

    return this.sendInstruction([ix]);
  }

  /** Admin: update the ANTIMATTER mint in an already-initialized market config. */
  async updateMarketConfig(antimatterMint: PublicKey): Promise<string> {
    const admin = this.provider.wallet.publicKey;
    const marketConfigPda = deriveMarketConfigPda();
    const w = new BorshWriter();
    w.writeFixedBytes(antimatterMint.toBytes());
    const ix = new TransactionInstruction({
      programId: MARKET_PROGRAM_ID,
      keys: [
        { pubkey: admin,           isSigner: true,  isWritable: true  },
        { pubkey: marketConfigPda, isSigner: false, isWritable: true  },
      ],
      data: encodeInstruction(IX.updateMarketConfig, w.toBuffer()),
    });
    return this.sendInstruction([ix]);
  }

  // ── Offer CRUD ───────────────────────────────────────────────────────────────

  async createOffer(params: CreateOfferParams, sellerPlanet?: PublicKey): Promise<string> {
    const { resourceType, resourceAmount, priceAntimatter } = params;
    const seller = this.provider.wallet.publicKey;
    const sellerPlanetPda = sellerPlanet ?? this.requireActivePlanet();
    const marketConfigPda = deriveMarketConfigPda();
    const sellerCounterPda = deriveSellerCounterPda(seller);

    const counterInfo = await this.connection.getAccountInfo(sellerCounterPda, "confirmed");
    const nextOfferId = counterInfo
      ? deserializeSellerCounter(Buffer.from(counterInfo.data)).nextOfferId
      : 0;

    const offerPda = deriveOfferPda(seller, nextOfferId);

    const ix = new TransactionInstruction({
      programId: MARKET_PROGRAM_ID,
      keys: [
        { pubkey: seller,           isSigner: true,  isWritable: true  },
        { pubkey: marketConfigPda,  isSigner: false, isWritable: true  },
        { pubkey: sellerCounterPda, isSigner: false, isWritable: true  },
        { pubkey: offerPda,         isSigner: false, isWritable: true  },
        { pubkey: GAME_STATE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: sellerPlanetPda,  isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.createOffer, encodeCreateOffer(resourceType, resourceAmount, priceAntimatter)),
    });
    return this.sendInstruction([ix]);
  }

  async cancelOffer(offer: MarketOffer): Promise<string> {
    const seller = this.provider.wallet.publicKey;
    const offerPda = new PublicKey(offer.pubkey);
    const sellerCounterPda = deriveSellerCounterPda(seller);
    const sellerPlanetPda = new PublicKey(offer.sellerPlanet);
    const [marketAuthority] = deriveMarketAuthorityPda();

    const ix = new TransactionInstruction({
      programId: MARKET_PROGRAM_ID,
      keys: [
        { pubkey: seller,           isSigner: true,  isWritable: true  },
        { pubkey: offerPda,         isSigner: false, isWritable: true  },
        { pubkey: sellerCounterPda, isSigner: false, isWritable: true  },
        { pubkey: GAME_STATE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: sellerPlanetPda,  isSigner: false, isWritable: true  },
        { pubkey: marketAuthority,  isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.cancelOffer),
    });
    return this.sendInstruction([ix]);
  }

   async acceptOffer(offer: MarketOffer, buyerPlanet?: PublicKey): Promise<string> {
    const buyer = this.provider.wallet.publicKey;
    const buyerPlanetPda = buyerPlanet ?? this.requireActivePlanet();

    const config = await this.getMarketConfig();
    if (!config) throw new Error("Market config not initialized.");

    const antimatterMint = new PublicKey(config.antimatterMint);
    const sellerPubkey = new PublicKey(offer.seller);
    const offerPda = new PublicKey(offer.pubkey);
    const sellerPlanetPda = new PublicKey(offer.sellerPlanet);
    const sellerCounterPda = deriveSellerCounterPda(sellerPubkey);
    const marketConfigPda = deriveMarketConfigPda();
    const [marketEscrow] = deriveMarketEscrowPda();
    const treasuryAntimatterAccount = new PublicKey(config.treasuryAntimatterAccount);
    const [marketEscrowAuthority] = deriveMarketAuthorityPda();

    const buyerAtaResponse = await this.connection.getParsedTokenAccountsByOwner(
      buyer, { mint: antimatterMint, programId: TOKEN_PROGRAM_ID }, "confirmed"
    );
    const buyerAta = buyerAtaResponse.value[0]?.pubkey;
    if (!buyerAta) throw new Error("Buyer has no ANTIMATTER token account.");

    const sellerAtaResponse = await this.connection.getParsedTokenAccountsByOwner(
      sellerPubkey, { mint: antimatterMint, programId: TOKEN_PROGRAM_ID }, "confirmed"
    );
    const sellerAta = sellerAtaResponse.value[0]?.pubkey;
    if (!sellerAta) throw new Error("Seller has no ANTIMATTER token account.");

    const ix = new TransactionInstruction({
      programId: MARKET_PROGRAM_ID,
      keys: [
        { pubkey: buyer,                    isSigner: true,  isWritable: true },  // 0  buyer
        { pubkey: sellerPubkey,             isSigner: false, isWritable: true },  // 1  seller
        { pubkey: marketConfigPda,          isSigner: false, isWritable: true },  // 2  market_config
        { pubkey: offerPda,                 isSigner: false, isWritable: true },  // 3  offer
        { pubkey: sellerCounterPda,         isSigner: false, isWritable: true },  // 4  seller_counter
        { pubkey: antimatterMint,           isSigner: false, isWritable: true },  // 5  antimatter_mint
        { pubkey: buyerAta,                 isSigner: false, isWritable: true },  // 6  buyer_ata
        { pubkey: sellerAta,                isSigner: false, isWritable: true },  // 7  seller_ata
        { pubkey: marketEscrow,             isSigner: false, isWritable: true },  // 8  market_escrow
        { pubkey: treasuryAntimatterAccount,isSigner: false, isWritable: true },  // 9  treasury_ata
        { pubkey: marketEscrowAuthority,    isSigner: false, isWritable: false }, // 10 authority
        { pubkey: TOKEN_PROGRAM_ID,         isSigner: false, isWritable: false }, // 11 token_program
        { pubkey: SystemProgram.programId,  isSigner: false, isWritable: false }, // 12 system_program
        { pubkey: GAME_STATE_PROGRAM_ID,    isSigner: false, isWritable: false }, // 13 game_program
        { pubkey: sellerPlanetPda,          isSigner: false, isWritable: true },  // 14 seller_planet
        { pubkey: buyerPlanetPda,           isSigner: false, isWritable: true },  // 15 buyer_planet
      ],
      data: encodeInstruction(IX.acceptOffer),
    });

    return this.sendInstruction([ix]);
  }

  // ── Fetching offers ──────────────────────────────────────────────────────────

  async createPlanetListing(planet: PlayerState, priceAntimatter: bigint): Promise<string> {
    const seller = this.provider.wallet.publicKey;
    const marketConfigPda = deriveMarketConfigPda();
    const sellerCounterPda = deriveSellerCounterPda(seller);
    const planetPda = new PublicKey(planet.planetPda);
    const planetCoordsPda = derivePlanetCoordsPda(
      planet.planet.galaxy,
      planet.planet.system,
      planet.planet.position,
    );

    const counterInfo = await this.connection.getAccountInfo(sellerCounterPda, "confirmed");
    const nextOfferId = counterInfo
      ? deserializeSellerCounter(Buffer.from(counterInfo.data)).nextOfferId
      : 0;
    const listingPda = derivePlanetListingPda(seller, nextOfferId);

    const ix = new TransactionInstruction({
      programId: MARKET_PROGRAM_ID,
      keys: [
        { pubkey: seller,           isSigner: true,  isWritable: true },
        { pubkey: marketConfigPda,  isSigner: false, isWritable: true },
        { pubkey: sellerCounterPda, isSigner: false, isWritable: true },
        { pubkey: listingPda,       isSigner: false, isWritable: true },
        { pubkey: planetPda,        isSigner: false, isWritable: true },
        { pubkey: planetCoordsPda,  isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.createPlanetListing, encodeCreatePlanetListing(priceAntimatter)),
    });

    return this.sendInstruction([ix]);
  }

  async cancelPlanetListing(listing: PlanetListing): Promise<string> {
    const seller = this.provider.wallet.publicKey;
    const listingPda = new PublicKey(listing.pubkey);
    const sellerCounterPda = deriveSellerCounterPda(seller);

    const ix = new TransactionInstruction({
      programId: MARKET_PROGRAM_ID,
      keys: [
        { pubkey: seller,           isSigner: true,  isWritable: true },
        { pubkey: listingPda,       isSigner: false, isWritable: true },
        { pubkey: sellerCounterPda, isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.cancelPlanetListing),
    });
    return this.sendInstruction([ix]);
  }

  async buyPlanetListing(listing: PlanetListing): Promise<string> {
    const buyer = this.provider.wallet.publicKey;
    const config = await this.getMarketConfig();
    if (!config) throw new Error("Market config not initialized.");

    const antimatterMint = new PublicKey(config.antimatterMint);
    const sellerPubkey = new PublicKey(listing.seller);
    const listingPda = new PublicKey(listing.pubkey);
    const planetPda = new PublicKey(listing.planet);
    const planetCoordsPda = new PublicKey(listing.planetCoords);
    const sellerCounterPda = deriveSellerCounterPda(sellerPubkey);
    const marketConfigPda = deriveMarketConfigPda();
    const [marketEscrow] = deriveMarketEscrowPda();
    const treasuryAntimatterAccount = new PublicKey(config.treasuryAntimatterAccount);
    const [marketEscrowAuthority] = deriveMarketAuthorityPda();
    const buyerProfilePda = derivePlayerProfilePda(buyer);
    const buyerOwnerIndexPda = derivePlanetOwnerIndexPda(
      buyer,
      await this.gameClient.getPlayerPlanetCount(buyer),
    );
    const sellerOwnerIndexPda = await this.gameClient.findPlanetOwnerIndexPda(sellerPubkey, planetPda);

    const buyerAtaResponse = await this.connection.getParsedTokenAccountsByOwner(
      buyer, { mint: antimatterMint, programId: TOKEN_PROGRAM_ID }, "confirmed"
    );
    const buyerAta = buyerAtaResponse.value[0]?.pubkey;
    if (!buyerAta) throw new Error("Buyer has no ANTIMATTER token account.");

    const sellerAtaResponse = await this.connection.getParsedTokenAccountsByOwner(
      sellerPubkey, { mint: antimatterMint, programId: TOKEN_PROGRAM_ID }, "confirmed"
    );
    const sellerAta = sellerAtaResponse.value[0]?.pubkey;
    if (!sellerAta) throw new Error("Seller has no ANTIMATTER token account.");

    const ix = new TransactionInstruction({
      programId: MARKET_PROGRAM_ID,
      keys: [
        { pubkey: buyer,                 isSigner: true,  isWritable: true },
        { pubkey: sellerPubkey,          isSigner: false, isWritable: true },
        { pubkey: marketConfigPda,       isSigner: false, isWritable: true },
        { pubkey: listingPda,            isSigner: false, isWritable: true },
        { pubkey: sellerCounterPda,      isSigner: false, isWritable: true },
        { pubkey: antimatterMint,        isSigner: false, isWritable: true },
        { pubkey: buyerAta,              isSigner: false, isWritable: true },
        { pubkey: sellerAta,             isSigner: false, isWritable: true },
        { pubkey: marketEscrow,          isSigner: false, isWritable: true },
        { pubkey: treasuryAntimatterAccount, isSigner: false, isWritable: true },
        { pubkey: marketEscrowAuthority, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID,      isSigner: false, isWritable: false },
        { pubkey: GAME_STATE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: planetPda,             isSigner: false, isWritable: true },
        { pubkey: planetCoordsPda,       isSigner: false, isWritable: true },
        { pubkey: buyerProfilePda,       isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: buyerOwnerIndexPda,    isSigner: false, isWritable: true },
        ...(sellerOwnerIndexPda ? [{ pubkey: sellerOwnerIndexPda, isSigner: false, isWritable: true }] : []),
      ],
      data: encodeInstruction(IX.buyPlanetListing),
    });

    return this.sendInstruction([ix]);
  }

  async fetchAllOffers(filterResource?: ResourceType): Promise<MarketOffer[]> {
    const walletPubkey = this.provider.wallet.publicKey;
    const accounts = await this.connection.getProgramAccounts(MARKET_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [
        { dataSize: 8 + 32 + 32 + 1 + 8 + 8 + 8 + 4 + 1 + 1 },
        { memcmp: { offset: 0, bytes: bs58.encode(MARKET_OFFER_DISCRIMINATOR) } },
      ],
    });

    const offers: MarketOffer[] = [];
    for (const { pubkey, account } of accounts) {
      try {
        const offer = deserializeMarketOffer(pubkey, Buffer.from(account.data), walletPubkey);
        if (offer.filled) continue;
        if (filterResource !== undefined && offer.resourceType !== filterResource) continue;
        offers.push(offer);
      } catch { /* skip malformed */ }
    }

    return offers.sort((a, b) => {
      if (a.pricePerUnit !== b.pricePerUnit) return a.pricePerUnit < b.pricePerUnit ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }

  async fetchMyOffers(): Promise<MarketOffer[]> {
    const seller = this.provider.wallet.publicKey;
    const all = await this.fetchAllOffers();
    return all.filter(o => o.seller === seller.toBase58());
  }

  async fetchOffer(offerPda: PublicKey): Promise<MarketOffer | null> {
    const info = await this.connection.getAccountInfo(offerPda, "confirmed");
    if (!info?.owner.equals(MARKET_PROGRAM_ID)) return null;
    try {
      return deserializeMarketOffer(offerPda, Buffer.from(info.data), this.provider.wallet.publicKey);
    } catch {
      return null;
    }
  }

  async fetchAllPlanetListings(): Promise<PlanetListing[]> {
    const walletPubkey = this.provider.wallet.publicKey;
    const accounts = await this.connection.getProgramAccounts(MARKET_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [
        { dataSize: 8 + 32 + 32 + 32 + 8 + 8 + 4 + 1 + 1 },
        { memcmp: { offset: 0, bytes: bs58.encode(PLANET_LISTING_DISCRIMINATOR) } },
      ],
    });

    const listings: PlanetListing[] = [];
    for (const { pubkey, account } of accounts) {
      try {
        const listing = deserializePlanetListing(pubkey, Buffer.from(account.data), walletPubkey);
        if (listing.filled) continue;
        const planetState = await this.gameClient.getPlanetStateByPda(new PublicKey(listing.planet));
        if (!planetState) continue;
        if (planetState.planet.owner !== listing.seller) continue;
        if (planetState.planet.planetIndex === 0) continue;

        listing.planetName = planetState.planet.name;
        listing.planetIndex = planetState.planet.planetIndex;
        listing.diameter = planetState.planet.diameter;
        listing.temperature = planetState.planet.temperature;
        listing.maxFields = planetState.planet.maxFields;
        listing.usedFields = planetState.planet.usedFields;
        listing.metal = planetState.resources.metal;
        listing.crystal = planetState.resources.crystal;
        listing.deuterium = planetState.resources.deuterium;
        listing.metalHour = planetState.resources.metalHour;
        listing.crystalHour = planetState.resources.crystalHour;
        listing.deuteriumHour = planetState.resources.deuteriumHour;
        listing.metalCap = planetState.resources.metalCap;
        listing.crystalCap = planetState.resources.crystalCap;
        listing.deuteriumCap = planetState.resources.deuteriumCap;
        listing.energyProduction = planetState.resources.energyProduction;
        listing.energyConsumption = planetState.resources.energyConsumption;
        listing.metalMine = planetState.planet.metalMine;
        listing.crystalMine = planetState.planet.crystalMine;
        listing.deuteriumSynthesizer = planetState.planet.deuteriumSynthesizer;
        listing.solarPlant = planetState.planet.solarPlant;
        listing.fusionReactor = planetState.planet.fusionReactor;
        listing.roboticsFactory = planetState.planet.roboticsFactory;
        listing.naniteFactory = planetState.planet.naniteFactory;
        listing.shipyard = planetState.planet.shipyard;
        listing.researchLab = planetState.planet.researchLab;
        listing.weaponsTechnology = planetState.research.weaponsTechnology;
        listing.shieldingTechnology = planetState.research.shieldingTechnology;
        listing.armorTechnology = planetState.research.armorTechnology;
        listing.fleetUnits =
          planetState.fleet.smallCargo +
          planetState.fleet.largeCargo +
          planetState.fleet.lightFighter +
          planetState.fleet.heavyFighter +
          planetState.fleet.cruiser +
          planetState.fleet.battleship +
          planetState.fleet.battlecruiser +
          planetState.fleet.bomber +
          planetState.fleet.destroyer +
          planetState.fleet.deathstar +
          planetState.fleet.recycler +
          planetState.fleet.espionageProbe +
          planetState.fleet.colonyShip +
          planetState.fleet.solarSatellite;
        listing.defenseUnits =
          planetState.planet.rocketLauncher +
          planetState.planet.lightLaser +
          planetState.planet.heavyLaser +
          planetState.planet.gaussCannon +
          planetState.planet.ionCannon +
          planetState.planet.plasmaTurret +
          planetState.planet.smallShieldDome +
          planetState.planet.largeShieldDome;
        listing.coords = {
          galaxy: planetState.planet.galaxy,
          system: planetState.planet.system,
          position: planetState.planet.position,
        };
        listings.push(listing);
      } catch { /* skip malformed or unreadable listings */ }
    }

    return listings.sort((a, b) => {
      if (a.priceAntimatter !== b.priceAntimatter) return a.priceAntimatter < b.priceAntimatter ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }

  async fetchMyPlanetListings(): Promise<PlanetListing[]> {
    const seller = this.provider.wallet.publicKey.toBase58();
    const all = await this.fetchAllPlanetListings();
    return all.filter(l => l.seller === seller);
  }

  async getAntimatterBalance(): Promise<bigint> {
    const config = await this.getMarketConfig();
    if (!config) return 0n;
    const mint = new PublicKey(config.antimatterMint);
    const response = await this.connection.getParsedTokenAccountsByOwner(
      this.provider.wallet.publicKey,
      { mint, programId: TOKEN_PROGRAM_ID },
      "confirmed",
    );
    return response.value.reduce((sum, acc) => {
      const amount = (acc.account.data as any).parsed?.info?.tokenAmount?.amount ?? "0";
      return sum + BigInt(amount);
    }, 0n);
  }
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

function compactTokenDisplay(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatAm(raw: bigint, decimals = 2): string {
  const whole = raw / ANTIMATTER_SCALE;
  if (whole >= 1_000n) {
    return compactTokenDisplay(Number(raw) / Number(ANTIMATTER_SCALE));
  }
  const frac = raw % ANTIMATTER_SCALE;
  if (decimals === 0) return whole.toString();
  const fracStr = frac.toString().padStart(6, "0").slice(0, decimals);
  return `${whole}.${fracStr}`;
}

export function formatResource(n: bigint): string {
  if (n >= 1_000_000_000n) return `${(Number(n) / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000n)     return `${(Number(n) / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000n)         return `${(Number(n) / 1_000).toFixed(1)}k`;
  return n.toString();
}

export function pricePerKDisplay(offer: MarketOffer): string {
  return formatAm(offer.pricePerUnit);
}

export function amRawFromDisplay(displayAmount: number): bigint {
  return BigInt(Math.round(displayAmount * Number(ANTIMATTER_SCALE)));
}

export function describeError(err: unknown): string {
  if (err instanceof SendTransactionError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
