const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exports_ = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/market-storage.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exports_});
const check = exports_.marketStorageError;
const resources = {metal:500n,crystal:1145n,deuterium:26n,metalCap:10000n,crystalCap:10000n,deuteriumCap:10000n};
test('reported 28000 crystal purchase is blocked before signing',()=>{
  assert.match(check(1,28000n,resources),/Not enough crystal storage/);
  assert(check(1,28000n,resources).includes((8855n).toLocaleString()));
});
test('exact capacity is accepted; one unit over rejects for all resources',()=>{
  for (const [type,field] of ['metal','crystal','deuterium'].entries()) {
    const room=resources[field+'Cap']-resources[field];
    assert.equal(check(type,room,resources),null);
    assert(check(type,room+1n,resources));
  }
});
test('missing data, invalid type and invalid quantity fail closed',()=>{
  assert(check(1,1n,undefined)); assert(check(3,1n,resources)); assert(check(1,0n,resources));
});
test('bigint limits remain exact and overfull storage has no room',()=>{
  const max=9007199254740993n;
  assert.equal(check(1,max,{...resources,crystal:0n,crystalCap:max}),null);
  assert(check(1,1n,{...resources,crystal:10001n}));
});
test('both review and fresh client path guard storage before wallet submission',()=>{
  const client=fs.readFileSync(require.resolve('../src/market-client.ts'),'utf8');
  const method=client.slice(client.indexOf('async acceptOffer('),client.indexOf('async acceptOffer(')+1200);
  assert.match(method,/getPlanetStateByPda\(buyerPlanetPda\)/);
  assert.match(method,/projectResources\(destination.resources/);
  assert(method.indexOf('if (storageError) throw') < method.indexOf('getMarketConfig'));
  const ui=fs.readFileSync(require.resolve('../src/Markettab.tsx'),'utf8');
  assert.match(ui,/disabled=\{Boolean\(storageError\) \|\| !canAfford/);
  assert.match(ui,/resources=\{liveRes\}/);
});
test('actual client rejects overflowing delivery before building or sending payment',async()=>{
  const source=fs.readFileSync(require.resolve('../src/market-client.ts'),'utf8');
  const tree=ts.createSourceFile('market-client.ts',source,ts.ScriptTarget.Latest,true);
  let method;
  function visit(node){
    if(ts.isMethodDeclaration(node)&&node.name.getText(tree)==='acceptOffer') method=node.getText(tree);
    ts.forEachChild(node,visit);
  }
  visit(tree); assert(method);
  const context={module:{exports:{}},marketStorageError:check,projectResources:r=>r,Date,Math,Error};
  vm.runInNewContext(ts.transpileModule(`module.exports=class Check {${method}}`,
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
  let reads=0,prepared=0,sent=0;
  const client=new context.module.exports();
  Object.assign(client,{provider:{wallet:{publicKey:'buyer'}},requireActivePlanet:()=> 'destination',
    gameClient:{getPlanetStateByPda:async p=>{assert.equal(p,'destination');reads++;return {resources};}},
    getMarketConfig:async()=>{prepared++;},sendInstruction:async()=>{sent++;}});
  await assert.rejects(client.acceptOffer({resourceType:1,resourceAmount:28000n}),/Not enough crystal storage/);
  assert.equal(reads,1); assert.equal(prepared,0); assert.equal(sent,0);
});
