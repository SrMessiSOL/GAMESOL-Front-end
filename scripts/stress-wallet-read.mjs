import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";

const walletText = process.argv[2];
const rounds = Math.max(1, Math.min(50, Number(process.argv[3]) || 12));
if (!walletText) throw new Error("Usage: node scripts/stress-wallet-read.mjs <wallet> [rounds]");
const wallet = new PublicKey(walletText);

function readEnvFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, "utf8").split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return [];
    const [key, ...parts] = trimmed.split("=");
    return [[key.trim(), parts.join("=").trim().replace(/^['"]|['"]$/g, "")]];
  }));
}

const env = { ...readEnvFile(".env.sovereignty"), ...readEnvFile(".env.local"), ...process.env };
const rpcUrl = env.VITE_SOLANA_RPC_ENDPOINT;
const program = new PublicKey(env.VITE_GAME_STATE_PROGRAM_ID);
if (!rpcUrl) throw new Error("VITE_SOLANA_RPC_ENDPOINT is not configured.");

const discriminators = {
  profile: Buffer.from([82, 226, 99, 87, 164, 130, 181, 80]),
  planet: Buffer.from([1, 25, 230, 69, 194, 252, 152, 240]),
  publicPlanet: Buffer.from([61, 168, 213, 170, 12, 18, 66, 158]),
  membership: Buffer.from([126, 58, 186, 213, 41, 116, 92, 8]),
  alliance: Buffer.from([177, 12, 51, 254, 131, 106, 170, 219]),
  decision: Buffer.from([173, 215, 229, 54, 8, 55, 214, 37]),
};

