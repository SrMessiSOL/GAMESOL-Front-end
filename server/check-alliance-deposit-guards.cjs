const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;
const { decoder } = require('./read-devnet-game-checkpoint.cjs');

// Reconstruct only the confirmed game instruction; never sign or submit.
async function main() {
  const connection = new Connection('https://chained-universe.vercel.app/api/solana-rpc');
  assert.equal(await connection.getGenesisHash(), 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  const d = decoder();
  const signature = 'dR3YHD4nTZNnxhk1cQvRZBknPqitvtRuLzsB9YYnodx1izTejgVeboim96UMtRxfaPA3ZsQkcYrjpsEJ1Re139b';
  const original = await connection.getTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
  assert(original && original.meta.err === null);
  const message = original.transaction.message;
  const keys = message.getAccountKeys({ accountKeysFromLookups: original.meta.loadedAddresses });
  const instructions = original.meta.innerInstructions.flatMap(group => group.instructions)
    .filter(ix => keys.get(ix.programIdIndex).equals(d.program));
  assert.equal(instructions.length, 1);
  const instruction = instructions[0];
  assert.equal(instruction.accounts.length, 13);
  const data = Buffer.from(bs58.decode(instruction.data));
  assert.equal(data.length, 42);
  assert.equal(data[8], 1);
  assert.equal(data[9], 0);
  assert.equal(data.readBigUInt64LE(10), 1000n);
  for (const offset of [18, 26, 34]) assert.equal(data.readBigUInt64LE(offset), 0n);
  const addresses = instruction.accounts.map(index => keys.get(index));
  const snapshot = async () => (await connection.getMultipleAccountsInfo(addresses, 'confirmed'))
    .map(account => account && createHash('sha256').update(account.data).digest('hex'));
  const before = await snapshot();
  const cases = [
    { name: 'duplicate daily metal deposit', code: 'AllianceMissionAlreadyClaimed', edit: () => {} },
    { name: 'below minimum metal', code: 'AllianceMissionRequirementsNotMet', edit: buffer => buffer.writeBigUInt64LE(999n, 10) },
    { name: 'ANTIMATTER forbidden in vault deposit', code: 'InvalidArgs', edit: buffer => buffer.writeBigUInt64LE(1n, 34) },
    { name: 'empty deposit', code: 'InvalidArgs', edit: buffer => buffer.writeBigUInt64LE(0n, 10) },
  ];
  for (const test of cases) {
    const payload = Buffer.from(data);
    test.edit(payload);
    const ix = new TransactionInstruction({ programId: d.program, data: payload,
      keys: instruction.accounts.map((index, position) => ({ pubkey: keys.get(index), isSigner: position === 0, isWritable: message.isAccountWritable(index) })) });
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: keys.get(0), recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message());
    const result = await connection.simulateTransaction(transaction, { sigVerify: false, commitment: 'confirmed' });
    assert(result.value.err, `${test.name} unexpectedly accepted`);
    assert(result.value.logs.some(line => line.includes(`Error Code: ${test.code}.`)), `${test.name}: ${JSON.stringify(result.value)}`);
    console.log(JSON.stringify({ test: test.name, rejectedWith: test.code }));
  }
  assert.deepEqual(await snapshot(), before, 'Account records changed during simulation');
  console.log(JSON.stringify({ network: 'devnet', submitted: false, signatureVerification: false, recordsUnchanged: true,
    boundary: 'Game instruction guards only, not wallet authentication', originalDeposit: signature }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
