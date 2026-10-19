const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {Connection,PublicKey} = require('@solana/web3.js');
const {frontendLoader} = require('./frontend-ts-loader.cjs');
const load = frontendLoader();
const {GameClient} = load('game-state.ts');
const {MarketClient} = load('market-client.ts');
const {preflightCommand} = load('command-preflight.ts');
const manifests = ['ufo','alliance','market'].map(name=>require(`../src/${name}-lookup-table.json`));

async function main() {
  const rpc=new Connection('https://chained-universe.vercel.app/api/solana-rpc','confirmed');
  assert.equal(await rpc.getGenesisHash(),manifests[0].genesis);
  const payer=new PublicKey(manifests[0].sponsor);
  const tables=[];
  for (const manifest of manifests) {
    const table=(await rpc.getAddressLookupTable(new PublicKey(manifest.table))).value;
    assert(table && !table.state.authority && table.isActive()); tables.push(table);
  }
  const wallet=new PublicKey('Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd');
  const planet=new PublicKey('9pNkMopmGczUVkTFYP73zRZpKQPZTtuSpZdz7A21H4JN');
  const provider={wallet:{publicKey:wallet,signTransaction:()=>assert.fail('no signing'),signAllTransactions:()=>assert.fail('no signing')},
    connection:rpc,sendAndConfirm:()=>assert.fail('no submission')};
  const client=new GameClient(rpc,provider);
  let captured;
  const capture=async instructions=>{captured=instructions;return 'simulation-only';};
  client.sendInstruction=capture; client.sendVaultInstruction=capture;
  client.gameplayVaultExecutor={vaultPublicKey:wallet,payerPublicKey:payer,execute:()=>assert.fail('no execution')};
  for (const method of ['ensureQuestState','ensureQuestProgress','ensureQuestRewardTargets']) client[method]=async()=>{};
  client.prepareVaultSigningForAuthority=async()=>wallet;
  const market=new MarketClient(rpc,provider,client);
  market.setActivePlanet(planet); market.sendInstruction=capture;
  const defaultWallet=new PublicKey('G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r');
  const defaultPlanet=new PublicKey('GmuTW6QrgNgbYUnu19j19prg2GQXc1Li7VhvynHx1bk4');
  const defaultClient=new GameClient(rpc,{...provider,wallet:{...provider.wallet,publicKey:defaultWallet}});
  defaultClient.sendInstruction=capture; defaultClient.sendVaultInstruction=capture;
  defaultClient.gameplayVaultExecutor={vaultPublicKey:defaultWallet,payerPublicKey:payer,execute:()=>assert.fail('no execution')};
  defaultClient.prepareVaultSigningForAuthority=async()=>defaultWallet;
  for (const method of ['ensureQuestState','ensureQuestProgress','ensureQuestRewardTargets']) defaultClient[method]=async()=>{};
  const state=await client.getPlanetStateByPda(planet);
  assert(state);
  const snapshot=async()=> (await rpc.getMultipleAccountsInfo([planet,wallet,payer])).map(account=>account&&({
    lamports:account.lamports,hash:createHash('sha256').update(account.data).digest('hex'),owner:account.owner.toBase58()}));
  const before=await snapshot();
  const cases=[
    ['affordable metal mine construction',()=>client.startBuild(planet,0),true],
    ['affordable research command',()=>defaultClient.startResearch(defaultPlanet,0),true],
    ['eligible quest reward with sufficient storage',()=>client.claimQuest(planet,0,4),true],
    ['available cargo fleet launch',()=>defaultClient.launchFleet(defaultPlanet,{sc:1},{metal:1n},2,100,{galaxy:9,system:427,position:1}),true],
    ['affordable resource sell order',()=>market.createOffer({resourceType:1,resourceAmount:1000n,priceAntimatter:1000000n}),true],
    ['affordable alliance crystal contribution',()=>client.depositAllianceResources(planet,1,1,{crystal:1000n}),true],
    ['leader with funded alliance treasury',()=>defaultClient.upgradeAllianceBuilding(0),true],
    ['funded daily store pack eligibility without payment',()=>defaultClient.purchaseStorePack(defaultPlanet,1,0),true],
    ['oversized monthly store pack',()=>defaultClient.purchaseStorePack(defaultPlanet,3,2),false],
    ['unsupported shield store pack',()=>defaultClient.purchaseStorePack(defaultPlanet,1,16),false],
    ['deployed program rejects overflowing store delivery',async()=>{
      await defaultClient.purchaseStorePack(defaultPlanet,1,0);
      const ix=captured.at(-1); assert.equal(ix.data.length,10); assert.equal(ix.data[8],1);
      ix.data[8]=3; ix.data[9]=2;
    },false],
    ['deployed program rejects unsupported shield pack',async()=>{
      await defaultClient.purchaseStorePack(defaultPlanet,1,0);
      const ix=captured.at(-1); assert.equal(ix.data.length,10); assert.equal(ix.data[8],1);
      ix.data[9]=16;
    },false],
    ['locked nanite construction',()=>client.startBuild(planet,6),false],
    ['missing impulse research prerequisites',()=>client.startResearch(planet,2),false],
    ['locked colony ship',()=>client.buildShip(planet,12,1),false],
    ['locked plasma defense',()=>client.buildDefense(planet,5,1),false],
    ['empty research queue completion',()=>client.finishResearch(planet),false],
    ['empty fleet launch',()=>client.launchFleet(planet,{}, {},2,100,{galaxy:9,system:427,position:13}),false],
    ['invalid quest',()=>client.claimQuest(planet,0,255),false],
    ['unaffordable store pack',()=>client.purchaseStorePack(planet,1,0),false],
    ['excess resource sell order',()=>market.createOffer({resourceType:2,resourceAmount:50000n,priceAntimatter:1000000n}),false],
    ['fractional ship quantity',()=>client.buildShip(planet,2,1.5),false],
    ['negative alliance contribution',()=>client.depositAllianceResources(planet,1,0,{metal:-1n}),false],
    ['unavailable alliance deuterium contribution',()=>client.depositAllianceResources(planet,1,2,{deuterium:500n}),false],
    ['member cannot upgrade alliance infrastructure',()=>client.upgradeAllianceBuilding(0),false],
    ['invalid alliance infrastructure',()=>client.upgradeAllianceBuilding(256),false],
  ];
  const results=[];
  for (const [name,prepare,allowed] of cases) {
    captured=null;
    try {
      await prepare();
      assert(captured,'Expected prepared instructions');
      await preflightCommand(rpc,payer,captured,async()=>tables);
      assert(allowed,`${name} unexpectedly passed`);
      results.push({name,allowed:true,submitted:false});
    } catch (error) {
      if (allowed || error.code==='ERR_ASSERTION') throw error;
      results.push({name,allowed:false,message:error.message,guard:error.logs?.find(line=>line.includes('Error Code:')),submitted:false});
    }
  }
  assert.deepEqual(await snapshot(),before,'Read-only simulations must preserve accounts');
  const result={network:'devnet',slot:await rpc.getSlot('confirmed'),signatureVerification:false,submitted:false,watchedAccountsUnchanged:true,
    boundary:'Real client preparation and current program-rule simulations only; no wallet authentication, execution or token spending.',results};
  if (process.argv.includes('--report')) require('node:fs').writeFileSync(require('node:path').join(__dirname,'../docs/command-preflight-devnet-2026-10-19.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
