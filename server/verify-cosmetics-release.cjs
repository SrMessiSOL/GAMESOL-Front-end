const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Connection,PublicKey}=require('@solana/web3.js');
const load=require('./frontend-ts-loader.cjs').frontendLoader();
const {readShipSkinStore}=load('ship-cosmetics');
const {readTravelCosmetics,travelShipSkin}=load('travel-cosmetics');
const program=new PublicKey('J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq');
const player=new PublicKey('G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
  const origin=process.argv[2];assert.match(origin,/^https:\/\/[a-z0-9-]+\.vercel\.app$/);
  const get=async file=>{const r=await fetch(origin+file,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,file);return Buffer.from(await r.arrayBuffer());};
  const html=(await get('/app')).toString();
  const entry=new URL(html.match(/<script[^>]+src="([^"]+\.js)"/)[1],origin).pathname;
  const assets=[],queue=[entry],seen=new Set(),css=new Set();let scripts='',styles='';
  for(const m of html.matchAll(/href="([^"]+\.css)"/g))css.add(new URL(m[1],origin).pathname);
  while(queue.length){
    const file=queue.shift();if(seen.has(file))continue;seen.add(file);assert(seen.size<100);
    const bytes=await get(file),source=bytes.toString();assets.push({file,sha256:hash(bytes)});scripts+=source;
    for(const m of source.matchAll(/[\/"'](?:\.\/)?([A-Za-z0-9_-]+\.js)["']/g))queue.push('/assets/'+m[1]);
    for(const m of source.matchAll(/([A-Za-z0-9_-]+\.css)/g))css.add('/assets/'+m[1]);
  }
  for(const file of css){
    const bytes=await get(file);assets.push({file,sha256:hash(bytes)});styles+=bytes.toString();
  }
  assert(scripts.includes('Fleet Customization')&&scripts.includes('Ship liveries'));
  assert(scripts.includes('ship_cosmetics')&&scripts.includes('ship_cosmetic_store'));
  assert(!scripts.includes('/ship-cosmetics-local')&&!scripts.includes('/travel-cosmetics-local'));
  assert(!scripts.includes('127.0.0.1:8797')&&!scripts.includes('GAMESOL_DEVNET_SPONSOR_SECRET'));
  assert(styles.includes('.ship-skin-options')&&styles.includes('grid!important'));
  if(process.argv[3]){
    const reference=JSON.parse(fs.readFileSync(process.argv[3]));
    assert.equal(entry,reference.entry,'Main alias entry differs from immutable deployment');
    assert.deepEqual(assets,reference.assets,'Main alias assets differ from immutable deployment');
  }
  const rpc=new Connection(origin+'/api/solana-rpc','finalized');
  const genesis=await rpc.getGenesisHash();assert.equal(genesis,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  const store=await readShipSkinStore(rpc,program,player);assert(store.enabled);
  assert(store.inventory&&(store.inventory.owned&2));assert.equal(store.inventory.equipped[6],1);
  const records=await readTravelCosmetics(rpc,program,[player.toBase58()]);
  assert.equal(travelShipSkin(records,player.toBase58(),'battlecruiser'),1);
  const lightFighterSkin=travelShipSkin(records,player.toBase58(),'lightFighter');
  assert.equal(lightFighterSkin,store.inventory.equipped[2]);
  assert.equal(travelShipSkin(records,undefined,'lightFighter'),0);
  const report={at:new Date().toISOString(),origin,entry,genesis,assets,player:player.toBase58(),
    owned:store.inventory.owned,equipped:store.inventory.equipped,balance:store.balance.toString(),
    travelBattlecruiserSkin:1,travelLightFighterSkin:lightFighterSkin,unknownOwnerSkin:0,passed:true,noTransactions:true};
  const dir='docs/test-runs/cosmetics-live-release';fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,new URL(origin).hostname+'.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({origin,passed:true,assets:assets.length,owned:report.owned,equippedBattlecruiser:1,balance:report.balance}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
