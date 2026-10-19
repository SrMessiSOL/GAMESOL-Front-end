const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction} = require('@solana/web3.js');
const bs58 = require('bs58');
const manifest = require('../src/market-lookup-table.json');
const MARKET = new PublicKey('6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA');
const LAZOR = new PublicKey('4h3XoNReAgEcHVxcZ8sw2aufi9MTr7BbvYYjzjWDyDxS');
const GAME = new PublicKey(manifest.addresses[0]);
const purchases = [
  '4hLMw8kfkDwrxQ7aqRSYahyZ5bpzmKbXpQk2mjHv8HFirRgtQwsZxiyS7bxjdvjf1L22rMViGM1hPFfTjzQejAUn',
  '21qah5jhv6QrtrPVhBsoaK51xvX8PVhLGJaPjFzXfjZbhs8NdtS7ZfMppK5AMnYnivoPfL6kpKz8ZJuDBVJCkRf8',
];

// Program-state rejection simulations only. No signing, submission or authentication claims.
async function main() {
  const rpc = new Connection('https://chained-universe.vercel.app/api/solana-rpc', 'confirmed');
  assert.equal(await rpc.getGenesisHash(), manifest.genesis);
  const table = (await rpc.getAddressLookupTable(new PublicKey(manifest.table))).value;
  assert(table && table.isActive() && !table.state.authority);
  assert.deepEqual(table.state.addresses.map(key => key.toBase58()), manifest.addresses);
  const results = [];
  for (const [index, signature] of purchases.entries()) {
    const receipt = await rpc.getTransaction(signature, {commitment: 'finalized', maxSupportedTransactionVersion: 0});
    assert(receipt && receipt.meta.err === null);
    const message = receipt.transaction.message;
    const keys = message.getAccountKeys({accountKeysFromLookups: receipt.meta.loadedAddresses});
    const inner = receipt.meta.innerInstructions.flatMap(group => group.instructions);
    const market = inner.filter(ix => keys.get(ix.programIdIndex).equals(MARKET));
    assert.equal(market.length, 1);
    const deferred = message.compiledInstructions.find(ix => keys.get(ix.programIdIndex).equals(LAZOR));
    assert.equal(deferred.data[0], 7);
    const cases = [
      {name: `filled planet purchase ${index + 1}`, program: MARKET, accounts: market[0].accounts, data: Buffer.from(bs58.decode(market[0].data)), signerPositions: [0], expected: 'AccountNotInitialized'},
      {name: `consumed Lazor purchase approval ${index + 1}`, program: LAZOR, accounts: Array.from(deferred.accountKeyIndexes), data: Buffer.from(deferred.data), outer: true},
    ];
    if (index === 1) {
      const transfer = inner.filter(ix => keys.get(ix.programIdIndex).equals(GAME));
      assert.equal(transfer.length, 1);
      cases.push({name: 'previous seller cannot reuse transferred ownership', program: GAME, accounts: transfer[0].accounts,
        data: Buffer.from(bs58.decode(transfer[0].data)), signerPositions: [1, 6], expected: 'Unauthorized'});
    }
    for (const item of cases) {
      const metas = item.accounts.map((keyIndex, position) => ({pubkey: keys.get(keyIndex),
        isSigner: item.outer ? message.isAccountSigner(keyIndex) : item.signerPositions.includes(position),
        isWritable: message.isAccountWritable(keyIndex)}));
      const snapshot = async () => (await rpc.getMultipleAccountsInfo(metas.map(meta => meta.pubkey))).map(account => account && ({
        lamports: account.lamports, owner: account.owner.toBase58(), hash: createHash('sha256').update(account.data).digest('hex'),
      }));
      const before = await snapshot();
      const instruction = new TransactionInstruction({programId: item.program, keys: metas, data: item.data});
      const tx = new VersionedTransaction(new TransactionMessage({payerKey: new PublicKey(manifest.sponsor),
        recentBlockhash: (await rpc.getLatestBlockhash()).blockhash, instructions: [instruction]}).compileToV0Message(item.outer ? [table] : []));
      const simulation = await rpc.simulateTransaction(tx, {sigVerify: false, commitment: 'confirmed'});
      assert(simulation.value.err, `${item.name} unexpectedly succeeded`);
      assert(simulation.value.logs?.some(line => line.includes(`Program ${item.program.toBase58()} invoke`)), JSON.stringify(simulation.value.logs));
      const guard = simulation.value.logs.find(line => line.includes('Error Code:'));
      if (item.expected) assert(guard?.includes(`Error Code: ${item.expected}.`), JSON.stringify(simulation.value.logs));
      assert.deepEqual(await snapshot(), before);
      results.push({name: item.name, error: simulation.value.err, guard: guard || simulation.value.logs.at(-1), recordsUnchanged: true});
    }
  }
  console.log(JSON.stringify({network: 'devnet', submitted: false, signatureVerification: false,
    boundary: 'Program replay and current-ownership rejection only, not wallet authentication or new settlement', results}, null, 2));
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