let requestId = 0;
const samples = [];
async function rpc(method, params, label = method) {
  const startedAt = performance.now();
  let status = 0;
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
    });
    status = response.status;
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(body.error?.message || `HTTP ${response.status}`);
    samples.push({ label, ms: performance.now() - startedAt, ok: true, status });
    return body.result;
  } catch (error) {
    samples.push({ label, ms: performance.now() - startedAt, ok: false, status, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

function accountFilters(discriminator, authority = wallet) {
  return [
    { memcmp: { offset: 0, bytes: bs58.encode(discriminator) } },
    { memcmp: { offset: 8, bytes: authority.toBase58() } },
  ];
}

function decodeAccount(account) {
  return Buffer.from(account.data[0], "base64");
}

function readFixedString(data, offset, length) {
  return data.subarray(offset, offset + length).toString("utf8").replace(/\0.*$/, "").trim();
}

function parsePlanet(pubkey, data, isPublic) {
  let offset = 8 + 32 + 32;
  const index = data.readUInt32LE(offset); offset += 4;
  const galaxy = data.readUInt16LE(offset); offset += 2;
  const system = data.readUInt16LE(offset); offset += 2;
  const position = data.readUInt8(offset); offset += 1;
  if (isPublic) offset += 1;
  return { pubkey, index, name: readFixedString(data, offset, 32), galaxy, system, position, source: isPublic ? "public" : "full" };
}

function summarize(label) {
  const selected = samples.filter((sample) => sample.label === label);
  const successful = selected.filter((sample) => sample.ok).map((sample) => sample.ms).sort((a, b) => a - b);
  const percentile = (ratio) => successful.length ? successful[Math.min(successful.length - 1, Math.floor((successful.length - 1) * ratio))] : null;
  return {
    requests: selected.length,
    failures: selected.length - successful.length,
    p50Ms: percentile(.5) === null ? null : Math.round(percentile(.5)),
    p95Ms: percentile(.95) === null ? null : Math.round(percentile(.95)),
    maxMs: successful.length ? Math.round(successful.at(-1)) : null,
  };
}

const [profilePda] = PublicKey.findProgramAddressSync([Buffer.from("player_profile"), wallet.toBuffer()], program);
const [membershipPda] = PublicKey.findProgramAddressSync([Buffer.from("alliance_membership"), wallet.toBuffer()], program);
const [profileResult, membershipResult, fullPlanetResult, publicPlanetResult, globalDecisionResult] = await Promise.all([
  rpc("getAccountInfo", [profilePda.toBase58(), { encoding: "base64", commitment: "confirmed" }], "profile"),
  rpc("getAccountInfo", [membershipPda.toBase58(), { encoding: "base64", commitment: "confirmed" }], "membership"),
  rpc("getProgramAccounts", [program.toBase58(), { encoding: "base64", commitment: "confirmed", filters: accountFilters(discriminators.planet) }], "owned-full-planets"),
  rpc("getProgramAccounts", [program.toBase58(), { encoding: "base64", commitment: "confirmed", filters: accountFilters(discriminators.publicPlanet) }], "owned-public-planets"),
  rpc("getProgramAccounts", [program.toBase58(), { encoding: "base64", commitment: "confirmed", dataSlice: { offset: 0, length: 0 }, filters: [{ dataSize: 178 }, { memcmp: { offset: 0, bytes: bs58.encode(discriminators.decision) } }] }], "global-decisions"),
]);

let profilePlanetCount = 0;
if (profileResult?.value) {
  const data = decodeAccount(profileResult.value);
  if (data.subarray(0, 8).equals(discriminators.profile)) profilePlanetCount = data.readUInt32LE(40);
}

let alliance = null;
if (membershipResult?.value) {
  const data = decodeAccount(membershipResult.value);
  if (data.subarray(0, 8).equals(discriminators.membership)) {
    const allianceKey = new PublicKey(data.subarray(40, 72));
    const role = data.readUInt8(72);
    const allianceResult = await rpc("getAccountInfo", [allianceKey.toBase58(), { encoding: "base64", commitment: "confirmed" }], "alliance");
    const decisionResult = await rpc("getProgramAccounts", [program.toBase58(), { encoding: "base64", commitment: "confirmed", dataSlice: { offset: 0, length: 0 }, filters: [{ dataSize: 178 }, { memcmp: { offset: 0, bytes: bs58.encode(discriminators.decision) } }, { memcmp: { offset: 17, bytes: allianceKey.toBase58() } }] }], "alliance-decisions");
    const allianceData = allianceResult?.value ? decodeAccount(allianceResult.value) : null;
    alliance = {
      publicKey: allianceKey.toBase58(),
      name: allianceData?.subarray(0, 8).equals(discriminators.alliance) ? readFixedString(allianceData, 40, 32) : null,
      role: role === 2 ? "LEADER" : role === 1 ? "MEMBER" : "NONE",
      decisionCount: decisionResult.length,
    };
  }
}

const parsedPlanets = [
  ...fullPlanetResult.map(({ pubkey, account }) => parsePlanet(pubkey, decodeAccount(account), false)),
  ...publicPlanetResult.map(({ pubkey, account }) => parsePlanet(pubkey, decodeAccount(account), true)),
];
const planetsByCoordinate = new Map();
for (const planet of parsedPlanets) {
  const key = `${planet.galaxy}:${planet.system}:${planet.position}`;
  const current = planetsByCoordinate.get(key);
  if (!current || planet.source === "full") planetsByCoordinate.set(key, planet);
}
const planets = [...planetsByCoordinate.values()].sort((a, b) => a.index - b.index);

const stressTargets = planets.map((planet) => planet.pubkey);
const activitySignatures = new Set();
for (const planet of stressTargets) {
  const entries = await rpc("getSignaturesForAddress", [planet, { limit: 40, commitment: "confirmed" }], "activity-signatures");
  entries.forEach((entry) => activitySignatures.add(entry.signature));
}
for (let round = 0; round < rounds; round += 1) {
  const tasks = [
    rpc("getAccountInfo", [profilePda.toBase58(), { encoding: "base64", commitment: "confirmed" }], "stress-profile"),
    rpc("getAccountInfo", [membershipPda.toBase58(), { encoding: "base64", commitment: "confirmed" }], "stress-membership"),
  ];
  if (stressTargets.length) tasks.push(rpc("getMultipleAccounts", [stressTargets, { encoding: "base64", commitment: "confirmed" }], "stress-planets"));
  await Promise.allSettled(tasks);
}

const failures = samples.filter((sample) => !sample.ok);
console.log(JSON.stringify({
  wallet: wallet.toBase58(),
  cluster: env.VITE_SOLANA_CLUSTER || "unknown",
  realData: {
    profilePlanetCount,
    loadedUniquePlanets: planets.length,
    planets: planets.map(({ pubkey, ...planet }) => planet),
    alliance,
    globalDecisionCount: globalDecisionResult.length,
    recentActivitySignatures: activitySignatures.size,
  },
  stress: {
    rounds,
    totalRequests: samples.length,
    totalFailures: failures.length,
    rateLimitFailures: failures.filter((sample) => sample.status === 429 || sample.error?.includes("429")).length,
    profile: summarize("stress-profile"),
    membership: summarize("stress-membership"),
    planets: summarize("stress-planets"),
  },
  failures: failures.map(({ label, status, error }) => ({ label, status, error })),
}, null, 2));
