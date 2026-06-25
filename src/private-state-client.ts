import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

export const PRIVATE_STATE_PROGRAM_ID = new PublicKey("HHF3gZKAGLL5GB633tz9U8aGT8HxAaPnSi2YZpgF7d4K");
export const PRIVATE_STATE_DOMAIN = "GAMESOL_PRIVATE_STATE_V1";
export const PRIVATE_REPORT_DOMAIN = "GAMESOL_SPY_REPORT_V1";
export const MAX_PRIVATE_PLANET_NAME_LEN = 32;
export const MAX_REVEAL_LEVEL = 4;

const PRIVATE_PLANET_STATE_DISCRIMINATOR = Buffer.from([221, 195, 110, 189, 171, 244, 234, 75]);
const SPY_REPORT_DISCRIMINATOR = Buffer.from([129, 115, 165, 165, 24, 139, 117, 156]);

const IX = {
  initializePrivatePlanet: Buffer.from([75, 22, 41, 60, 22, 207, 113, 51]),
  rotatePrivateCommitments: Buffer.from([116, 211, 172, 165, 169, 210, 199, 149]),
  publishSpyReport: Buffer.from([140, 217, 42, 129, 115, 74, 159, 167]),
} as const;

export type PrivateCommitments = {
  resources: Uint8Array;
  buildings: Uint8Array;
  research: Uint8Array;
  fleet: Uint8Array;
  defense: Uint8Array;
};

export type PrivatePlanetPublicState = {
  authority: string;
  galaxy: number;
  system: number;
  position: number;
  name: string;
  createdAt: number;
  publicProtectionUntilTs: number;
  stateEpoch: bigint;
  resourcesCommitment: Uint8Array;
  buildingsCommitment: Uint8Array;
  researchCommitment: Uint8Array;
  fleetCommitment: Uint8Array;
  defenseCommitment: Uint8Array;
  lastTransitionHash: Uint8Array;
  reportNonce: bigint;
};

export type PrivateSpyReport = {
  targetPlanet: string;
  targetAuthority: string;
  spyAuthority: string;
  resolver: string;
  targetEpoch: bigint;
  reportNonce: bigint;
  revealLevel: number;
  reportCiphertextHash: Uint8Array;
  reportCommitment: Uint8Array;
  createdAt: number;
};

export type PrivateSnapshot = {
  resources: unknown;
  buildings: unknown;
  research: unknown;
  fleet: unknown;
  defense: unknown;
};

export type EncryptedPrivateReport = {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  ciphertextHash: Uint8Array;
  reportCommitment: Uint8Array;
};

function asCryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out as Uint8Array<ArrayBuffer>;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

class BinaryWriter {
  private chunks: Buffer[] = [];

  writeU8(value: number): void {
    this.chunks.push(Buffer.from([value & 0xff]));
  }

  writeU16(value: number): void {
    const bytes = Buffer.alloc(2);
    bytes.writeUInt16LE(value, 0);
    this.chunks.push(bytes);
  }

  writeFixedBytes(value: Uint8Array, expectedLength?: number): void {
    if (expectedLength !== undefined && value.length !== expectedLength) {
      throw new Error(`Expected ${expectedLength} bytes, got ${value.length}.`);
    }
    this.chunks.push(Buffer.from(value));
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

function encodeInstruction(discriminator: Buffer, args?: Buffer): Buffer {
  return args ? Buffer.concat([discriminator, args]) : discriminator;
}

function readU8(data: Buffer, offset: number): number {
  return data.readUInt8(offset);
}

function readU16(data: Buffer, offset: number): number {
  return data.readUInt16LE(offset);
}

function readU64(data: Buffer, offset: number): bigint {
  return data.readBigUInt64LE(offset);
}

function readI64(data: Buffer, offset: number): number {
  return Number(data.readBigInt64LE(offset));
}

function readPubkey(data: Buffer, offset: number): string {
  return new PublicKey(data.slice(offset, offset + 32)).toBase58();
}

function readFixedString(data: Buffer, offset: number, length: number): string {
  return Buffer.from(data.slice(offset, offset + length)).toString("utf8").replace(/\0/g, "").trim();
}

function fixedNameBytes(name: string): Buffer {
  const out = Buffer.alloc(MAX_PRIVATE_PLANET_NAME_LEN, 0);
  Buffer.from(name.slice(0, MAX_PRIVATE_PLANET_NAME_LEN), "utf8").copy(out, 0, 0, MAX_PRIVATE_PLANET_NAME_LEN);
  return out;
}

function encodeCommitments(commitments: PrivateCommitments): Buffer {
  const writer = new BinaryWriter();
  writer.writeFixedBytes(commitments.resources, 32);
  writer.writeFixedBytes(commitments.buildings, 32);
  writer.writeFixedBytes(commitments.research, 32);
  writer.writeFixedBytes(commitments.fleet, 32);
  writer.writeFixedBytes(commitments.defense, 32);
  return writer.toBuffer();
}

function assertDiscriminator(data: Buffer, expected: Buffer, label: string): void {
  if (data.length < 8 || !data.slice(0, 8).equals(expected)) {
    throw new Error(`Invalid ${label} account discriminator.`);
  }
}

function stableNormalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (Array.isArray(value)) return value.map(stableNormalize);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stableNormalize(entry)]),
  );
}

