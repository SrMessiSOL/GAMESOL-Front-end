const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/nft-holding-wallet.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, filename);
const {connectHoldingWallet} = compiled.exports;
const account = {address:'test-holder',chains:['solana:mainnet'],features:[]};
function fixture(connect) {
  const listeners = new Set();
  const wallet = {name:'Solflare',features:{
    'standard:connect':{connect},
    'standard:events':{on:(_,listener)=>{listeners.add(listener);return()=>listeners.delete(listener);}},
    'solana:signMessage':{signMessage:()=>{throw Error('Read-only connection must never sign');}},
  }};
  return {wallet,listeners,emit:accounts=>{for(const listener of listeners)listener({accounts});}};
}
test('approved account event completes a stalled connection and releases its listener',async()=>{
  const f=fixture(()=>new Promise(()=>{}));const result=connectHoldingWallet(f.wallet,false,1000);
  f.emit([account]);assert.equal(await result,account);assert.equal(f.listeners.size,0);
});
test('connection deadline releases the picker and late approvals cannot change its result',async()=>{
  let resolve;const f=fixture(()=>new Promise(done=>{resolve=done;}));
  await assert.rejects(connectHoldingWallet(f.wallet,false,1),/timed out.*retry/);
  assert.equal(f.listeners.size,0);resolve({accounts:[account]});await Promise.resolve();
  assert.equal(f.listeners.size,0);
});
test('ordinary success, rejection and non-mainnet accounts all release listeners',async()=>{
  const success=fixture(async options=>{assert.equal(options.silent,true);return {accounts:[account]};});
  assert.equal(await connectHoldingWallet(success.wallet,true),account);assert.equal(success.listeners.size,0);
  for(const connect of [()=>{throw Error('User cancelled');},async()=>({accounts:[{...account,chains:['solana:devnet']}]})]){
    const f=fixture(connect);await assert.rejects(connectHoldingWallet(f.wallet));assert.equal(f.listeners.size,0);
  }
});
