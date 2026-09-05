const assert = require("node:assert/strict");
const {
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} = require("@solana/web3.js");
const { _test } = require("./lazor-paymaster.js");

const LAZOR_PROGRAM_ID = new PublicKey("4h3XoNReAgEcHVxcZ8sw2aufi9MTr7BbvYYjzjWDyDxS");
const GAME_STATE_PROGRAM_ID = new PublicKey("J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq");
const MARKET_PROGRAM_ID = new PublicKey("6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const FUTARCHY_PROGRAM_ID = new PublicKey("FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq");
const CONDITIONAL_VAULT_PROGRAM_ID = new PublicKey("VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg");
const sponsorRent = Buffer.from([87, 113, 100, 97, 218, 156, 201, 21, 1, 0, 0, 0, 0, 0, 0, 0]);
const approvedAccountCreatingInstructions = [
  ["initialize player", [189, 138, 205, 113, 18, 169, 30, 95]],
  ["initialize homeworld", [124, 7, 81, 167, 80, 191, 227, 173]],
  ["initialize colony", [91, 184, 105, 243, 90, 175, 137, 217]],
  ["initialize quest state", [228, 241, 34, 120, 153, 28, 158, 130]],
  ["initialize quest progress", [180, 174, 237, 53, 63, 6, 200, 222]],
  ["initialize quest targets", [248, 232, 250, 30, 79, 249, 214, 115]],
  ["purchase store pack", [112, 75, 157, 242, 238, 109, 2, 252]],
  ["create alliance", [201, 92, 183, 64, 131, 82, 174, 203]],
  ["join alliance", [237, 35, 212, 158, 181, 98, 153, 166]],
  ["request alliance membership", [194, 192, 5, 193, 32, 45, 240, 140]],
  ["approve alliance membership", [155, 51, 199, 71, 35, 84, 237, 59]],
  ["initialize alliance treasury", [60, 88, 8, 162, 213, 206, 46, 178]],
  ["initialize alliance treasury with session", [47, 188, 187, 250, 22, 115, 107, 127]],
  ["enroll alliance governance", [46, 144, 196, 52, 81, 71, 246, 16]],
  ["create alliance decision", [2, 217, 240, 33, 148, 170, 13, 111]],
  ["claim system sovereignty", [213, 200, 82, 25, 118, 156, 175, 121]],
];

function compactInstruction(programIdIndex, data, accountIndexes = []) {
  const length = Buffer.alloc(2);
  length.writeUInt16LE(data.length);
  return Buffer.concat([
    Buffer.from([programIdIndex, accountIndexes.length, ...accountIndexes]),
    length,
    data,
  ]);
}

function transactionWithInnerPrograms(inner) {
  const sponsor = Keypair.generate();
  const rentReceiver = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const ata = PublicKey.findProgramAddressSync(
    [rentReceiver.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
  const staticAccountKeys = [
    sponsor.publicKey,
    LAZOR_PROGRAM_ID,
    GAME_STATE_PROGRAM_ID,
    SystemProgram.programId,
    MARKET_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    rentReceiver,
    mint,
    ata,
    SYSVAR_RENT_PUBKEY,
    FUTARCHY_PROGRAM_ID,
    CONDITIONAL_VAULT_PROGRAM_ID,
  ];
  const packed = Buffer.concat([
    Buffer.from([4, inner.length]),
    ...inner.map(({ programIndex, data, accountIndexes }) => compactInstruction(
      programIndex,
      data,
      accountIndexes ?? (
        programIndex === 1 && Buffer.from(data).subarray(0, 8).equals(sponsorRent.subarray(0, 8))
          ? [0, 6, 2]
          : []
      ),
    )),
  ]);
  return {
    sponsor,
    ata,
    transaction: {
      message: {
        addressTableLookups: [],
        staticAccountKeys,
        compiledInstructions: [{
          programIdIndex: 1,
          accountKeyIndexes: Uint8Array.from([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
          data: packed,
        }],
      },
    },
  };
}

for (const [label, discriminator] of approvedAccountCreatingInstructions) {
  const { sponsor, transaction } = transactionWithInnerPrograms([
    { programIndex: 1, data: sponsorRent },
    { programIndex: 1, data: Buffer.from(discriminator) },
  ]);
  const policy = _test.assertTransactionPolicy(transaction, sponsor);
  assert.equal(policy.approvedRentBundle, true, label);
  assert.equal(policy.maximumDebit, 50_000_000, label);
  assert.deepEqual(policy.approvedRentOwnerAddresses, [GAME_STATE_PROGRAM_ID.toBase58()], label);
  assert.deepEqual(policy.approvedRentAccountAddresses, [], label);
}

for (const [label, discriminator] of [
  ["create resource offer", [237, 233, 192, 168, 248, 7, 249, 241]],
  ["create planet listing", [168, 189, 82, 35, 166, 138, 116, 61]],
]) {
  const { sponsor, transaction } = transactionWithInnerPrograms([
    { programIndex: 1, data: sponsorRent },
    { programIndex: 3, data: Buffer.from(discriminator) },
  ]);
  const policy = _test.assertTransactionPolicy(transaction, sponsor);
  assert.equal(policy.approvedRentBundle, true, label);
  assert.equal(policy.maximumDebit, 50_000_000, label);
  assert.deepEqual(policy.approvedRentOwnerAddresses, [MARKET_PROGRAM_ID.toBase58()], label);
  assert.deepEqual(policy.approvedRentAccountAddresses, [], label);
}

{
  const { sponsor, ata, transaction } = transactionWithInnerPrograms([
    { programIndex: 1, data: sponsorRent },
    { programIndex: 4, data: Buffer.alloc(0), accountIndexes: [6, 8, 6, 7, 2, 5, 9] },
    { programIndex: 3, data: Buffer.from([227, 82, 234, 131, 1, 18, 48, 2]) },
  ]);
  const policy = _test.assertTransactionPolicy(transaction, sponsor);
  assert.equal(policy.approvedRentBundle, true, "canonical seller ATA for a resource purchase");
  assert.deepEqual(policy.approvedRentOwnerAddresses, []);
  assert.deepEqual(policy.approvedRentAccountAddresses, [ata.toBase58()]);
}

{
  const { sponsor, ata, transaction } = transactionWithInnerPrograms([
    { programIndex: 1, data: sponsorRent },
    { programIndex: 4, data: Buffer.from([1]), accountIndexes: [6, 8, 6, 7, 2, 5] },
    { programIndex: 11, data: Buffer.from([79, 195, 116, 0, 140, 176, 73, 179]) },
    { programIndex: 10, data: Buffer.from([194, 136, 220, 89, 242, 169, 130, 157]) },
  ]);
  const policy = _test.assertTransactionPolicy(transaction, sponsor);
  assert.equal(policy.approvedRentBundle, true, "conditional market buy ATA");
  assert.deepEqual(policy.approvedRentOwnerAddresses, []);
  assert.deepEqual(policy.approvedRentAccountAddresses, [ata.toBase58()]);
}

{
  const { sponsor, ata, transaction } = transactionWithInnerPrograms([
    { programIndex: 1, data: sponsorRent },
    { programIndex: 4, data: Buffer.from([1]), accountIndexes: [6, 8, 6, 7, 2, 5] },
    { programIndex: 11, data: Buffer.from([246, 98, 134, 41, 152, 33, 120, 69]) },
  ]);
  const policy = _test.assertTransactionPolicy(transaction, sponsor);
  assert.equal(policy.approvedRentBundle, true, "conditional position redemption ATA");
  assert.deepEqual(policy.approvedRentAccountAddresses, [ata.toBase58()]);
}

{
  const { sponsor, transaction } = transactionWithInnerPrograms([
    { programIndex: 1, data: sponsorRent },
    { programIndex: 4, data: Buffer.alloc(0), accountIndexes: [6, 7, 6, 7, 2, 5] },
    { programIndex: 3, data: Buffer.from([48, 116, 122, 166, 251, 1, 167, 31]) },
  ]);
  const policy = _test.assertTransactionPolicy(transaction, sponsor);
  assert.equal(policy.approvedRentBundle, false, "non-canonical token address is rejected");
  assert.equal(policy.maximumDebit, 250_000);
}

{
  const { sponsor, transaction } = transactionWithInnerPrograms([
    { programIndex: 1, data: sponsorRent },
    { programIndex: 4, data: Buffer.from([1]), accountIndexes: [6, 8, 6, 7, 2, 5] },
  ]);
  const policy = _test.assertTransactionPolicy(transaction, sponsor);
  assert.equal(policy.approvedRentBundle, false, "standalone ATA farming is rejected");
  assert.equal(policy.maximumDebit, 250_000);
}

{
  const { sponsor, transaction } = transactionWithInnerPrograms([
    { programIndex: 1, data: sponsorRent },
    { programIndex: 4, data: Buffer.from([1]), accountIndexes: [6, 8, 6, 7, 2, 5] },
    { programIndex: 11, data: Buffer.alloc(8) },
  ]);
  const policy = _test.assertTransactionPolicy(transaction, sponsor);
  assert.equal(policy.approvedRentBundle, false, "unknown Conditional Vault instructions cannot authorize ATA rent");
  assert.equal(policy.maximumDebit, 250_000);
}

{
  const { sponsor, transaction } = transactionWithInnerPrograms([
    { programIndex: 1, data: sponsorRent },
    { programIndex: 3, data: Buffer.from([92, 203, 223, 40, 92, 89, 53, 119]) },
  ]);
  const policy = _test.assertTransactionPolicy(transaction, sponsor);
  assert.equal(policy.approvedRentBundle, false, "market cancellation cannot request rent sponsorship");
  assert.equal(policy.maximumDebit, 250_000);
}

{
  const { sponsor, transaction } = transactionWithInnerPrograms([
    { programIndex: 1, data: sponsorRent },
    { programIndex: 2, data: Buffer.alloc(12) },
  ]);
  const policy = _test.assertTransactionPolicy(transaction, sponsor);
  assert.equal(policy.approvedRentBundle, false);
  assert.equal(policy.maximumDebit, 250_000);
}

console.log("paymaster policy tests passed");
