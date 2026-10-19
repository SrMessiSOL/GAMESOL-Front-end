const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const {PublicKey}=require('@solana/web3.js');
const {marketBuyerFixture}=require('./market-buyer-fixture.cjs');
const {planetBuyerFixture}=require('./planet-buyer-fixture.cjs');
const source=fs.readFileSync(require.resolve('../src/player-funded-session.ts'),'utf8');
const ast=ts.createSourceFile('session.ts',source,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='isMarketPurchaseBundle');
const target={exports:{}};
vm.runInNewContext(ts.transpileModule(fn.getText(ast)+'\nmodule.exports=isMarketPurchaseBundle;',{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
  {module:target,Buffer,MARKET_PROGRAM_ID:new PublicKey('6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA'),GAME_STATE_PROGRAM_ID:new PublicKey(require('../src/market-lookup-table.json').addresses[0])});
test('client selects buyer table only for resource purchases and bounded setup',async()=>{
  for(const setup of [false,true]){const f=await marketBuyerFixture(setup);assert.equal(target.exports(f.inner),true);assert.equal(target.exports([...f.inner,...f.inner]),false);f.inner.at(-1).data[0]^=1;assert.equal(target.exports(f.inner),false);}
  assert.equal(target.exports([]),false);
});
test('passkey submission refreshes its blockhash after finalizing the owner signature',()=>{
  assert.match(source,/finalizeExecute\(prepared, response\);\s*\/\/[^\n]+\n\s*const submissionBlockhash = await withRateLimitBackoff\(\(\) => rpc.getLatestBlockhash\('confirmed'\)\)/);
  assert.match(source,/sendSponsored\(rpc, colonyComputeBudget\(instructions, \[\.\.\.precompiles, \.\.\.wrapped\]\), \[\], submissionBlockhash/);
});

test('client selects buyer compression for planet purchases, never repeated or altered commands',async()=>{
  for(const setup of [false,true]){const f=await planetBuyerFixture(setup);assert.equal(target.exports(f.inner),true);assert.equal(target.exports([...f.inner,...f.inner]),false);f.inner.at(-1).data[0]^=1;assert.equal(target.exports(f.inner),false);}
});
