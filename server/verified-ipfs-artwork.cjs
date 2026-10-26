const { createHash } = require('node:crypto');

const MAX_BLOCK_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const MAX_BLOCK_READS = 128;
const GATEWAY_HOSTS = ['ipfs.filebase.io', 'gateway.pinata.cloud', 'trustless-gateway.link'];
const GATEWAYS = GATEWAY_HOSTS.map(host => cid => `https://${host}/ipfs/${cid}?format=raw`);

async function boundedBody(response, limit) {
  if (!response.ok || !response.body) throw new Error('IPFS block is unavailable.');
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > limit) {
    await response.body.cancel();
    throw new Error('IPFS block exceeds the size limit.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('IPFS block exceeds the size limit.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}

function createVerifiedIpfsFetch({ fetchImpl = fetch } = {}) {
  return async (resource, { signal: callerSignal } = {}) => {
    const [{ exporter }, { CID }] = await Promise.all([
      import('ipfs-unixfs-exporter'), import('multiformats/cid'),
    ]);
    const url = new URL(resource);
    if (url.protocol !== 'ipfs:' || !/^\/[0-9]{1,5}$/.test(url.pathname)
      || url.search || url.hash || url.username || url.password || url.port) {
      throw new Error('Unsupported NFT image resource.');
    }
    const root = CID.parse(url.hostname);
    const deadline = AbortSignal.timeout(45000);
    const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
    const cache = new Map();
    let pathCandidate;
    let totalBytes = 0;
    let reads = 0;
    const blockstore = {
      async *get(cid) {
        signal.throwIfAborted();
        if (![0x55, 0x70].includes(cid.code) || cid.multihash.code !== 0x12 || cid.multihash.size !== 32) {
          throw new Error('Unsupported NFT block encoding.');
        }
        const key = cid.toV1().toString();
        if (!cache.has(key)) {
          if (++reads > MAX_BLOCK_READS) throw new Error('NFT block read limit exceeded.');
          const pending = (async () => {
            // Some gateways can route a known directory path but not its leaf
            // CID alone. A whole-file candidate is usable ONLY when it hashes
            // to this exact raw leaf reached through the verified directory.
            if (cid.code === 0x55) {
              pathCandidate ||= (async () => {
                const response = await fetchImpl(`https://${GATEWAY_HOSTS[0]}/ipfs/${root.toV1()}/${url.pathname.slice(1)}`, {
                  headers: { accept: 'application/octet-stream' }, redirect: 'error',
                  signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
                });
                const bytes = await boundedBody(response, MAX_BLOCK_BYTES);
                totalBytes += bytes.length;
                return { bytes, hash: createHash('sha256').update(bytes).digest() };
              })().catch(() => null);
              const candidate = await pathCandidate;
              signal.throwIfAborted();
              if (totalBytes > MAX_TOTAL_BYTES) throw new Error('NFT block byte limit exceeded.');
              if (candidate?.hash.equals(Buffer.from(cid.multihash.digest))) return candidate.bytes;
              // Directory routing can work even when a gateway cannot serve a
              // leaf CID. The alternate bytes still have to match that leaf.
              for (const host of GATEWAY_HOSTS.slice(1)) try {
                const response = await fetchImpl(`https://${host}/ipfs/${root.toV1()}/${url.pathname.slice(1)}`, {
                  headers: { accept: 'application/octet-stream' }, redirect: 'error',
                  signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
                });
                const bytes = await boundedBody(response, MAX_BLOCK_BYTES);
                totalBytes += bytes.length;
                if (totalBytes > MAX_TOTAL_BYTES) throw new Error('NFT block byte limit exceeded.');
                if (createHash('sha256').update(bytes).digest().equals(Buffer.from(cid.multihash.digest))) return bytes;
              } catch (error) {
                signal.throwIfAborted();
                if (totalBytes > MAX_TOTAL_BYTES) throw error;
              }
            }
            let lastError;
            for (const gateway of GATEWAYS) {
              signal.throwIfAborted();
              try {
                const response = await fetchImpl(gateway(key), {
                  headers: { accept: 'application/vnd.ipld.raw' }, redirect: 'error',
                  signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
                });
                const bytes = await boundedBody(response, MAX_BLOCK_BYTES);
                totalBytes += bytes.length;
                if (totalBytes > MAX_TOTAL_BYTES) throw new Error('NFT block byte limit exceeded.');
                if (!createHash('sha256').update(bytes).digest().equals(Buffer.from(cid.multihash.digest))) {
                  throw new Error('NFT block failed CID verification.');
                }
                return bytes;
              } catch (error) {
                lastError = error;
                if (totalBytes > MAX_TOTAL_BYTES) throw error;
              }
            }
            throw lastError;
          })();
          cache.set(key, pending);
        }
        yield await cache.get(key);
      },
    };
    const entry = await exporter(`${root}/${url.pathname.slice(1)}`, blockstore, { signal });
    if (!['file', 'raw'].includes(entry.type) || entry.size > BigInt(MAX_IMAGE_BYTES)) {
      throw new Error('NFT image is not a supported file or exceeds the size limit.');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of entry.content({ signal, blockReadConcurrency: 1 })) {
      signal.throwIfAborted();
      size += chunk.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new Error('NFT image exceeds the size limit.');
      chunks.push(Buffer.from(chunk));
    }
    return new Response(Buffer.concat(chunks));
  };
}

module.exports = { createVerifiedIpfsFetch, boundedBody };
