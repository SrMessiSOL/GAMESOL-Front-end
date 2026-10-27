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
  const html=(await get('/app')).toString(),local=fs.readFileSync('dist/index.html','utf8');
  const entry=html.match(/<script[^>]+src="([^"]+\.js)"/)[1];
  assert(local.includes(entry),'Live game is not the tested build');
  const assets=[];let scripts='',styles='';
  for(const file of fs.readdirSync('dist/assets').filter(f=>/\.(js|css)$/.test(f))){
    const bytes=await get('/assets/'+file),expected=fs.readFileSync(path.join('dist/assets',file));
    assert.equal(hash(bytes),hash(expected),file);assets.push({file,sha256:hash(bytes)});
    if(file.endsWith('.js'))scripts+=bytes.toString();else styles+=bytes.toString();
  }
  assert(scripts.includes('Fleet Customization')&&scripts.includes('Ship liveries'));
  assert(scripts.includes('ship_cosmetics')&&scripts.includes('ship_cosmetic_store'));
  assert(!scripts.includes('/ship-cosmetics-local')&&!scripts.includes('/travel-cosmetics-local'));
  assert(!scripts.includes('8797')&&!scripts.includes('GAMESOL_DEVNET_SPONSOR_SECRET'));
  assert(styles.includes('.ship-skin-options')&&styles.includes('grid!important'));
  const rpc=new Connection(origin+'/api/solana-rpc','finalized');
  const genesis=await rpc.getGenesisHash();assert.equal(genesis,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  const store=await readShipSkinStore(rpc,program,player);assert(store.enabled);
  assert(store.inventory&&(store.inventory.owned&2));assert.equal(store.inventory.equipped[6],1);
  assert.equal(store.balance,99501000n);
  const records=await readTravelCosmetics(rpc,program,[player.toBase58()]);
  assert.equal(travelShipSkin(records,player.toBase58(),'battlecruiser'),1);
  assert.equal(travelShipSkin(records,player.toBase58(),'lightFighter'),0);
  const report={at:new Date().toISOString(),origin,entry,genesis,assets,player:player.toBase58(),
    owned:store.inventory.owned,equipped:store.inventory.equipped,balance:store.balance.toString(),
    travelBattlecruiserSkin:1,travelUnequippedLightFighterSkin:0,passed:true,noTransactions:true};
  const dir='docs/test-runs/cosmetics-live-release';fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,new URL(origin).hostname+'.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({origin,passed:true,assets:assets.length,owned:2,equippedBattlecruiser:1,balance:report.balance}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
