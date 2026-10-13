const fs = require('node:fs');
const path = require('node:path');
const { LazorKitClient } = require('@lazorkit/wallet');
const { AddressLookupTableProgram, Connection, Keypair, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { PROGRAM, DEVNET_GENESIS } = require('./ufo-attestations.cjs');
const feePayerAddress = new PublicKey('HAHnFdgoASDzzma7fP9nfKo5nByU1uStYR964QhWnL2X');
const recordPath = path.resolve(__dirname, '../.vercel/ufo-active-release-25a1dc5/lookup-table.json');

async function main() {
  const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
  if (await connection.getGenesisHash() !== DEVNET_GENESIS) throw Error('Devnet required.');
  const response = await fetch('https://chained-universe.vercel.app/api/lazor-paymaster', {
    method: 'POST', headers: { Origin: 'https://chained-universe.vercel.app', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getPayerSigner' }),
  });
  const reply = await response.json();
  if (!response.ok || reply.error) throw Error('Sponsor identity unavailable.');
  const sponsor = new PublicKey(reply.result.signer_address);
  const client = new LazorKitClient(connection);
  const protocol = await client.getProtocolConfig();
  if (!protocol?.enabled || protocol.numShards !== 16) throw Error('Unexpected Lazor fee configuration.');
  const addresses = [PROGRAM, PublicKey.findProgramAddressSync([Buffer.from('ufo_config')], PROGRAM)[0], SystemProgram.programId, SYSVAR_INSTRUCTIONS_PUBKEY,
    client.findProtocolConfig()[0], client.findFeeRecord(sponsor)[0], ...Array.from({ length: protocol.numShards }, (_, index) => client.findTreasuryShard(index)[0])];
  const rent = await connection.getMinimumBalanceForRentExemption(56 + 32 * addresses.length);
  const balance = await connection.getBalance(feePayerAddress);
  console.log(JSON.stringify({ network: 'devnet', addresses: addresses.length, rentLamports: rent, payerBalanceLamports: balance }));
  if (!process.argv.includes('--send')) return;
  if (rent + 100000 > 10000000 || balance < rent + 100000) throw Error('Lookup-table budget unavailable.');
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/home/srmessi/.config/solana/devnet.json', 'utf8'))));
  if (!payer.publicKey.equals(feePayerAddress)) throw Error('Fee payer mismatch.');
  let record = fs.existsSync(recordPath) ? JSON.parse(fs.readFileSync(recordPath, 'utf8')) : null;
  if (record && (record.sponsor !== sponsor.toBase58() || JSON.stringify(record.addresses) !== JSON.stringify(addresses.map(key => key.toBase58())))) throw Error('Existing table record mismatch.');
  if (!record) {
    const [create, table] = AddressLookupTableProgram.createLookupTable({ authority: payer.publicKey, payer: payer.publicKey, recentSlot: await connection.getSlot('finalized') });
    const extend = AddressLookupTableProgram.extendLookupTable({ authority: payer.publicKey, payer: payer.publicKey, lookupTable: table, addresses });
    const signature = await sendAndConfirmTransaction(connection, new Transaction().add(create, extend), [payer], { commitment: 'finalized' });
    record = { network: 'devnet', genesis: DEVNET_GENESIS, table: table.toBase58(), sponsor: sponsor.toBase58(), addresses: addresses.map(key => key.toBase58()), creationSignature: signature };
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  }
  const table = new PublicKey(record.table);
  let account = (await connection.getAddressLookupTable(table)).value;
  if (!account || JSON.stringify(account.state.addresses.map(key => key.toBase58())) !== JSON.stringify(record.addresses)) throw Error('Created table contents mismatch.');
  if (account.state.authority) {
    if (!account.state.authority.equals(payer.publicKey)) throw Error('Table authority mismatch.');
    record.freezeSignature = await sendAndConfirmTransaction(connection, new Transaction().add(AddressLookupTableProgram.freezeLookupTable({ authority: payer.publicKey, lookupTable: table })), [payer], { commitment: 'finalized' });
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n');
  }
  account = (await connection.getAddressLookupTable(table)).value;
  if (!account || account.state.authority || !account.isActive()) throw Error('Table is not immutable and active.');
  console.log(JSON.stringify(record));
}
main().then(() => process.exit(0)).catch(() => { console.error('Devnet UFO lookup-table setup failed.'); process.exit(1); });
