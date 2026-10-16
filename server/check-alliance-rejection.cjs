const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const manifest = require('../src/alliance-lookup-table.json');

// Simulation only. The pending real request is never consumed by this helper.
async function main() {
  const connection = new Connection('https://chained-universe.vercel.app/api/solana-rpc');
  assert.equal(await connection.getGenesisHash(), manifest.genesis);
  const program = new PublicKey(manifest.addresses[0]);
  const leader = new PublicKey('G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r');
  const applicant = new PublicKey('Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd');
  const alliance = new PublicKey('7EJgwFu4wckh1wY2fxCfmfvi7EFmeEorMuwYQA8iC4Kp');
  const derive = seeds => PublicKey.findProgramAddressSync(seeds, program)[0];
  const membership = derive([Buffer.from('alliance_membership'), leader.toBuffer()]);
  const request = derive([Buffer.from('alliance_join_request'), alliance.toBuffer(), applicant.toBuffer()]);
  const addresses = [leader, alliance, membership, applicant, request];
  const snapshot = async () => (await connection.getMultipleAccountsInfo(addresses, 'confirmed')).map(account => account && ({
    lamports: account.lamports, hash: createHash('sha256').update(account.data).digest('hex'),
  }));
  assert(await connection.getAccountInfo(request), 'No pending test request');
  const before = await snapshot();
  for (const writable of [false, true]) {
    const ix = new TransactionInstruction({ programId: program,
      data: createHash('sha256').update('global:reject_join_request').digest().subarray(0, 8),
      keys: addresses.map((pubkey, index) => ({ pubkey, isSigner: index === 0, isWritable: index === 0 || index === 4 || (index === 3 && writable) })),
    });
    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: new PublicKey(manifest.sponsor), recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message());
    const result = await connection.simulateTransaction(transaction, { sigVerify: false, commitment: 'confirmed' });
    if (writable) assert.equal(result.value.err, null, JSON.stringify(result.value.logs));
    else assert(result.value.logs.some(line => line.includes('Error Code: ConstraintMut.')));
    console.log(JSON.stringify({ applicantWritable: writable, error: result.value.err }));
  }
  assert.deepEqual(await snapshot(), before);
  console.log(JSON.stringify({ submitted: false, signatureVerification: false, recordsUnchanged: true,
    boundary: 'Program account-contract simulation, not signed wallet execution' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
