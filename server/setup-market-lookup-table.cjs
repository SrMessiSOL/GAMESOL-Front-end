const fs = require('node:fs');
const path = require('node:path');
const {parseEnv} = require('node:util');
const bs58 = require('bs58');
const {Connection,PublicKey,Keypair,AddressLookupTableProgram,Transaction} = require('@solana/web3.js');
const {ASSOCIATED_TOKEN_PROGRAM_ID} = require('@solana/spl-token');
const base = require('../src/alliance-lookup-table.json');
const output = path.join(__dirname,'../src/market-lookup-table.json');
async function main() {
  const rpc = new Connection('https://chained-universe.vercel.app/api/solana-rpc','confirmed');
  if(await rpc.getGenesisHash()!==base.genesis) throw Error('Devnet required');
  const market=new PublicKey('6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA');
  const pda=seed=>PublicKey.findProgramAddressSync([Buffer.from(seed)],market)[0];
  const addresses=[...new Set([...base.addresses,market.toBase58(),pda('market_config').toBase58(),pda('market_escrow').toBase58(),pda('market_authority').toBase58(),ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()])];
  const rent=await rpc.getMinimumBalanceForRentExemption(56+32*addresses.length);
  if(rent+100000>20000000) throw Error('0.02 test SOL budget exceeded');
  if(!process.argv.includes('--send')) { console.log(JSON.stringify({network:'devnet',addresses:addresses.length,rentLamports:rent,maxFeesLamports:100000}));return; }
  const env=parseEnv(fs.readFileSync(path.join(__dirname,'../.env.nft.server.local'),'utf8'));
  const raw=env.GAMESOL_DEVNET_SPONSOR_SECRET.trim().replace(/\\r$/,'');
  const payer=Keypair.fromSecretKey(raw.startsWith('[')?Uint8Array.from(JSON.parse(raw)):bs58.decode(raw));
  if(payer.publicKey.toBase58()!==base.sponsor) throw Error('Existing devnet payer mismatch');
  let record=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):null;
  if(record&&(record.sponsor!==base.sponsor||JSON.stringify(record.addresses)!==JSON.stringify(addresses)))throw Error('Manifest mismatch');
  const save=()=>fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');
  async function send(ixs,label) {
    const tx=new Transaction().add(...ixs);tx.feePayer=payer.publicKey;
    tx.recentBlockhash=(await rpc.getLatestBlockhash()).blockhash;tx.sign(payer);
    const bytes=tx.serialize();if(bytes.length>1232)throw Error('Setup packet too large');
    const signature=bs58.encode(tx.signature);
    record.pending={label,signature};save();
    await rpc.sendRawTransaction(bytes,{skipPreflight:false,maxRetries:3});
    for(let n=0;n<90;n++) {
      const status=(await rpc.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
      if(status?.err)throw Error(`Setup rejected; reconcile ${signature}`);
      if(status?.confirmationStatus==='finalized'){record.signatures.push({label,signature});delete record.pending;save();return;}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    throw Error(`Confirmation pending; reconcile ${signature} before retry`);
  }
  if(record?.pending)throw Error(`Pending setup requires reconciliation: ${record.pending.signature}`);
  const startingBalance=await rpc.getBalance(payer.publicKey);
  if(startingBalance<rent+100000)throw Error('Insufficient test SOL');
  if(!record) {
    const [create,table]=AddressLookupTableProgram.createLookupTable({authority:payer.publicKey,payer:payer.publicKey,recentSlot:await rpc.getSlot('finalized')});
    record={network:'devnet',genesis:base.genesis,sponsor:base.sponsor,table:table.toBase58(),addresses,antimatterMint:base.antimatterMint,treasuryAntimatter:base.treasuryAntimatter,signatures:[]};save();
    await send([create,AddressLookupTableProgram.extendLookupTable({authority:payer.publicKey,payer:payer.publicKey,lookupTable:table,addresses:addresses.slice(0,16).map(x=>new PublicKey(x))})],'create and extend');
  }
  const table=new PublicKey(record.table);
  let account=(await rpc.getAddressLookupTable(table)).value;
  if(!account||account.state.addresses.some((x,i)=>x.toBase58()!==addresses[i]))throw Error('On-chain table prefix mismatch');
  if(account.state.addresses.length<addresses.length) {
    if(!account.state.authority?.equals(payer.publicKey))throw Error('Unexpected table authority');
    await send([AddressLookupTableProgram.extendLookupTable({authority:payer.publicKey,payer:payer.publicKey,lookupTable:table,addresses:addresses.slice(account.state.addresses.length).map(x=>new PublicKey(x))})],'extend remaining');
  }
  account=(await rpc.getAddressLookupTable(table)).value;
  if(account.state.addresses.length!==addresses.length)throw Error('Table length mismatch');
  if(account.state.authority) {
    if(!account.state.authority.equals(payer.publicKey))throw Error('Unexpected freeze authority');
    await send([AddressLookupTableProgram.freezeLookupTable({authority:payer.publicKey,lookupTable:table})],'freeze');
  }
  account=(await rpc.getAddressLookupTable(table)).value;
  if(!account||account.state.authority||!account.isActive()||JSON.stringify(account.state.addresses.map(x=>x.toBase58()))!==JSON.stringify(addresses))throw Error('Frozen table verification failed');
  const spent=startingBalance-await rpc.getBalance(payer.publicKey);
  if(spent>20000000)throw Error('Budget exceeded');
  record.verifiedFrozen=true;record.spentLamports=spent;save();
  console.log(JSON.stringify({table:record.table,frozen:true,spentLamports:spent,signatures:record.signatures}));
}
main().catch(e=>{console.error(String(e.message).replace(/https?:\/\/\S+/g,'[RPC]'));process.exitCode=1;});
