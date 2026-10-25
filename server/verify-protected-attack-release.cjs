const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const candidate=process.argv[2],live=process.argv[3];
const genesis='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const markers=['The target planet is protected. Wait until its shield expires. Nothing was submitted.',
  'Could not verify the chain clock. Try again. Nothing was submitted.',
  'The attack destination is not an occupied planet. Nothing was submitted.'];
async function read(url){const r=await fetch(url,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,new URL(url).pathname);return Buffer.from(await r.arrayBuffer());}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function verify(origin){
  assert(/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin),'Expected canonical Vercel URL');
  const html=(await read(origin+'/app')).toString(),entry=html.match(/<script[^>]+src="([^"]+\.js)"/);
  assert(entry,'Missing entry script');
  const queue=[new URL(entry[1],origin).pathname],seen=new Set(),assets=[];
  let guard;
  while(queue.length&&seen.size<35){
    const asset=queue.shift();if(seen.has(asset))continue;seen.add(asset);
    const bytes=await read(origin+asset),source=bytes.toString();assets.push({asset,sha256:digest(bytes),bytes:bytes.length});
    if(markers.every(x=>source.includes(x))){guard=asset;break;}
    for(const match of source.matchAll(/["'](?:\.\/)?([A-Za-z0-9_-]+\.js)["']/g))queue.push('/assets/'+match[1]);
  }
  assert(guard,'Protected attack guard missing from deployed assets');
  const response=await fetch(origin+'/api/solana-rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getGenesisHash'}),signal:AbortSignal.timeout(60000)});
  assert.equal(response.status,200);assert.equal((await response.json()).result,genesis);
  return {origin,guard,assets,genesis};
}
(async()=>{
  const result={checkedAt:new Date().toISOString(),network:'devnet',candidate:await verify(candidate),noTransactions:true,automation:'paused'};
  if(live){result.live=await verify(live);assert.equal(result.live.guard,result.candidate.guard);for(const item of result.candidate.assets){const match=result.live.assets.find(x=>x.asset===item.asset);assert(match);assert.equal(match.sha256,item.sha256);}result.identicalPublicAssets=true;}
  const file=path.join(__dirname,'../docs/PROTECTED_ATTACK_RELEASE_2026-10-24'+(live?'':'_CANDIDATE')+'.json');
  fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