export function serializePrivatePayload(payload: unknown): Uint8Array {
  return utf8Bytes(JSON.stringify(stableNormalize(payload)));
}

export function generatePrivateSalt(length = 32): Uint8Array {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return salt;
}

export async function sha256Bytes(input: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", asCryptoBytes(input)));
}

export async function derivePrivateCommitment(
  label: keyof PrivateSnapshot,
  payload: unknown,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return sha256Bytes(
    concatBytes([
      utf8Bytes(PRIVATE_STATE_DOMAIN),
      utf8Bytes(label),
      salt,
      serializePrivatePayload(payload),
    ]),
  );
}

export async function derivePrivateCommitments(
  snapshot: PrivateSnapshot,
  salt: Uint8Array,
): Promise<PrivateCommitments> {
  const [resources, buildings, research, fleet, defense] = await Promise.all([
    derivePrivateCommitment("resources", snapshot.resources, salt),
    derivePrivateCommitment("buildings", snapshot.buildings, salt),
    derivePrivateCommitment("research", snapshot.research, salt),
    derivePrivateCommitment("fleet", snapshot.fleet, salt),
    derivePrivateCommitment("defense", snapshot.defense, salt),
  ]);
  return { resources, buildings, research, fleet, defense };
}

export async function importPrivateReportKey(rawKey: Uint8Array): Promise<CryptoKey> {
  const keyBytes = rawKey.length === 32 ? rawKey : await sha256Bytes(rawKey);
  return crypto.subtle.importKey("raw", asCryptoBytes(keyBytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptPrivateReport(
  report: unknown,
  rawKey: Uint8Array,
  context: Uint8Array,
): Promise<EncryptedPrivateReport> {
  const iv = generatePrivateSalt(12);
  const key = await importPrivateReportKey(rawKey);
  const plaintext = serializePrivatePayload(report);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: asCryptoBytes(iv) }, key, asCryptoBytes(plaintext)),
  );
  const ciphertextHash = await sha256Bytes(concatBytes([utf8Bytes(PRIVATE_REPORT_DOMAIN), ciphertext]));
  const reportCommitment = await sha256Bytes(
    concatBytes([utf8Bytes(PRIVATE_REPORT_DOMAIN), context, iv, ciphertextHash]),
  );
  return { iv, ciphertext, ciphertextHash, reportCommitment };
}

export async function decryptPrivateReport<T = unknown>(
  encrypted: Pick<EncryptedPrivateReport, "iv" | "ciphertext">,
  rawKey: Uint8Array,
): Promise<T> {
  const key = await importPrivateReportKey(rawKey);
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asCryptoBytes(encrypted.iv) },
      key,
      asCryptoBytes(encrypted.ciphertext),
    ),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export function derivePrivatePlanetPda(
  authority: PublicKey,
  galaxy: number,
  system: number,
  position: number,
): PublicKey {
  const galaxyBytes = Buffer.alloc(2);
  galaxyBytes.writeUInt16LE(galaxy);
  const systemBytes = Buffer.alloc(2);
  systemBytes.writeUInt16LE(system);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("private-planet"),
      authority.toBuffer(),
      galaxyBytes,
      systemBytes,
      Buffer.from([position]),
    ],
    PRIVATE_STATE_PROGRAM_ID,
  )[0];
}

export function buildInitializePrivatePlanetInstruction(
  authority: PublicKey,
  galaxy: number,
  system: number,
  position: number,
  name: string,
  commitments: PrivateCommitments,
): TransactionInstruction {
  const privatePlanet = derivePrivatePlanetPda(authority, galaxy, system, position);
  const writer = new BinaryWriter();
  writer.writeU16(galaxy);
  writer.writeU16(system);
  writer.writeU8(position);
  writer.writeFixedBytes(fixedNameBytes(name), MAX_PRIVATE_PLANET_NAME_LEN);
  writer.writeFixedBytes(encodeCommitments(commitments));
  return new TransactionInstruction({
    programId: PRIVATE_STATE_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: privatePlanet, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeInstruction(IX.initializePrivatePlanet, writer.toBuffer()),
  });
}

export function buildRotatePrivateCommitmentsInstruction(
  authority: PublicKey,
  privatePlanet: PublicKey,
  commitments: PrivateCommitments,
  transitionHash: Uint8Array,
): TransactionInstruction {
  const writer = new BinaryWriter();
  writer.writeFixedBytes(encodeCommitments(commitments));
  writer.writeFixedBytes(transitionHash, 32);
  return new TransactionInstruction({
    programId: PRIVATE_STATE_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: privatePlanet, isSigner: false, isWritable: true },
    ],
    data: encodeInstruction(IX.rotatePrivateCommitments, writer.toBuffer()),
  });
}

