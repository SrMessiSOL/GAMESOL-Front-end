const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PublicKey, Keypair } = require('@solana/web3.js');
const nft = require('./crypto-ufos.cjs');
const origin = 'https://game.example';
const key = nft.signingKey({ GAMESOL_NFT_LINK_SECRET: 'test-only-secret-with-at-least-32-characters' });
const ownerKeys = crypto.generateKeyPairSync('ed25519');
const owner = new PublicKey(ownerKeys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)).toBase58();
const smartWallet = Keypair.generate().publicKey;
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), smartWallet.toBuffer()], nft.LAZOR_PROGRAM);
const input = { owner, smartWallet: smartWallet.toBase58(), commander: vault.toBase58() };
const asset = { id: Keypair.generate().publicKey.toBase58(), compression: { compressed: true }, ownership: { owner },
  grouping: [{ group_key: 'collection', group_value: nft.COLLECTION }], content: { metadata: { name: 'Test NFT' }, links: { image: 'https://example.com/art.png' } } };

test('commander avatar is available inside both game views with ownership-backed persistence', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (name) => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
  const ui = read('CryptoUfos.tsx');
  const game = read('UniverseGame.tsx');
  assert.match(ui, /export function CommanderAvatar\(/);
  assert.match(ui, /flagship \? <NftImage asset=\{flagship\}/);
  assert.match(ui, /restoredCommanderAsset\(result\.assets, owner, selected/);
  assert.match(ui, /fetchCommanderIdentity\(binding\.game\.getConnection\(\), binding\.commander\)/);
  assert.match(ui, /saveCommanderSelection\(active\.game, active\.commander/);
  assert.doesNotMatch(ui, /selectionKey|cryptoufos:cosmetic/);
  assert.match(game, /bindGame\(client, publicKey\?\.toBase58\(\)/);
  assert.match(game, /createPortal\(<CommanderAvatarDialog/);
  assert.equal((game.match(/setAvatarPickerOpen\(true\)/g) || []).length, 2);
  assert.match(read('PlanetWorld.tsx'), /<CommanderAvatar fallback=\{wallet\.label/);
  const css = read('crypto-ufos.css');
  assert.match(css, /\.nft-page\{height:100dvh;min-height:0;overflow-y:auto/);
});

test('artwork reader preserves the original CID, rejects arbitrary URLs and checks image bytes', async () => {
  const { imageResource, imageType, createImageService } = require('./crypto-ufo-images.cjs');
  const original = 'https://nftstorage.link/ipfs/bafybeigxxhol7amgewoep2falpmmdxsjshpceockpsbmyooutvknj5jkhy/8342';
  const imageAsset = { ...asset, content: { links: { image: original } } };
  assert.equal(imageResource(imageAsset), original.replace('https://nftstorage.link/ipfs/', 'ipfs://'));
  assert.throws(() => imageResource(asset));
  assert.throws(() => imageResource({ ...imageAsset, grouping: [] }));
  assert.throws(() => imageResource({ ...imageAsset, content: { links: { image: original + '/../other' } } }));
  assert.throws(() => imageType(Buffer.from('<html>not artwork</html>')));
  let reads = 0;
  const jpeg = Buffer.from('ffd8ffe000104a46494600', 'hex');
  const reader = createImageService({ das: async () => imageAsset, verifiedFetch: async (resource) => {
    assert.equal(resource, imageResource(imageAsset)); reads++;
    return new Response(jpeg);
  } });
  const result = await reader(asset.id);
  assert.equal(result.type, 'image/jpeg'); assert.deepEqual(result.bytes, jpeg);
  await reader(asset.id); assert.equal(reads, 1);
  assert.equal(nft.displayAsset(imageAsset).image, `/api/crypto-ufos-image?id=${asset.id}`);
});

test('public owner reader needs no passkey, commander, signature or link secret', async () => {
  const service = nft.createService({ env: {}, connection: { getAccountInfo() { throw new Error('Must not consult LazorKit'); } },
    das: async () => ({ items: [asset, { ...asset, id: 'wrong-owner', ownership: { owner: input.commander } }] }) });
  const result = await service({ action: 'owner-assets', owner }, origin);
  assert.equal(result.owner, owner);
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].id, asset.id);
  assert.equal(result.identityVerified, false);
  assert.equal(result.linkToken, undefined);
  await assert.rejects(service({ action: 'owner-assets', owner: 'invalid!' }, origin));
});

test('direct holding-wallet connection calls connect only, never signing', async () => {
  const fs = require('node:fs');
  const ts = require('typescript');
  const Module = require('node:module');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/nft-holding-wallet.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = new Module('holding-wallet-test');
  module._compile(compiled, 'holding-wallet-test.cjs');
  let connections = 0;
  const options = [];
  const account = { address: owner, chains: ['solana:mainnet'], features: [] };
  const wallet = { features: {
    'standard:connect': { connect: async (input) => { connections++; options.push(input); return { accounts: [account] }; } },
    'solana:signMessage': { signMessage() { throw new Error('Must not sign'); } },
    'solana:signTransaction': { signTransaction() { throw new Error('Must not transact'); } },
  } };
  assert.equal((await module.exports.connectHoldingWallet(wallet)).address, owner);
  assert.equal(connections, 1);
  assert.equal((await module.exports.connectHoldingWallet(wallet, true)).address, owner);
  assert.deepEqual(options, [{ silent: false }, { silent: true }]);
  assert.equal(module.exports.holdingAccount([]), null);
  const ui = fs.readFileSync(require('node:path').join(__dirname, '../src/CryptoUfos.tsx'), 'utf8');
  assert.doesNotMatch(ui, /DialogManager|useLazorWallet|passkeyProof|holdingSignature|linkToken/);
  const galleryFlow = ui.slice(ui.indexOf('const connect ='), ui.indexOf('const refresh ='));
  assert.doesNotMatch(galleryFlow, /signMessage|ufo-challenge|ufo-verify/);
  assert.match(ui, /const verifyUtility = .*signOwnership\(commander, asset, 'expedition'\)/);
  assert.doesNotMatch(ui, /action: 'collection'|The collection|collectionBusy|setCollection/);
  assert.match(ui, /const assets = nft\.link\?\.assets \?\? \[\]/);
});

test('challenge receipts reject tampering, expiry, wrong site and wrong purpose', () => {
  const challenge = nft.createChallenge(input, origin, key, 1000);
  assert.equal(nft.unseal(challenge.challengeToken, key, 'challenge', origin, 1001).owner, owner);
  assert.throws(() => nft.unseal(challenge.challengeToken + 'x', key, 'challenge', origin, 1001));
  assert.throws(() => nft.unseal(challenge.challengeToken, key, 'link', origin, 1001));
  assert.throws(() => nft.unseal(challenge.challengeToken, key, 'challenge', 'https://evil.example', 1001));
  assert.throws(() => nft.unseal(challenge.challengeToken, key, 'challenge', origin, 301001));
  assert.notEqual(nft.passkeyChallenge(challenge.message).length, 32);
});

test('external wallet must sign the exact link message', () => {
  const message = nft.createChallenge(input, origin, key).message;
  const signature = crypto.sign(null, Buffer.from(message), ownerKeys.privateKey).toString('base64');
  nft.verifyHoldingSignature(owner, message, signature);
  assert.throws(() => nft.verifyHoldingSignature(owner, message + 'changed', signature));
  assert.throws(() => nft.verifyHoldingSignature(Keypair.generate().publicKey.toBase58(), message, signature));
});

function passkeyFixture(message) {
  const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = keys.publicKey.export({ format: 'jwk' });
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  const compressed = crypto.ECDH.convertKey(point, 'prime256v1', undefined, undefined, 'compressed');
  const client = Buffer.from(JSON.stringify({ type: 'webauthn.get', origin: 'https://portal.lazor.sh', challenge: nft.passkeyChallenge(message).toString('base64url'), crossOrigin: false }));
  const auth = Buffer.concat([crypto.createHash('sha256').update('portal.lazor.sh').digest(), Buffer.from([5, 0, 0, 0, 1])]);
  const signature = crypto.sign('sha256', Buffer.concat([auth, crypto.createHash('sha256').update(client).digest()]), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
  return { compressed, proof: { signature: signature.toString('base64'), clientDataJsonBase64: client.toString('base64'), authenticatorDataBase64: auth.toString('base64') } };
}

test('passkey proof requires valid P256 signature, exact challenge and user verification', () => {
  const fixture = passkeyFixture('link');
  nft.verifyPasskeyProof(fixture.proof, 'link', fixture.compressed);
  assert.throws(() => nft.verifyPasskeyProof(fixture.proof, 'another link', fixture.compressed));
  const auth = Buffer.from(fixture.proof.authenticatorDataBase64, 'base64');
  auth[32] = 1;
  assert.throws(() => nft.verifyPasskeyProof({ ...fixture.proof, authenticatorDataBase64: auth.toString('base64') }, 'link', fixture.compressed));
});

test('only currently owned, unburned cNFTs from the exact collection are eligible', () => {
  assert.equal(nft.ownedCollectionAsset(asset, owner), true);
  assert.equal(nft.ownedCollectionAsset({ ...asset, burnt: true }, owner), false);
  assert.equal(nft.ownedCollectionAsset({ ...asset, compression: { compressed: false } }, owner), false);
  assert.equal(nft.ownedCollectionAsset({ ...asset, grouping: [] }, owner), false);
  assert.equal(nft.ownedCollectionAsset(asset, input.commander), false);
  assert.equal(nft.displayAsset({ ...asset, content: { links: { image: 'javascript:alert(1)' } } }).image, null);
});

test('refresh removes a sold flagship and prevents assignment to an unowned asset', async () => {
  const receipt = nft.seal({ ...input, v: 1, kind: 'link', origin, expires: Date.now() + 60000, selectedAsset: asset.id }, key);
  const service = nft.createService({ env: { GAMESOL_NFT_LINK_SECRET: 'test-only-secret-with-at-least-32-characters' }, connection: {}, das: async (method) => method === 'searchAssets' ? { items: [] } : asset });
  const result = await service({ action: 'assets', commander: input.commander, linkToken: receipt }, origin);
  assert.equal(result.selectedAsset, null);
  await assert.rejects(service({ action: 'assign', commander: input.commander, linkToken: receipt, assetId: asset.id }, origin));
  await assert.rejects(service({ action: 'assets', commander: owner, linkToken: receipt }, origin));
});

test('DAS refuses a devnet provider before querying NFTs', async () => {
  const methods = [];
  const das = nft.createDas('https://rpc.example', async (_, options) => {
    methods.push(JSON.parse(options.body).method);
    return { ok: true, json: async () => ({ result: 'devnet-genesis' }) };
  });
  await assert.rejects(das('searchAssets', {}), /mainnet/);
  assert.deepEqual(methods, ['getGenesisHash']);
});

test('DAS accepts the full mainnet genesis hash, not a shortened chain identifier', async () => {
  const methods = [];
  const das = nft.createDas('https://rpc.example', async (_, options) => {
    const method = JSON.parse(options.body).method;
    methods.push(method);
    return { ok: true, json: async () => ({ result: method === 'getGenesisHash' ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' : { items: [] } }) };
  });
  assert.deepEqual(await das('searchAssets', {}), { items: [] });
  assert.deepEqual(methods, ['getGenesisHash', 'searchAssets']);
});

test('complete dual-signature link validates the registered commander authority', async () => {
  const credentialId = Buffer.from('test-credential').toString('base64');
  const hash = crypto.createHash('sha256').update(Buffer.from(credentialId, 'base64')).digest();
  const [authority] = PublicKey.findProgramAddressSync([Buffer.from('authority'), smartWallet.toBuffer(), hash], nft.LAZOR_PROGRAM);
  let fixture;
  const connection = { getAccountInfo: async (requested) => {
    assert.equal(requested.toBase58(), authority.toBase58());
    const rp = Buffer.from('portal.lazor.sh');
    const data = Buffer.alloc(114 + rp.length);
    data[0] = 2; data[1] = 1;
    smartWallet.toBuffer().copy(data, 16); hash.copy(data, 48);
    fixture.compressed.copy(data, 80); data[113] = rp.length; rp.copy(data, 114);
    return { owner: nft.LAZOR_PROGRAM, data };
  } };
  const service = nft.createService({ env: { GAMESOL_NFT_LINK_SECRET: 'test-only-secret-with-at-least-32-characters' }, connection,
    das: async () => ({ items: [asset] }) });
  const challenge = await service({ action: 'challenge', ...input }, origin);
  fixture = passkeyFixture(challenge.message);
  const result = await service({ action: 'link', challengeToken: challenge.challengeToken, credentialId,
    holdingSignature: crypto.sign(null, Buffer.from(challenge.message), ownerKeys.privateKey).toString('base64'), passkeyProof: fixture.proof }, origin);
  assert.equal(result.owner, owner);
  assert.equal(result.commander, input.commander);
  assert.equal(result.assets[0].id, asset.id);
  await assert.rejects(service({ action: 'link', challengeToken: challenge.challengeToken, credentialId,
    holdingSignature: crypto.sign(null, Buffer.from(challenge.message), ownerKeys.privateKey).toString('base64'),
    passkeyProof: passkeyFixture(challenge.message).proof }, origin), /signature/);
});
