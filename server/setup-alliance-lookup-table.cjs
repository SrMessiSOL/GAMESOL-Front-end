const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const bs58 = require('bs58');
const { Connection, PublicKey, Keypair, AddressLookupTableProgram, Transaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');
const base = require('../src/ufo-lookup-table.json');
const output = path.join(__dirname, '../src/alliance-lookup-table.json');

async function main() {
  const connection = new Connection('https://chained-universe.vercel.app/api/solana-rpc', 'confirmed');
  if (await connection.getGenesisHash() !== base.genesis) throw Error('Devnet required.');
  const env = parseEnv(fs.readFileSync(path.join(__dirname, '../.env.nft.server.local'), 'utf8'));
  const raw = env.GAMESOL_DEVNET_SPONSOR_SECRET.trim().replace(/\\r$/, '');
  const payer = Keypair.fromSecretKey(raw.startsWith('[') ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw));
  if (payer.publicKey.toBase58() !== base.sponsor) throw Error('Sponsor mismatch.');
  const send = async transaction => {
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = payer.publicKey;
    transaction.sign(payer);
    const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
    for (let i = 0; i < 60; i++) {
      const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
      if (status?.err) throw Error('Table setup transaction rejected.');
      if (status?.confirmationStatus === 'finalized') return signature;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw Error(`Confirmation pending; reconcile ${signature} before retry.`);
  };
  const program = new PublicKey(base.addresses[0]);
  const pda = seed => PublicKey.findProgramAddressSync([Buffer.from(seed)], program)[0];
  const game = await connection.getAccountInfo(pda('game_config'));
  const store = await connection.getAccountInfo(pda('store_config'));
  if (!game?.owner.equals(program) || !store?.owner.equals(program)) throw Error('Config owner mismatch.');
  const am = new PublicKey(game.data.subarray(40, 72));
  const admin = new PublicKey(store.data.subarray(8, 40));
  const usdc = new PublicKey(store.data.subarray(40, 72));
  const treasuryUsdc = new PublicKey(store.data.subarray(72, 104));
  const treasuryAm = getAssociatedTokenAddressSync(am, admin, true);
  const addresses = [...new Set([...base.addresses, pda('game_config').toBase58(), pda('store_config').toBase58(),
    am.toBase58(), usdc.toBase58(), treasuryAm.toBase58(), treasuryUsdc.toBase58(), TOKEN_PROGRAM_ID.toBase58()])];
  const rent = await connection.getMinimumBalanceForRentExemption(56 + 32 * addresses.length);
  if (rent + 100000 > 20000000 || addresses.length > 40) throw Error('Setup budget exceeded.');
  let record = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  if (record && (record.sponsor !== base.sponsor || JSON.stringify(record.addresses) !== JSON.stringify(addresses))) throw Error('Existing table mismatch.');
  if (!process.argv.includes('--send')) { console.log({ network: 'devnet', addresses: addresses.length, rentLamports: rent, existing: !!record }); return; }
  if (!record && process.argv.includes('--recover')) {
    const table = new PublicKey('75BH1eVqgoUm3UK5bW9GSQgQdsE7QV1Jcsw244xsuqPv');
    const account = (await connection.getAddressLookupTable(table)).value;
    if (!account?.state.authority?.equals(payer.publicKey) || JSON.stringify(account.state.addresses.map(x => x.toBase58())) !== JSON.stringify(addresses)) throw Error('Recovery table mismatch.');
    record = { network: 'devnet', genesis: base.genesis, sponsor: base.sponsor, table: table.toBase58(), addresses,
      antimatterMint: am.toBase58(), usdcMint: usdc.toBase58(), treasuryAntimatter: treasuryAm.toBase58(), treasuryUsdc: treasuryUsdc.toBase58(),
      creationSignature: '2QTTTR45qVNp4vw6M8rkPGDsWKsz9hqHccVNXMCRxVfnc8krchXQLgp6akMW3ZdmgycfRA6qbAdZNLYNDgfSoDK8' };
    fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  }
  if (!record) {
    const [create, table] = AddressLookupTableProgram.createLookupTable({ authority: payer.publicKey, payer: payer.publicKey, recentSlot: await connection.getSlot('finalized') });
    const extend = AddressLookupTableProgram.extendLookupTable({ authority: payer.publicKey, payer: payer.publicKey, lookupTable: table, addresses: addresses.map(x => new PublicKey(x)) });
    const signature = await send(new Transaction().add(create, extend));
    record = { network: 'devnet', genesis: base.genesis, sponsor: base.sponsor, table: table.toBase58(), addresses,
      antimatterMint: am.toBase58(), usdcMint: usdc.toBase58(), treasuryAntimatter: treasuryAm.toBase58(), treasuryUsdc: treasuryUsdc.toBase58(), creationSignature: signature };
    fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  }
  const table = new PublicKey(record.table);
  let account = (await connection.getAddressLookupTable(table)).value;
  if (!account || JSON.stringify(account.state.addresses.map(x => x.toBase58())) !== JSON.stringify(addresses)) throw Error('Table contents mismatch.');
  if (account.state.authority) {
    if (!account.state.authority.equals(payer.publicKey)) throw Error('Unexpected authority.');
    record.freezeSignature = await send(new Transaction().add(AddressLookupTableProgram.freezeLookupTable({ authority: payer.publicKey, lookupTable: table })));
    fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n');
  }
  account = (await connection.getAddressLookupTable(table)).value;
  if (!account || account.state.authority || !account.isActive()) throw Error('Table not frozen and active.');
  console.log({ table: record.table, rentLamports: rent, frozen: true, creation: record.creationSignature, freeze: record.freezeSignature });
}
main().catch(error => { console.error('Alliance lookup setup failed:', String(error.message).replace(/https?:\/\/\S+/g, '[RPC]')); process.exitCode = 1; });
