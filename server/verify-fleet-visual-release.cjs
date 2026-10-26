const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ships = ['smallCargo-v1', 'gamesol-cargo-v1', 'lightFighter-v1',
  'heavyFighter-v1', 'cruiser-v1', 'battleship-v1', 'gamesol-battlecruiser-v1',
  'bomber-v1', 'destroyer-v1', 'deathstar-v1', 'recycler-v1', 'gamesol-scout-v1',
  'gamesol-colony-v1', 'solarSatellite-v1', 'orbital-hangar-v1'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, new URL(url).pathname);
  return Buffer.from(await response.arrayBuffer());
}

async function verify(origin) {
  assert.match(origin, /^https:\/\/[a-z0-9-]+\.vercel\.app$/);
  const html = (await read(origin + '/app')).toString();
  const entry = html.match(/<script[^>]+src="([^"]+\.js)"/);
  assert.ok(entry, 'Entry missing');
  const queue = [new URL(entry[1], origin).pathname];
  const seen = new Set(), assets = [], cssFiles = new Set(), imageFiles = new Set();
  let scripts = '', styles = '';
  while (queue.length) {
    assert.ok(seen.size < 80, 'Unexpected module graph size');
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const bytes = await read(origin + file), source = bytes.toString();
    assets.push({ file, sha256: hash(bytes) });
    scripts += source;
    for (const match of source.matchAll(/[/"'](?:\.\/)?([A-Za-z0-9_-]+\.js)["']/g)) queue.push('/assets/' + match[1]);
    for (const match of source.matchAll(/([A-Za-z0-9_-]+\.css)/g)) cssFiles.add('/assets/' + match[1]);
    for (const match of source.matchAll(/([A-Za-z0-9_-]+\.webp)/g)) imageFiles.add(match[1]);
  }
  for (const match of html.matchAll(/href="([^"]+\.css)"/g)) cssFiles.add(new URL(match[1], origin).pathname);
  for (const file of [...cssFiles].sort()) {
    const bytes = await read(origin + file);
    assets.push({ file, sha256: hash(bytes) });
    styles += bytes.toString();
  }
  assert.ok(scripts.includes('A fleet for every frontier.'), 'Public fleet catalog missing');
  assert.ok(scripts.includes('One shield dome only'), 'Published defense guard missing');
  assert.match(styles, /\.pw-mission-badge\{[^}]*width:64px;height:64px;[^}]*overflow:hidden/);
  assert.match(styles, /html\.public-document\{[^}]*(?:overflow-y:auto|overflow:clip auto)/);
  for (const ship of ships) {
    const matches = [...imageFiles].filter(file => file.startsWith(ship + '-'));
    assert.equal(matches.length, 1, ship);
    const file = '/assets/' + matches[0], bytes = await read(origin + file);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF', ship);
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP', ship);
    assert.ok(bytes.length > 1000 && bytes.length < 650000, ship);
    const local = fs.readFileSync(path.join(__dirname, '../src/assets/fleet', ship + '.webp'));
    assert.equal(hash(bytes), hash(local), 'Deployed artwork differs: ' + ship);
    assets.push({ file, sha256: hash(bytes) });
  }
  const rpc = await fetch(origin + '/api/solana-rpc', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getGenesisHash' }),
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(rpc.status, 200);
  const genesis = (await rpc.json()).result;
  assert.equal(genesis, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  return { origin, entry: entry[1], assets: assets.sort((a, b) => a.file.localeCompare(b.file)), genesis };
}

(async () => {
  const candidate = await verify(process.argv[2]);
  const live = await verify(process.argv[3] || process.argv[2]);
  assert.equal(candidate.entry, live.entry);
  assert.deepEqual(candidate.assets, live.assets);
  const report = { at: new Date().toISOString(), sourceCommit: '229ed1578efd4fd9c19ed037f92c0e7a56aaa333',
    candidate, live, identicalPublicAssets: true, shipImages: 14, backdropImages: 1, noTransactions: true, passed: true };
  fs.writeFileSync(path.join(__dirname, '../docs/test-runs/fleet-production-2026-10-26.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, identicalPublicAssets: true, verifiedAssets: candidate.assets.length, shipImages: 14, genesis: live.genesis }));
})().catch(error => { console.error(error); process.exitCode = 1; });
