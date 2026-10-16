const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const manifest = require('../src/alliance-lookup-table.json');
const program = new PublicKey(manifest.addresses[0]);
const leader = new PublicKey('G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r');
const member = new PublicKey('Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd');
const alliance = new PublicKey('7EJgwFu4wckh1wY2fxCfmfvi7EFmeEorMuwYQA8iC4Kp');
const membership = owner => PublicKey.findProgramAddressSync([Buffer.from('alliance_membership'), owner.toBuffer()], program)[0];
const discriminator = name => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);

// No keypairs, signing or submission. This isolates program guards, NOT wallet authentication.
async function main() {
  const connection = new Connection('https://chained-universe.vercel.app/api/solana-rpc', 'confirmed');
  assert.equal(await connection.getGenesisHash(), manifest.genesis);
  const addresses = [alliance, membership(leader), membership(member)];
  const snapshot = async () => {
    const accounts = await connection.getMultipleAccountsInfo(addresses, 'confirmed');
    assert.ok(accounts.every(account => account?.owner.equals(program)));
    assert.equal(accounts[0].data.readUInt16LE(82), 2);
    assert.equal(accounts[1].data[72], 2);
    assert.equal(accounts[2].data[72], 1);
    return accounts.map(account => createHash('sha256').update(account.data).digest('hex'));
  };
  const before = await snapshot();
  const cases = [
    { action: 'expel_alliance_member', owner: member, target: leader, expected: 'AllianceLeaderRequired', writable: [0, 1, 3, 4] },
    { action: 'transfer_alliance_leadership', owner: member, target: leader, expected: 'AllianceLeaderRequired', writable: [0, 1, 2, 4] },
    { action: 'leave_alliance', owner: leader, expected: 'AllianceFounderCannotLeave', writable: [0, 1, 2] },
  ];
  const results = [];
  for (const item of cases) {
    const keys = [item.owner, alliance, membership(item.owner), ...(item.target ? [item.target, membership(item.target)] : [])];
    const ix = new TransactionInstruction({ programId: program, keys: keys.map((pubkey, index) => ({ pubkey, isSigner: index === 0, isWritable: item.writable.includes(index) })), data: discriminator(item.action) });
    const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: new PublicKey(manifest.sponsor),
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash, instructions: [ix] }).compileToV0Message());
    const result = await connection.simulateTransaction(transaction, { sigVerify: false, commitment: 'confirmed' });
    assert.ok(result.value.err, `${item.action} must be rejected`);
    const guard = result.value.logs?.find(line => line.includes(`Error Code: ${item.expected}.`));
    assert.ok(guard, `Did not reach expected guard: ${JSON.stringify(result.value.logs)}`);
    results.push({ action: item.action, expected: item.expected, error: result.value.err, guard });
  }
  const after = await snapshot();
  assert.deepEqual(after, before, 'Alliance records changed during the read-only checks');
  console.log(JSON.stringify({ network: 'devnet', submitted: false, signatureVerification: false,
    boundary: 'Program permission rejection only; not wallet authentication or successful action execution',
    recordsUnchanged: true, results }, null, 2));
}
main().catch(error => { console.error(String(error.message).replace(/https?:\/\/\S+/g, '[RPC]')); process.exitCode = 1; });
