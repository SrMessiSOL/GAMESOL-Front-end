const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const deployment = 'https://frontend-lsqkx82rr-srmessisols-projects.vercel.app';
const publicOrigin = 'https://chained-universe.vercel.app';
async function get(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200, url);
  return response.text();
}
async function main() {
  const html = await get(`${publicOrigin}/app`);
  const immutable = await get(`${deployment}/app`);
  const assets = text => [...new Set([...text.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(match => match[1]))];
  assert.deepEqual(assets(html), assets(immutable));
  assert.ok(assets(html).length);
  const pending = assets(html).map(asset => new URL(asset, deployment).href);
  const visited = new Set(), bodies = [];
  while (pending.length) {
    const url = pending.shift();
    if (visited.has(url)) continue;
    const parsed = new URL(url);
    assert.equal(parsed.origin, deployment);
    visited.add(url);
    const body = await get(url);
    const aliasBody = await get(`${publicOrigin}${parsed.pathname}`);
    const hash = value => crypto.createHash('sha256').update(value).digest('hex');
    assert.equal(hash(body), hash(aliasBody), parsed.pathname);
    bodies.push(body);
    for (const match of body.matchAll(/["'`](?:\.\/|\/assets\/|assets\/)([^"'`]+\.js)["'`]/g)) {
      const child = match[0].slice(1, -1);
      pending.push(new URL(child, child.startsWith('assets/') ? `${deployment}/` : url).href);
    }
    assert.ok(visited.size <= 100);
  }
  const code = bodies.join('\n');
  for (const marker of ['orbit-owner', 'ownerAddress', 'sourcePosition', 'destinationPosition', 'mission-traffic-list', 'Fleet departure and arrival points', 'awaiting resolution']) assert.ok(code.includes(marker), marker);
  assert.ok(!code.includes('LOCAL TRAFFIC CHECK'), 'DEV-only fixture must not ship');
  assert.match(code, /units:(?:4e5|400000)/);
  const rpc = await fetch(`${publicOrigin}/api/solana-rpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getGenesisHash' }) });
  assert.equal((await rpc.json()).result, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  console.log(JSON.stringify({ commit: '23ce706', deployment, publicOrigin, matchedJavascriptAssets: visited.size, currentOwnerLabels: true, twoEndedMissionVisibility: true, devnet: true, noTransactionsSubmitted: true }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
