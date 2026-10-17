const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {PublicKey, Keypair, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction} = require('@solana/web3.js');
const {_test} = require('./lazor-paymaster.js');
const {storeTransactionFixture} = require('../server/store-transaction-fixture.cjs');
const game = new PublicKey(require('../src/ufo-lookup-table.json').addresses[0]);
const market = new PublicKey('6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA');
const pda = (seed,key) => PublicKey.findProgramAddressSync([Buffer.from(seed),...(key?[key.toBuffer()]:[])],market)[0];
async function fixture(rent, mutate = ()=>{}) {
  return storeTransactionFixture(rent, inner=>{
    const owner=inner.at(-1).keys[0].pubkey, planet=Keypair.generate().publicKey;
    const args=Buffer.alloc(17);args.writeBigUInt64LE(1000n,1);args.writeBigUInt64LE(1000000n,9);
    inner[inner.length-1]=new TransactionInstruction({programId:market, keys:[owner,pda('market_config'),pda('seller_counter',owner),Keypair.generate().publicKey,
      pda('planet_market_obligation',planet),pda('planet_listing_index',planet),game,planet,SystemProgram.programId].map((pubkey,index)=>({pubkey,isSigner:index===0,isWritable:![5,6,8].includes(index)})),
      data:Buffer.concat([crypto.createHash('sha256').update('global:create_offer').digest().subarray(0,8),args])});
    mutate(inner);
  }, 'https://frontend-5qbez2oeb-srmessisols-projects.vercel.app');
}
test('real SDK market listing packets fit with and without first-seller rent',async()=>{
  for(const rent of [false,true]) {
    const f=await fixture(rent);
    const raw=f.transaction.serialize().length, compressed=f.compressed.serialize().length;
    console.log(JSON.stringify({rent,raw,compressed}));
    assert(compressed<=1232);assert(compressed<raw);
    const policy=_test.assertTransactionPolicy(f.compressed,{publicKey:f.payer},[f.table]);
    assert.equal(policy.approvedRentBundle,rent);
    assert.equal(policy.maximumDebit,rent?50000000:250000);
  }
});
test('market compression rejects extra actions, invalid terms and substituted fixed accounts',async()=>{
  for(const mutate of [
    ...[1,2,4,5,6,8].map(i=>inner=>{inner.at(-1).keys[i].pubkey=Keypair.generate().publicKey;}),
    inner=>{inner.at(-1).data[8]=3;},
    inner=>{inner.at(-1).data.writeBigUInt64LE(999n,9);},
    inner=>{inner.at(-1).data.writeBigUInt64LE(0n,17);},
    inner=>{inner.at(-1).data=Buffer.concat([inner.at(-1).data,Buffer.from([0])]);},
    inner=>{inner.push(inner.at(-1));},
    inner=>{inner[0].keys[1].pubkey=Keypair.generate().publicKey;},
  ]) {
    const f=await fixture(true,mutate);
    assert.throws(()=>_test.assertTransactionPolicy(f.compressed,{publicKey:f.payer},[f.table]));
  }
});
test('market compression requires one preceding passkey and exactly one wallet execute',async()=>{
  for(const change of [xs=>xs.slice(1),xs=>[...xs,xs.at(-1)],xs=>[...xs].reverse()]) {
    const f=await fixture(false);
    const tx=new VersionedTransaction(new TransactionMessage({payerKey:f.payer,recentBlockhash:PublicKey.default.toBase58(),instructions:change(f.wrapped)}).compileToV0Message([f.table]));
    assert.throws(()=>_test.assertTransactionPolicy(tx,{publicKey:f.payer},[f.table]));
  }
});
