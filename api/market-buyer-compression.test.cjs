const test=require('node:test');
const assert=require('node:assert/strict');
const {Keypair,PublicKey,TransactionMessage,VersionedTransaction}=require('@solana/web3.js');
const {_test}=require('./lazor-paymaster.js');
const {marketBuyerFixture}=require('../server/market-buyer-fixture.cjs');
test('real SDK buyer packets fit the frozen market table including first-seller ATA setup',async()=>{
  for(const setup of [false,true]) {
    const f=await marketBuyerFixture(setup,undefined,true);
    const bytes=f.compressed.serialize().length;
    console.log(JSON.stringify({setup,bytes}));assert(bytes<=1232);
    const policy=_test.assertTransactionPolicy(f.compressed,{publicKey:f.payer},[f.table]);
    assert.equal(policy.approvedRentBundle,setup);assert.equal(policy.maximumDebit,setup?50000000:250000);
  }
});
test('buyer compression rejects substituted fixed accounts and unauthorized ATA recipients',async()=>{
  const mutations=[
    ...[1,2,4,5,8,9,10,11,12,13,15].map(i=>inner=>{inner.at(-1).keys[i].pubkey=Keypair.generate().publicKey;}),
    inner=>{inner.at(-1).data[0]^=1;},
    inner=>{inner.at(-1).data=Buffer.concat([inner.at(-1).data,Buffer.from([0])]);},
    inner=>{inner[0].keys[1].pubkey=Keypair.generate().publicKey;},
    inner=>{inner[1].keys[1].pubkey=Keypair.generate().publicKey;},
    inner=>{inner[1].keys[2].pubkey=Keypair.generate().publicKey;},
    inner=>{inner[1].keys[3].pubkey=Keypair.generate().publicKey;},
    inner=>{inner[1].data=Buffer.from([9]);},
    inner=>{inner.push(inner.at(-1));},
    inner=>{inner.reverse();},
  ];
  for(const mutate of mutations){const f=await marketBuyerFixture(true,mutate,true);assert.throws(()=>_test.assertTransactionPolicy(f.compressed,{publicKey:f.payer},[f.table]));}
});
test('buyer table refuses missing or late passkeys, repeated executes and changed table contents',async()=>{
  for(const change of [xs=>xs.slice(1),xs=>[...xs].reverse(),xs=>[...xs,xs.at(-1)]]) {
    const f=await marketBuyerFixture(false,undefined,true);
    const tx=new VersionedTransaction(new TransactionMessage({payerKey:f.payer,recentBlockhash:PublicKey.default.toBase58(),instructions:change(f.wrapped)}).compileToV0Message([f.table]));
    assert.throws(()=>_test.assertTransactionPolicy(tx,{publicKey:f.payer},[f.table]));
  }
  const f=await marketBuyerFixture(false,undefined,true);
  f.table.state.addresses[0]=Keypair.generate().publicKey;
  assert.throws(()=>_test.assertTransactionPolicy(f.compressed,{publicKey:f.payer},[f.table]));
});
