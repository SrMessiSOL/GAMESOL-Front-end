const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const main='https://chained-universe.vercel.app',deployment='https://frontend-zob3fx77w-srmessisols-projects.vercel.app';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,url);return Buffer.from(await r.arrayBuffer());}
async function run(){
  const [a,b]=await Promise.all([get(main+'/app'),get(deployment+'/app')]);
  const entry=html=>html.toString().match(/src="(?:https:\/\/[^"/]+)?(\/assets\/[^" ]+\.js)"/)?.[1];
  assert(entry(a)&&entry(a)===entry(b),`Production alias entries differ: ${entry(a)} / ${entry(b)}`);
  const pending=[entry(a)],seen=new Set(),assets=[];let code='';
  while(pending.length){
    const asset=pending.shift();if(seen.has(asset))continue;seen.add(asset);assert(seen.size<=30,'Unexpected asset graph');
    const [live,staged]=await Promise.all([get(main+asset),get(deployment+asset)]);assert(live.equals(staged),'Asset drift: '+asset);
    assets.push({path:asset,sha256:hash(live),bytes:live.length});const text=live.toString();code+=text;
    for(const match of text.matchAll(/["']((?:https:\/\/[^"']+\/assets\/|\.\/|\/?assets\/)[A-Za-z0-9_-]+\.js)["']/g))pending.push('/assets/'+match[1].split('/').pop());
  }
  for(const text of ['Alliance building level changed. Review a fresh upgrade quote. Nothing was submitted.','Alliance upgrade exceeds the approved price. Nothing was submitted.','expectedLevel','This alliance upgrade exceeds the price you approved.'])assert(code.includes(text),'Missing protection code: '+text);
  const r=await fetch(main+'/api/solana-rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getGenesisHash'}),signal:AbortSignal.timeout(30000)});
  assert.equal((await r.json()).result,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  const proof={verifiedAt:new Date().toISOString(),codeCommit:'dcf2df3',url:main+'/app',deployment,htmlStatus:200,assets,quoteGuardsPresent:true,devnetGenesisVerified:true,automation:'PAUSED',boundary:'Asset/endpoint verification, not a new signed-in wallet or physical-device test.'};
  fs.writeFileSync(path.join(__dirname,'../docs/ALLIANCE_PROTECTION_RELEASE_VERIFICATION_2026-10-19.json'),JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify({assets:assets.length,guardsPresent:true,devnet:true}));
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
