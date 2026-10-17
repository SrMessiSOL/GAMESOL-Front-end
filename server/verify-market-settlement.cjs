const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const bs58=require('bs58');
const {Connection,PublicKey}=require('@solana/web3.js');
const manifest=require('../src/market-lookup-table.json');
async function main(){
  const signature=process.argv[2];if(!signature)throw Error('Pass the confirmed purchase signature; never retry a purchase to verify it');
  const dir=path.resolve(__dirname,'../../passkey-ufo-release/.validation/devnet-smoke-2026-10-16');
  const before=JSON.parse(fs.readFileSync(path.join(dir,'market-buyer-before.json'),'utf8'));
  const rpc=new Connection('https://chained-universe.vercel.app/api/solana-rpc','finalized');
  assert.equal(await rpc.getGenesisHash(),manifest.genesis);
  const tx=await rpc.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
  assert(tx&&tx.meta.err===null,'Purchase must be finalized and successful');
  const keys=tx.transaction.message.getAccountKeys({accountKeysFromLookups:tx.meta.loadedAddresses});
  const market='6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA';
  const actions=tx.meta.innerInstructions.flatMap(x=>x.instructions).filter(ix=>keys.get(ix.programIdIndex).toBase58()===market&&Buffer.from(bs58.decode(ix.data)).equals(Buffer.from([227,82,234,131,1,18,48,2])));
  assert.equal(actions.length,1,'Exactly one AcceptOffer required');
  const action=actions[0];assert.equal(keys.get(action.accounts[0]).toBase58(),'G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r');
  assert.equal(keys.get(action.accounts[1]).toBase58(),'Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd');
  assert.equal(keys.get(action.accounts[3]).toBase58(),before.offer);
  const expected={buyer:-1000000n,seller:997500n,treasury:2500n},deltas={};
  for(const [name,entry]of Object.entries(before.tokenBalances)){
    const index=Array.from({length:keys.length},(_,i)=>i).find(i=>keys.get(i).toBase58()===entry.address);
    assert.notEqual(index,undefined,`${name} account missing from receipt`);
    const amount=(list)=>BigInt(list.find(x=>x.accountIndex===index&&x.mint===manifest.antimatterMint)?.uiTokenAmount.amount??'0');
    const delta=amount(tx.meta.postTokenBalances)-amount(tx.meta.preTokenBalances);
    assert.equal(delta,expected[name],`${name} receipt delta mismatch`);deltas[name]=delta.toString();
    const live=BigInt((await rpc.getTokenAccountBalance(new PublicKey(entry.address))).value.amount);
    assert.equal(live-BigInt(entry.amount),expected[name],`${name} round balance mismatch`);
  }
  assert.equal(await rpc.getAccountInfo(new PublicKey(before.offer)),null,'Filled offer must close');
  assert(tx.meta.logMessages.some(x=>x.includes('Market transfer: 1000 metal credited to buyer')),'Resource delivery log missing');
  const result={signature,network:'devnet',finalized:true,tokenDeltas:deltas,metalDelivered:1000,offerClosed:true,spentTestAntimatter:1,spentTestUsdc:0,feeLamports:tx.meta.fee};
  fs.writeFileSync(path.join(dir,'market-buyer-settled.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
