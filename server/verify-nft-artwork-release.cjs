const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const originals = [
  ['4672', '5Y2fnRhCy411TWwTTBJMKTWwCAVkGJSp7yphrjrpKxv5', '003f6f2d793eddd96ebeb33f5e92dcaa40938a110251e1d0d805bf047268be03'],
  ['513', 'FzEWZMXsZxNzgCFtBrSJLYDCozR4n2yaHCEvTFPNGTZg', '4c8d4375746cd3583b778c4010a343fbe7b8cc9797845e12c8996e991b762cf3'],
  ['4018', 'HgpcjGmKWab7KBXnVfehQSoxLPdEUXPdrj6VmCe7LdkL', '0c78a0bd8fd6af29ddd9146eeaa8b3a10f88243c97ad918470757d1c23998d6d'],
  ['4016', 'HCfj97RrKNHsDzSDNUEYX8CyhBvr6rYNSqHFnQYvK311', 'dda74219ffcdbaf8d65be68469201995588e11eb61b8ced9143af8f0fe260ce7'],
];

(async () => {
  const [origin, stage] = process.argv.slice(2);
  assert.match(origin, /^https:\/\/[a-z0-9-]+\.vercel\.app$/);
  assert.ok(['preview', 'production'].includes(stage));
  const images = [];
  for (const [name, id, expected] of originals) {
    const started = Date.now();
    const response = await fetch(`${origin}/api/crypto-ufos-image?id=${id}`, {
      signal: AbortSignal.timeout(65000),
    });
    assert.equal(response.status, 200, `NFT #${name}`);
    assert.equal(response.headers.get('content-type'), 'image/jpeg', `NFT #${name}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256, expected, `Original content mismatch: #${name}`);
    images.push({ name: `Crypto UFO #${name}`, id, status: response.status,
      bytes: bytes.length, sha256, elapsedMs: Date.now() - started,
      cache: response.headers.get('x-vercel-cache') });
  }
  const report = { at: new Date().toISOString(), origin, stage, images,
    originalContentVerified: true, noTransactions: true, passed: true };
  fs.writeFileSync(path.join(__dirname, `../docs/test-runs/nft-artwork-gateway-${stage}-2026-10-26.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
