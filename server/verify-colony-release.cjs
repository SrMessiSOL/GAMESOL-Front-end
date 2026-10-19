const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const deployment = 'https://frontend-robhlvgpu-srmessisols-projects.vercel.app';
const publicOrigin = 'https://chained-universe.vercel.app';
async function get(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200, url);
  return response.text();
}
async function main() {
  const html = await get(`${publicOrigin}/app`);
  const immutableHtml = await get(`${deployment}/app`);
  const assetUrls = value => [...new Set([...value.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(match => match[1]))];
  const assets = assetUrls(html);
  assert.ok(assets.length > 0);
  assert.deepEqual(assets, assetUrls(immutableHtml));
  const visited = new Set();
  const bundles = [];
  const pending = assets.map(asset => new URL(asset, deployment).href);
  while (pending.length) {
    const url = pending.shift();
    if (visited.has(url)) continue;
    const parsed = new URL(url);
    assert.equal(parsed.origin, deployment);
    visited.add(url);
    const body = await get(url);
    const relative = parsed.pathname;
    const publicBody = await get(`${publicOrigin}${relative}`);
    assert.equal(crypto.createHash('sha256').update(body).digest('hex'),
      crypto.createHash('sha256').update(publicBody).digest('hex'), relative);
    bundles.push(body);
    for (const match of body.matchAll(/["'`](?:\.\/|\/assets\/|assets\/)([^"'`]+\.js)["'`]/g)) {
      const child = match[0].slice(1, -1);
      const next = new URL(child, child.startsWith('assets/') ? `${deployment}/` : url).href;
      if (!visited.has(next)) pending.push(next);
    }
    assert.ok(visited.size <= 100, 'Unexpected asset graph');
  }
  const code = bundles.join('\n');
  assert.match(code, /units:(?:4e5|400000)/);
  assert.match(code, /91,184,105,243,90,175,137,217/);
  assert.match(code, /destinationPosition/);
  assert.match(code, /sampledAt/);
  assert.ok(!code.includes('Collapse navigation controls'));
  assert.ok(!code.includes('Expand navigation controls'));
  const rpc = await fetch(`${publicOrigin}/api/solana-rpc`, {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getGenesisHash'}),
  });
  const genesis = (await rpc.json()).result;
  assert.equal(genesis, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  console.log(JSON.stringify({commit:'990be28',deployment,publicOrigin,
    javascriptAssetsMatched:visited.size,colonyBudget:400000,
    structuredMissionDestinations:true,missionSnapshotTiming:true,
    navigationCollapseControlRemoved:true,genesis,
    boundary:'Asset and endpoint verification; no colony resolution submitted.'},null,2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
