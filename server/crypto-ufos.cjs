const crypto = require('node:crypto');
const { PublicKey, Connection } = require('@solana/web3.js');

const COLLECTION = '53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb';
const LAZOR_PROGRAM = new PublicKey('4h3XoNReAgEcHVxcZ8sw2aufi9MTr7BbvYYjzjWDyDxS');
const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const CHALLENGE_PREFIX = Buffer.from('GAMESOL Crypto UFOs wallet link v1\n');
const PORTAL_ORIGIN = 'https://portal.lazor.sh';
const VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;

function address(value) {
  if (typeof value !== 'string' || value.length > 44) throw new Error('Invalid Solana address.');
  return new PublicKey(value).toBase58();
}

function signingKey(env = process.env) {
  const secret = env.GAMESOL_NFT_LINK_SECRET || env.CRON_SECRET;
  if (!secret || secret.length < 32) throw new Error('NFT wallet linking is not configured.');
  return crypto.createHmac('sha256', secret).update('gamesol:crypto-ufos:receipts:v1').digest();
}

function seal(payload, key) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${crypto.createHmac('sha256', key).update(encoded).digest('base64url')}`;
}

function unseal(token, key, kind, origin, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid wallet link.');
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid wallet link.');
  const expected = crypto.createHmac('sha256', key).update(parts[0]).digest();
  const actual = Buffer.from(parts[1], 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error('Invalid wallet link.');
  const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  if (data.v !== 1 || data.kind !== kind || data.origin !== origin || !Number.isFinite(data.expires) || data.expires <= now) {
    throw new Error('Wallet link expired or belongs to another site. Link your wallet again.');
  }
  address(data.commander); address(data.smartWallet); address(data.owner);
  return data;
}

function messageFor(data) {
  return [
    'GAMESOL: Link my Crypto UFOs holding wallet',
    `Site: ${data.origin}`,
    `Game commander (devnet): ${data.commander}`,
    `NFT holding wallet (mainnet): ${data.owner}`,
    `Collection: ${COLLECTION}`,
    `Nonce: ${data.nonce}`,
    `Expires: ${new Date(data.expires).toISOString()}`,
    'This links identities only. It does not transfer NFTs, SOL, or tokens.',
  ].join('\n');
}

function passkeyChallenge(message) {
  // Different length and domain from Lazor transaction hashes: never a transaction authorization.
  return Buffer.concat([CHALLENGE_PREFIX, crypto.createHash('sha256').update(message).digest()]);
}

function createChallenge(input, origin, key, now = Date.now()) {
  const data = { v: 1, kind: 'challenge', origin, commander: address(input.commander), smartWallet: address(input.smartWallet),
    owner: address(input.owner), nonce: crypto.randomBytes(24).toString('base64url'), expires: now + 5 * 60 * 1000 };
  const message = messageFor(data);
  return { challengeToken: seal(data, key), message, passkeyChallenge: passkeyChallenge(message).toString('base64url') };
}

function verifyHoldingSignature(owner, message, encoded) {
  if (typeof encoded !== 'string' || encoded.length > 100) throw new Error('Missing holding-wallet signature.');
  const signature = Buffer.from(encoded, 'base64');
  if (signature.length !== 64) throw new Error('Invalid holding-wallet signature.');
  const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), new PublicKey(owner).toBuffer()]), format: 'der', type: 'spki' });
  if (!crypto.verify(null, Buffer.from(message), key, signature)) throw new Error('Holding-wallet signature does not match this link.');
}

function verifyPasskeyProof(proof, message, compressedKey) {
  if (!proof || typeof proof !== 'object') throw new Error('Approve this link with your GAMESOL passkey.');
  for (const field of ['signature', 'clientDataJsonBase64', 'authenticatorDataBase64']) {
    if (typeof proof[field] !== 'string' || proof[field].length > 4096) throw new Error('Invalid passkey proof.');
  }
  const clientBytes = Buffer.from(proof.clientDataJsonBase64, 'base64');
  const client = JSON.parse(clientBytes.toString('utf8'));
  if (client.type !== 'webauthn.get' || client.origin !== PORTAL_ORIGIN || client.crossOrigin === true
    || typeof client.challenge !== 'string' || !Buffer.from(client.challenge, 'base64url').equals(passkeyChallenge(message))) {
    throw new Error('Passkey proof does not match this wallet link.');
  }
  const auth = Buffer.from(proof.authenticatorDataBase64, 'base64');
  const rpHash = crypto.createHash('sha256').update(new URL(PORTAL_ORIGIN).hostname).digest();
  if (auth.length < 37 || !auth.subarray(0, 32).equals(rpHash) || (auth[32] & 5) !== 5) {
    throw new Error('Passkey user verification is required.');
  }
  const expanded = crypto.ECDH.convertKey(compressedKey, 'prime256v1', undefined, undefined, 'uncompressed');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: expanded.subarray(1, 33).toString('base64url'), y: expanded.subarray(33, 65).toString('base64url') }, format: 'jwk' });
  const signature = Buffer.from(proof.signature, 'base64');
  if (signature.length !== 64) throw new Error('Invalid passkey signature format.');
  const signed = Buffer.concat([auth, crypto.createHash('sha256').update(clientBytes).digest()]);
  if (!crypto.verify('sha256', signed, { key, dsaEncoding: 'ieee-p1363' }, signature)) throw new Error('Invalid GAMESOL passkey signature.');
}

async function verifyCommander(data, credentialId, proof, message, connection) {
  if (typeof credentialId !== 'string' || credentialId.length > 2048) throw new Error('Invalid passkey credential.');
  const credentialHash = crypto.createHash('sha256').update(Buffer.from(credentialId, 'base64')).digest();
  const smartWallet = new PublicKey(data.smartWallet);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), smartWallet.toBuffer()], LAZOR_PROGRAM);
  const [authority] = PublicKey.findProgramAddressSync([Buffer.from('authority'), smartWallet.toBuffer(), credentialHash], LAZOR_PROGRAM);
  if (vault.toBase58() !== data.commander) throw new Error('Passkey account does not match this commander.');
  const account = await connection.getAccountInfo(authority, 'confirmed');
  if (!account || !account.owner.equals(LAZOR_PROGRAM) || account.data.length < 114
    || account.data[0] !== 2 || account.data[1] !== 1
    || !account.data.subarray(16, 48).equals(smartWallet.toBuffer()) || !account.data.subarray(48, 80).equals(credentialHash)) {
    throw new Error('This passkey is not an active authority for the GAMESOL account.');
  }
  const rpLength = account.data[113];
  if (account.data.subarray(114, 114 + rpLength).toString() !== new URL(PORTAL_ORIGIN).hostname) throw new Error('Unsupported passkey origin.');
  verifyPasskeyProof(proof, message, account.data.subarray(80, 113));
}

function mediaUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  if (value.startsWith('ipfs://')) value = `https://ipfs.io/ipfs/${value.slice(7).replace(/^ipfs\//, '')}`;
  if (value.startsWith('ar://')) value = `https://arweave.net/${value.slice(5)}`;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : null; } catch { return null; }
}

