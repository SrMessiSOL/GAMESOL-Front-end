const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const manifest = require('../src/alliance-lookup-table.json');
const { decoder } = require('./read-devnet-game-checkpoint.cjs');

// Unsigned simulations only: this script never signs or submits a transaction.
async function main() {
  const connection = new Connection('https://chained-universe.vercel.app/api/solana-rpc', 'confirmed');
  assert.equal(await connection.getGenesisHash(), manifest.genesis);
  const d = decoder();
  const cases = [
    { name: 'duplicate monthly Sector Reserve', signature: '2FW31wVJgW5CvbNGWLqpztUapFRNA9aofe58pr1DUivZzF17ziCmycAHeDFfhaYYADSK2VoMVULqpWCKQrfoMFek', expected: 'AllianceMissionAlreadyClaimed' },
    { name: 'regular member cannot upgrade infrastructure', signature: '5WmzGZvqGVbN7EE6aT9D85Tojnwt5aNxXaM9cgb8Dp8y1s5bwVa3yvE8do6oHFm5JgY4tp1pSDafb4Ru9oZjCZ8T', member: true, expected: 'AllianceLeaderRequired' },
    { name: 'leader cannot buy an unfunded Research Grid level 3', signature: '5WmzGZvqGVbN7EE6aT9D85Tojnwt5aNxXaM9cgb8Dp8y1s5bwVa3yvE8do6oHFm5JgY4tp1pSDafb4Ru9oZjCZ8T', expected: 'AllianceTreasuryNotEnoughResources' },
  ];
  for (const item of cases) {
    const original = await connection.getTransaction(item.signature, {commitment:'finalized', maxSupportedTransactionVersion:0});
    assert(original?.meta && original.meta.err === null);
    const message = original.transaction.message;
    const keys = message.getAccountKeys({accountKeysFromLookups:original.meta.loadedAddresses});
    const found = original.meta.innerInstructions.flatMap(group => group.instructions).filter(ix => keys.get(ix.programIdIndex).equals(d.program));
    assert.equal(found.length, 1);
    const originalIx = found[0];
    const accounts = originalIx.accounts.map((index, position) => ({pubkey:keys.get(index), isSigner:position === 0, isWritable:message.isAccountWritable(index)}));
    if (item.member) {
      const member = new PublicKey('Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd');
      accounts[0] = {...accounts[0], pubkey:member};
      accounts[2] = {...accounts[2], pubkey:d.deriveAllianceMembershipPda(member)};
    }
    const snapshot = async () => (await connection.getMultipleAccountsInfo(accounts.map(a => a.pubkey))).map(a => a && ({lamports:a.lamports, owner:a.owner.toBase58(), hash:createHash('sha256').update(a.data).digest('hex')}));
    const before = await snapshot();
    const ix = new TransactionInstruction({programId:d.program, keys:accounts, data:Buffer.from(bs58.decode(originalIx.data))});
    const {blockhash} = await connection.getLatestBlockhash();
    const transaction = new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(manifest.sponsor),recentBlockhash:blockhash,instructions:[ix]}).compileToV0Message());
    const result = await connection.simulateTransaction(transaction, {sigVerify:false,commitment:'confirmed'});
    assert(result.value.err, `${item.name} was unexpectedly accepted`);
    const guard = result.value.logs?.find(line => line.includes('Error Code:'));
    assert(guard?.includes(`Error Code: ${item.expected}.`), JSON.stringify(result.value.logs));
    assert.deepEqual(await snapshot(), before);
    console.log(JSON.stringify({test:item.name,guard,error:result.value.err,recordsUnchanged:true}));
  }
  console.log(JSON.stringify({network:'devnet',submitted:false,signatureVerification:false,boundary:'Program business-rule rejection, not wallet authentication'}));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
