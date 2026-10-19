const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {PublicKey,Keypair}=require('@solana/web3.js');
const source=fs.readFileSync(require.resolve('../src/game-state.ts'),'utf8');
const method=source.slice(source.indexOf('  async upgradeAllianceBuilding('),source.indexOf('  async getAllianceGovernanceConfig('));
const out={};
vm.runInNewContext(ts.transpileModule(`export class Client { ${method} }`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
  {exports:out,PublicKey,ALLIANCE_BUILDING_MAX_LEVEL:25,assertCommandInteger:(_label,value,min,max)=>assert(Number.isInteger(value)&&value>=min&&value<=max)});
test('actual SDK cap guard refuses all four level-25 upgrades before preparing a wallet instruction',async()=>{
  const owner=Keypair.generate().publicKey,alliance=Keypair.generate().publicKey,client=new out.Client();let reads=0;
  client.provider={wallet:{publicKey:owner}};
  client.getAllianceMembership=async()=>({role:2,alliance:alliance.toBase58()});
  client.getAllianceTreasury=async()=>{reads++;return{logisticsHub:25,researchGrid:25,defenseCoordination:25,tradeNetwork:25};};
  client.sendInstruction=async()=>assert.fail('Capped command reached wallet send');
  for(let id=0;id<4;id++)await assert.rejects(client.upgradeAllianceBuilding(id),/maximum level/);
  assert.equal(reads,4);
});