function ownedCollectionAsset(asset, owner) {
  return Boolean(asset && asset.burnt !== true && asset.compression?.compressed === true && asset.ownership?.owner === owner
    && asset.grouping?.some((group) => group.group_key === 'collection' && group.group_value === COLLECTION && group.verified !== false));
}

function displayAsset(asset) {
  const metadata = asset.content?.metadata || {};
  return { id: asset.id, name: String(metadata.name || 'Crypto UFO').slice(0, 120),
    image: mediaUrl(asset.content?.files?.find((file) => file.mime?.startsWith('image/'))?.cdn_uri) || mediaUrl(asset.content?.links?.image)
      || mediaUrl(asset.content?.files?.find((file) => file.mime?.startsWith('image/'))?.uri),
    originalImage: mediaUrl(asset.content?.links?.image),
    traits: (Array.isArray(metadata.attributes) ? metadata.attributes : []).slice(0, 24)
      .filter((trait) => typeof trait.trait_type === 'string' && ['string', 'number'].includes(typeof trait.value))
      .map((trait) => ({ name: trait.trait_type.slice(0, 80), value: String(trait.value).slice(0, 120) })), compressed: true };
}

function mainnetEndpoint(env = process.env) {
  const configured = env.GAMESOL_MAINNET_DAS_RPC_URL;
  if (!configured) throw new Error('Mainnet NFT ownership service is not configured.');
  const url = new URL(configured);
  if (url.protocol !== 'https:') throw new Error('NFT ownership service requires HTTPS.');
  return url.toString();
}

