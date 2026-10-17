const {PublicKey,Keypair,SystemProgram,TransactionInstruction,TransactionMessage,VersionedTransaction,AddressLookupTableAccount} = require('@solana/web3.js');
const {TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,createAssociatedTokenAccountInstruction,getAssociatedTokenAddressSync} = require('@solana/spl-token');
const {storeTransactionFixture} = require('./store-transaction-fixture.cjs');
const manifest = require('../src/alliance-lookup-table.json');
const game = new PublicKey(manifest.addresses[0]);
const market = new PublicKey('6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA');
const pda = (seed,key)=>PublicKey.findProgramAddressSync([Buffer.from(seed),...(key?[key.toBuffer()]:[])],market)[0];
async function marketBuyerFixture(setup,mutate=()=>{},dedicated=false) {
  const f=await storeTransactionFixture(false,inner=>{
    const buyer=inner[0].keys[0].pubkey,seller=Keypair.generate().publicKey,planet=Keypair.generate().publicKey;
    const mint=new PublicKey(manifest.antimatterMint),sellerAta=getAssociatedTokenAddressSync(mint,seller,true);
    const keys=[buyer,seller,pda('market_config'),Keypair.generate().publicKey,pda('seller_counter',seller),mint,
      getAssociatedTokenAddressSync(mint,buyer,true),sellerAta,pda('market_escrow'),new PublicKey(manifest.treasuryAntimatter),
      pda('market_authority'),TOKEN_PROGRAM_ID,SystemProgram.programId,game,planet,pda('planet_market_obligation',planet),Keypair.generate().publicKey];
    inner[0]=new TransactionInstruction({programId:market,keys:keys.map((pubkey,index)=>({pubkey,isSigner:index===0,isWritable:![10,11,12,13].includes(index)})),data:Buffer.from([227,82,234,131,1,18,48,2])});
    if(setup) {
      inner.unshift(createAssociatedTokenAccountInstruction(buyer,sellerAta,seller,mint,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID));
      inner.unshift(new TransactionInstruction({programId:game,keys:[{pubkey:new PublicKey(manifest.sponsor),isSigner:true,isWritable:true},{pubkey:buyer,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}],
        data:Buffer.concat([Buffer.from([87,113,100,97,218,156,201,21]),Buffer.alloc(8)])}));
    }
    mutate(inner);
  },'https://chained-universe.vercel.app');
  const tableManifest=dedicated?require('../src/market-lookup-table.json'):manifest;
  const addresses=tableManifest.addresses.map(x=>new PublicKey(x));
  const table=new AddressLookupTableAccount({key:new PublicKey(tableManifest.table),state:{...f.table.state,addresses}});
  const compressed=new VersionedTransaction(new TransactionMessage({payerKey:f.payer,recentBlockhash:PublicKey.default.toBase58(),instructions:f.wrapped}).compileToV0Message([table]));
  return {...f,table,compressed};
}
module.exports={marketBuyerFixture};
if(require.main===module)(async()=>{for(const setup of [false,true]){const f=await marketBuyerFixture(setup),dedicated=await marketBuyerFixture(setup,undefined,true);let raw;try{raw=f.transaction.serialize().length;}catch{raw='exceeds serializer capacity';}console.log(JSON.stringify({setup,raw,existingTable:f.compressed.serialize().length,proposedTable:dedicated.compressed.serialize().length}));}})().catch(e=>{console.error(e.message);process.exitCode=1});
