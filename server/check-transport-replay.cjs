const { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;
const { devnetConnection } = require('./ufo-devnet-rpc.cjs');
const { decoder } = require('./read-devnet-game-checkpoint.cjs');

// Simulation only: this file never signs or submits a transaction.
async function main() {
  const { connection } = await devnetConnection();
  const d = decoder();
  const signature = '3uKqrhT94DoJTmLKgwsku9PkrKkWFjUXPMf1ich2GDujaJfepfndEumX9mUQCmMPkomePz8Avr36Zgjrn8CaVB5f';
  const original = await connection.getTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
  if (!original || original.meta.err) throw Error('Successful return evidence unavailable');
  const message = original.transaction.message;
  const keys = message.getAccountKeys({ accountKeysFromLookups: original.meta.loadedAddresses });
  const inner = original.meta.innerInstructions.flatMap(group => group.instructions)
    .filter(ix => keys.get(ix.programIdIndex).equals(d.program));
  if (inner.length !== 1 || inner[0].accounts.length !== 6) throw Error('Unexpected return instruction');
  const instruction = inner[0];
  const source = keys.get(instruction.accounts[2]);
  const read = async () => {
    const account = await connection.getAccountInfo(source, 'confirmed');
    if (!account || !account.owner.equals(d.program)) throw Error('Unexpected planet owner');
    const state = d.deserializePlanetState(account.data);
    return { smallCargo: state.smallCargo, activeMissions: state.activeMissions,
      occupiedSlots: state.missions.filter(mission => mission.missionType !== 0).length };
  };
  const before = await read();
  if (before.smallCargo !== 1 || before.activeMissions !== 0 || before.occupiedSlots !== 0) throw Error('Completed transport checkpoint changed');
  const ix = new TransactionInstruction({ programId: d.program,
    keys: instruction.accounts.map((index, position) => ({ pubkey: keys.get(index), isSigner: position === 0, isWritable: message.isAccountWritable(index) })),
    data: Buffer.from(bs58.decode(instruction.data)) });
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: keys.get(0), recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message());
  const result = await connection.simulateTransaction(tx, { sigVerify: false, commitment: 'confirmed' });
  const after = await read();
  console.log(JSON.stringify({ network: 'devnet', submitted: false, signatureVerification: false,
    boundary: 'Game instruction rejection only; not wallet signature authentication',
    originalReturn: signature, before, after, error: result.value.err, logs: result.value.logs }, null, 2));
  const expectedError = result.value.err?.InstructionError?.[1]?.Custom === 6015;
  const reachedGameGuard = result.value.logs?.some(line => line.includes('Error Code: InvalidMission.'));
  if (!expectedError || !reachedGameGuard || JSON.stringify(before) !== JSON.stringify(after)) throw Error('Replay guard check failed');
}

main().catch(() => { console.error('Transport replay check failed; no transaction submitted.'); process.exitCode = 1; });
