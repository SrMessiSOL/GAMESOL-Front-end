const { createDas, mainnetEndpoint, ownedCollectionAsset } = require('./crypto-ufos.cjs');
const IMAGE_DIRECTORY = 'bafybeigxxhol7amgewoep2falpmmdxsjshpceockpsbmyooutvknj5jkhy';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function imageResource(asset) {
  if (!ownedCollectionAsset(asset, asset?.ownership?.owner)) throw new Error('Not a Crypto UFOs cNFT.');
  const source = asset.content?.links?.image;
  if (typeof source !== 'string') throw new Error('NFT image metadata is missing.');
  const url = new URL(source);
  let cid, path;
  if (url.protocol === 'ipfs:') {
    cid = url.hostname; path = url.pathname;
  } else if (url.protocol === 'https:') {
    const parts = url.pathname.split('/');
    if (parts[1] !== 'ipfs') throw new Error('Unsupported NFT image source.');
    cid = parts[2]; path = '/' + parts.slice(3).join('/');
  }
  if (cid !== IMAGE_DIRECTORY || !/^\/[0-9]{1,5}$/.test(path)) throw new Error('Unsupported NFT image source.');
  return `ipfs://${cid}${path}`;
}

function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  throw new Error('Retrieved NFT content is not an image.');
}

async function readImage(response) {
  if (!response.ok || !response.body) throw new Error('Original NFT artwork is temporarily unavailable.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new Error('NFT image exceeds the size limit.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  return { bytes, type: imageType(bytes) };
}

function createImageService({ env = process.env, das, verifiedFetch } = {}) {
  const lookup = das || createDas(mainnetEndpoint(env));
  let fetchPromise;
  const pending = new Map();
  const cache = new Map();
  let cachedBytes = 0;
  return async (id) => {
    const cached = cache.get(id);
    if (cached && cached.until > Date.now()) return cached.image;
    if (pending.has(id)) return pending.get(id);
    if (pending.size >= 16) throw new Error('NFT artwork reader is busy. Retry shortly.');
    const request = (async () => {
      const asset = await lookup('getAsset', { id });
      if (asset?.id !== id) throw new Error('NFT metadata does not match the requested address.');
      const resource = imageResource(asset);
      // Helia verifies the original CID's blocks; no replacement or generated artwork.
      fetchPromise ||= verifiedFetch ? Promise.resolve(verifiedFetch) : import('@helia/verified-fetch').then(({ createVerifiedFetch }) => createVerifiedFetch());
      const fetchImage = await fetchPromise;
      const image = await readImage(await fetchImage(resource, { signal: AbortSignal.timeout(45000) }));
      const previous = cache.get(id);
      if (previous) { cachedBytes -= previous.image.bytes.length; cache.delete(id); }
      while (cache.size && (cache.size >= 128 || cachedBytes + image.bytes.length > 16 * 1024 * 1024)) {
        const first = cache.keys().next().value;
        cachedBytes -= cache.get(first).image.bytes.length; cache.delete(first);
      }
      cache.set(id, { image, until: Date.now() + 3600000 }); cachedBytes += image.bytes.length;
      return image;
    })();
    pending.set(id, request);
    try { return await request; } finally { pending.delete(id); }
  };
}

module.exports = { imageResource, imageType, readImage, createImageService };