export function buildPublishSpyReportInstruction(
  spyAuthority: PublicKey,
  resolver: PublicKey,
  privatePlanet: PublicKey,
  reportNonce: bigint,
  revealLevel: number,
  reportCiphertextHash: Uint8Array,
  reportCommitment: Uint8Array,
): TransactionInstruction {
  if (revealLevel < 0 || revealLevel > MAX_REVEAL_LEVEL) {
    throw new Error(`Reveal level must be between 0 and ${MAX_REVEAL_LEVEL}.`);
  }
  const spyReport = deriveSpyReportPda(privatePlanet, spyAuthority, reportNonce);
  const writer = new BinaryWriter();
  writer.writeU8(revealLevel);
  writer.writeFixedBytes(reportCiphertextHash, 32);
  writer.writeFixedBytes(reportCommitment, 32);
  return new TransactionInstruction({
    programId: PRIVATE_STATE_PROGRAM_ID,
    keys: [
      { pubkey: resolver, isSigner: false, isWritable: false },
      { pubkey: spyAuthority, isSigner: true, isWritable: true },
      { pubkey: privatePlanet, isSigner: false, isWritable: true },
      { pubkey: spyReport, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeInstruction(IX.publishSpyReport, writer.toBuffer()),
  });
}

export function deriveSpyReportPda(
  privatePlanet: PublicKey,
  spyAuthority: PublicKey,
  reportNonce: bigint,
): PublicKey {
  const nonceBytes = Buffer.alloc(8);
  nonceBytes.writeBigUInt64LE(reportNonce);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("spy-report"),
      privatePlanet.toBuffer(),
      spyAuthority.toBuffer(),
      nonceBytes,
    ],
    PRIVATE_STATE_PROGRAM_ID,
  )[0];
}

export function deserializePrivatePlanetPublicState(data: Buffer | Uint8Array): PrivatePlanetPublicState {
  const buffer = Buffer.from(data);
  assertDiscriminator(buffer, PRIVATE_PLANET_STATE_DISCRIMINATOR, "private planet");
  let offset = 8;
  const authority = readPubkey(buffer, offset);
  offset += 32;
  const galaxy = readU16(buffer, offset);
  offset += 2;
  const system = readU16(buffer, offset);
  offset += 2;
  const position = readU8(buffer, offset);
  offset += 1;
  const name = readFixedString(buffer, offset, MAX_PRIVATE_PLANET_NAME_LEN);
  offset += MAX_PRIVATE_PLANET_NAME_LEN;
  const createdAt = readI64(buffer, offset);
  offset += 8;
  const publicProtectionUntilTs = readI64(buffer, offset);
  offset += 8;
  const stateEpoch = readU64(buffer, offset);
  offset += 8;
  const resourcesCommitment = buffer.slice(offset, offset + 32);
  offset += 32;
  const buildingsCommitment = buffer.slice(offset, offset + 32);
  offset += 32;
  const researchCommitment = buffer.slice(offset, offset + 32);
  offset += 32;
  const fleetCommitment = buffer.slice(offset, offset + 32);
  offset += 32;
  const defenseCommitment = buffer.slice(offset, offset + 32);
  offset += 32;
  const lastTransitionHash = buffer.slice(offset, offset + 32);
  offset += 32;
  const reportNonce = readU64(buffer, offset);
  return {
    authority,
    galaxy,
    system,
    position,
    name,
    createdAt,
    publicProtectionUntilTs,
    stateEpoch,
    resourcesCommitment,
    buildingsCommitment,
    researchCommitment,
    fleetCommitment,
    defenseCommitment,
    lastTransitionHash,
    reportNonce,
  };
}

export function deserializePrivateSpyReport(data: Buffer | Uint8Array): PrivateSpyReport {
  const buffer = Buffer.from(data);
  assertDiscriminator(buffer, SPY_REPORT_DISCRIMINATOR, "spy report");
  let offset = 8;
  const targetPlanet = readPubkey(buffer, offset);
  offset += 32;
  const targetAuthority = readPubkey(buffer, offset);
  offset += 32;
  const spyAuthority = readPubkey(buffer, offset);
  offset += 32;
  const resolver = readPubkey(buffer, offset);
  offset += 32;
  const targetEpoch = readU64(buffer, offset);
  offset += 8;
  const reportNonce = readU64(buffer, offset);
  offset += 8;
  const revealLevel = readU8(buffer, offset);
  offset += 1;
  const reportCiphertextHash = buffer.slice(offset, offset + 32);
  offset += 32;
  const reportCommitment = buffer.slice(offset, offset + 32);
  offset += 32;
  const createdAt = readI64(buffer, offset);
  return {
    targetPlanet,
    targetAuthority,
    spyAuthority,
    resolver,
    targetEpoch,
    reportNonce,
    revealLevel,
    reportCiphertextHash,
    reportCommitment,
    createdAt,
  };
}
