// Read-only comparison to the previously tested and published release.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const live = 'https://chained-universe.vercel.app';
const pinned = 'https://frontend-5hqrebgmt-srmessisols-projects.vercel.app';
const digest = data => createHash('sha256').update(data).digest('hex');
async function read(origin, pathname) {
  const response = await fetch(origin + pathname, {signal: AbortSignal.timeout(30000)});
  assert.equal(response.status, 200, `${origin}${pathname}`);
  return Buffer.from(await response.arrayBuffer());
}
async function main() {
  const entry = '/assets/index-BgkYmNVA.js';
  const html = (await read(live, '/')).toString();
  assert(html.includes(entry), 'Main URL is not on the recorded published entry');
  const entryBytes = await read(live, entry);
  const chunks = [...new Set([...entryBytes.toString().matchAll(/[A-Za-z0-9_-]+\.js/g)]
    .map(match => match[0]).filter(name => /^(App-|UniverseGame-|UniverseLab-|ui-art-|logobg-|usdc-|users-)/.test(name)))];
  assert(chunks.some(name => name.startsWith('App-')));
  assert(chunks.some(name => name.startsWith('UniverseGame-')));
  const assets = [entry, '/assets/index-RWKvG8gF.css', ...chunks.map(name => '/assets/' + name)];
  const results = [];
  for (const asset of assets) {
    const actual = asset === entry ? entryBytes : await read(live, asset);
    const expected = await read(pinned, asset);
    assert.equal(digest(actual), digest(expected), `Release mismatch: ${asset}`);
    results.push({asset, bytes: actual.length, sha256: digest(actual), matchesPublishedRelease: true});
  }
  const rpc = await fetch(live + '/api/solana-rpc', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'getGenesisHash'}), signal: AbortSignal.timeout(30000)});
  assert.equal(rpc.status, 200);
  const genesis = (await rpc.json()).result;
  assert.equal(genesis, require('../src/alliance-lookup-table.json').genesis);
  const report = {checkedAt: new Date().toISOString(), live, pinned, sourceCommit: '3113b97', evidenceCommit: '3bd1df2', network: 'devnet', genesis, results,
    boundary: 'Public assets match the retained tested release byte-for-byte. No new signed-in visual, passkey or gameplay transaction test was performed. No deployment or chain write.'};
  fs.writeFileSync(path.resolve(__dirname, '../docs/PUBLISHED_RELEASE_VERIFICATION_2026-10-19.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