function createDas(endpoint, fetcher = fetch) {
  let verified = false;
  const request = async (method, params) => {
    const response = await fetcher(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'gamesol-cryptoufos', method, params }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Mainnet NFT service is temporarily unavailable.');
    const json = await response.json();
    if (json.error || !Object.prototype.hasOwnProperty.call(json, 'result')) throw new Error('Mainnet NFT lookup failed. Try again shortly.');
    return json.result;
  };
  return async (method, params) => {
    if (!verified) {
      if (await request('getGenesisHash', []) !== MAINNET_GENESIS) throw new Error('NFT ownership service must use Solana mainnet.');
      verified = true;
    }
    return request(method, params);
  };
}

async function fetchOwnedAssets(owner, das) {
  const assets = new Map();
  // Query this collection specifically instead of scanning every NFT in the wallet.
  let complete = false;
  for (let page = 1; page <= 20; page++) {
    const result = await das('searchAssets', { ownerAddress: owner, grouping: ['collection', COLLECTION], compressed: true, burnt: false, page, limit: 100 });
    if (!Array.isArray(result?.items)) throw new Error('Invalid NFT ownership response.');
    for (const asset of result.items) if (ownedCollectionAsset(asset, owner)) assets.set(asset.id, displayAsset(asset));
    if (result.items.length < 100) { complete = true; break; }
  }
  if (!complete) throw new Error('This collection is too large to load completely. Please retry with a smaller holding wallet.');
  return [...assets.values()];
}

function createService({ env = process.env, connection, das, now = Date.now } = {}) {
  const key = signingKey(env);
  const rpc = connection || new Connection(env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
  const lookup = das || createDas(mainnetEndpoint(env));
  return async (body, origin) => {
    if (body.action === 'collection') {
      const page = Number.isInteger(body.page) && body.page >= 1 && body.page <= 1000 ? body.page : 1;
      const result = await lookup('getAssetsByGroup', { groupKey: 'collection', groupValue: COLLECTION, page, limit: 24 });
      if (!Array.isArray(result?.items)) throw new Error('Invalid collection response.');
      return { collection: COLLECTION, assets: result.items.filter((asset) => ownedCollectionAsset(asset, asset.ownership?.owner)).map(displayAsset),
        page, hasMore: result.items.length === 24, total: result.total, checkedAt: now() };
    }
    if (body.action === 'challenge') return createChallenge(body, origin, key, now());
    if (body.action === 'link') {
      const data = unseal(body.challengeToken, key, 'challenge', origin, now());
      const message = messageFor(data);
      verifyHoldingSignature(data.owner, message, body.holdingSignature);
      await verifyCommander(data, body.credentialId, body.passkeyProof, message, rpc);
      const assets = await fetchOwnedAssets(data.owner, lookup);
      const receipt = { ...data, kind: 'link', nonce: undefined, linkedAt: now(), expires: now() + VALIDITY_MS, selectedAsset: null };
      return { linkToken: seal(receipt, key), owner: data.owner, commander: data.commander, assets, selectedAsset: null, checkedAt: now(), expires: receipt.expires };
    }
    if (body.action === 'assets' || body.action === 'assign') {
      const data = unseal(body.linkToken, key, 'link', origin, now());
      if (body.commander !== data.commander) throw new Error('Wallet link belongs to another commander.');
      const assets = await fetchOwnedAssets(data.owner, lookup);
      let selectedAsset = assets.some((asset) => asset.id === data.selectedAsset) ? data.selectedAsset : null;
      if (body.action === 'assign') {
        if (body.assetId !== null) {
          address(body.assetId);
          const current = await lookup('getAsset', { id: body.assetId });
          if (!ownedCollectionAsset(current, data.owner) || !assets.some((asset) => asset.id === body.assetId)) throw new Error('That NFT is no longer owned by your linked wallet.');
        }
        selectedAsset = body.assetId;
      }
      return { linkToken: seal({ ...data, selectedAsset }, key), owner: data.owner, commander: data.commander, assets, selectedAsset, checkedAt: now(), expires: data.expires };
    }
    throw new Error('Unknown NFT action.');
  };
}

module.exports = { COLLECTION, LAZOR_PROGRAM, createService, createChallenge, messageFor, passkeyChallenge,
  verifyHoldingSignature, verifyPasskeyProof, verifyCommander, ownedCollectionAsset, fetchOwnedAssets,
  displayAsset, seal, unseal, signingKey, createDas, mainnetEndpoint };
