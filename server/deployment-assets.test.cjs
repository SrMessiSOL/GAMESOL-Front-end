const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { deploymentAssetBase } = require('./deployment-assets.cjs');

test('local builds keep same-origin assets and releases pin the immutable deployment', () => {
  assert.equal(deploymentAssetBase({}), '/');
  assert.equal(deploymentAssetBase({VERCEL_URL:'ignored.invalid'}), '/');
  assert.equal(deploymentAssetBase({VERCEL:'1',VERCEL_URL:'frontend-release-team.vercel.app'}), 'https://frontend-release-team.vercel.app/');
});

test('release asset hosts reject arbitrary URLs, paths, ports and malformed domains', () => {
  for (const host of [undefined, '', 'https://release.vercel.app', 'release.vercel.app.evil.test', 'release.vercel.app/path', 'release.vercel.app:443', '-release.vercel.app', 'release.vercel.app?key=secret']) {
    assert.throws(() => deploymentAssetBase({VERCEL:'1',VERCEL_URL:host}));
  }
});

test('deployment pinning changes assets only, not wallet origin or server API routing', () => {
  const read = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  assert.match(read('vite.config.ts'), /base: deploymentAssetBase\(process.env\)/);
  assert.match(read('vite.config.ts'), /JSON.stringify\('\/api\/solana-rpc'\)/);
  assert.match(read('src/game-bootstrap.tsx'), /new URL\("\/api\/lazor-paymaster", window.location.origin\)/);
});
