const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const candidate=process.argv[2],live=process.argv[3];
const markers=['One shield dome only','One dome only','Field online'];
async function read(url){const r=await fetch(url,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,new URL(url).pathname);return Buffer.from(await r.arrayBuffer());}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function verify(origin){
  assert(/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin));
  const html=(await read(origin+'/app')).toString(),entry=html.match(/<script[^>]+src="([^"]+\.js)"/);assert(entry);
  const queue=[new URL(entry[1],origin).pathname],seen=new Set(),assets=[],found=new Set(),lazyCss=new Set();
  while(queue.length&&seen.size<60){const file=queue.shift();if(seen.has(file))continue;seen.add(file);const bytes=await read(origin+file),source=bytes.toString();assets.push({file,sha256:hash(bytes)});
    for(const marker of markers)if(source.includes(marker))found.add(marker);
    for(const match of source.matchAll(/[/"'](?:\.\/)?([A-Za-z0-9_-]+\.js)["']/g))queue.push('/assets/'+match[1]);
    for(const match of source.matchAll(/[/"'](?:\.\/)?([A-Za-z0-9_-]+\.css)["']/g))lazyCss.add('/assets/'+match[1]);
  }
  for(const marker of markers)assert(found.has(marker),'Missing deployed guard: '+marker);
  const cssFiles=[...new Set([...html.matchAll(/href="([^"]+\.css)"/g)].map(m=>new URL(m[1],origin).pathname).concat([...lazyCss]))];let styles='';
  for(const file of cssFiles){const bytes=await read(origin+file);assets.push({file,sha256:hash(bytes)});styles+=bytes.toString();}
  assert(styles.includes('.pw-defense-list article{grid-template-columns:96px minmax(0,1fr) 160px}'),'Desktop defense action width absent');
  const response=await fetch(origin+'/api/solana-rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getGenesisHash'}),signal:AbortSignal.timeout(60000)});assert.equal(response.status,200);
  const genesis=(await response.json()).result;assert.equal(genesis,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  return {origin,entry:entry[1],markers:[...found],assets,genesis};
}
(async()=>{const report={candidate:await verify(candidate),automation:'paused',noTransactions:true};if(live){report.live=await verify(live);assert.equal(report.live.entry,report.candidate.entry);assert.deepEqual(report.live.assets,report.candidate.assets);report.identicalPublicAssets=true;}report.passed=true;report.at=new Date().toISOString();fs.writeFileSync(path.join(__dirname,'../docs/DEFENSE_UI_RELEASE_2026-10-24.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,candidate,live,identicalPublicAssets:report.identicalPublicAssets}));})().catch(e=>{console.error(e);process.exitCode=1;});
