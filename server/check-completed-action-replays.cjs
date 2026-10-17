const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;
const manifest = require('../src/alliance-lookup-table.json');

// Rebuild historical inner instructions for unsigned simulation, never submission.
async function main() {
  const connection = new Connection('https://chained-universe.vercel.app/api/solana-rpc');
  assert.equal(await connection.getGenesisHash(), manifest.genesis);
  const cases = [
    { name: 'filled market offer cannot settle twice', program: '6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA', signature: '2vGNgoTQbkiMN3bjjfTA1CSHRWi5KGdZwkuiEfAtnhYwZz42ujpn7kB52F9W6sA64TAP5i3bjL1VN8aSmM72gDGA', expected: 'AccountNotInitialized' },
    { name: 'completed transport return', program: manifest.addresses[0], signature: '3uKqrhT94DoJTmLKgwsku9PkrKkWFjUXPMf1ich2GDujaJfepfndEumX9mUQCmMPkomePz8Avr36Zgjrn8CaVB5f', expected: 'InvalidMission' },
    { name: 'collected fighter queue', program: manifest.addresses[0], signature: '2NrjpCe4KsEB2GNuaW9LMddr2ZseTxRNbAeCwThXBo5j9xRaDLrh4ogX3YSZSCHU6q8vD454D25qbY3yykwT4VGP', expected: 'NoShipBuild' },
    { name: 'cancelled market offer', program: '6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA', signature: '3NhZnGrPqVStfLQUmmN8bz74SQFnWUXq46u1f7AvnnN4ZEohtUqgL3eFEPDFX2CeSpmNejptSzTYFB943MjzpBZx', expected: 'AccountNotInitialized' },
    { name: 'already resolved alliance rejection', program: manifest.addresses[0], signature: '4NBSKvK9jB4g5eEhcPkB3jH74UJwtbfsa425EGi1tGPgvnQXU3g8Fjz71KEhd7DA9bekhpzvkFnkrXxnzYMVe3Bw', expected: 'AccountNotInitialized' },
    { name: 'already resolved alliance approval', program: manifest.addresses[0], signature: '3ukW5UbK2xLbsYpeuvUin4E79tAUu979yTECiB8GuLXikCRRtj8WxF1twfihuJTqL5b1MSBKQKdtJw4zW52dHKMY', expected: 'AccountNotInitialized' },
  ];
  for (const item of cases) {
    const program = new PublicKey(item.program);
    const original = await connection.getTransaction(item.signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
    assert(original && original.meta.err === null);
    const message = original.transaction.message;
    const keys = message.getAccountKeys({ accountKeysFromLookups: original.meta.loadedAddresses });
    const found = original.meta.innerInstructions.flatMap(group => group.instructions).filter(ix => keys.get(ix.programIdIndex).equals(program));
    assert.equal(found.length, 1);
    const instruction = found[0];
    const addresses = instruction.accounts.map(index => keys.get(index));
    const snapshot = async () => (await connection.getMultipleAccountsInfo(addresses, 'confirmed')).map(account => account && ({
      lamports: account.lamports, hash: createHash('sha256').update(account.data).digest('hex'),
    }));
    const before = await snapshot();
    const ix = new TransactionInstruction({ programId: program, data: Buffer.from(bs58.decode(instruction.data)),
      keys: instruction.accounts.map((index, position) => ({ pubkey: keys.get(index), isSigner: position === 0, isWritable: message.isAccountWritable(index) })) });
    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: new PublicKey(manifest.sponsor), recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message());
    const result = await connection.simulateTransaction(transaction, { sigVerify: false, commitment: 'confirmed' });
    assert(result.value.err, `${item.name} unexpectedly accepted`);
    assert(result.value.logs.some(line => line.includes(`Program ${program.toBase58()} invoke`)));
    const guard = result.value.logs.find(line => line.includes('Error Code:'));
    assert(guard, JSON.stringify(result.value.logs));
    if (item.expected) assert(guard.includes(`Error Code: ${item.expected}.`), guard);
    assert.deepEqual(await snapshot(), before);
    console.log(JSON.stringify({ test: item.name, original: item.signature, guard, error: result.value.err, recordsUnchanged: true }));
  }
  console.log(JSON.stringify({ network: 'devnet', submitted: false, signatureVerification: false,
    boundary: 'Program replay rejection only, not wallet authentication or successful settlement' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
