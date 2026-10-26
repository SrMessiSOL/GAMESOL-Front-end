const test = require('node:test');
const assert = require('node:assert/strict');
const { createVerifiedIpfsFetch, boundedBody } = require('./verified-ipfs-artwork.cjs');
const requestedCid = value => {
  const url = new URL(value);
  return url.hostname.includes('.ipfs.') ? url.hostname.split('.')[0] : url.pathname.split('/')[2];
};

async function fixture({ chunked = true } = {}) {
  const [{ CID }, { sha256 }, dagPb, { UnixFS }] = await Promise.all([
    import('multiformats/cid'), import('multiformats/hashes/sha2'),
    import('@ipld/dag-pb'), import('ipfs-unixfs'),
  ]);
  const blocks = new Map();
  async function store(code, bytes) {
    const cid = CID.createV1(code, await sha256.digest(bytes));
    blocks.set(cid.toString(), bytes);
    return cid;
  }
  const image = Buffer.from('ffd8ffe000104a46494600010203040506070809', 'hex');
  const first = image.subarray(0, 12), second = image.subarray(12);
  const firstCid = await store(0x55, first), secondCid = await store(0x55, second);
  const file = new UnixFS({ type: 'file', blockSizes: [BigInt(first.length), BigInt(second.length)] });
  const fileBytes = dagPb.encode({ Data: file.marshal(), Links: [
    { Hash: firstCid, Name: '', Tsize: first.length },
    { Hash: secondCid, Name: '', Tsize: second.length },
  ] });
  const fileCid = chunked ? await store(0x70, fileBytes) : await store(0x55, image);
  const dirBytes = dagPb.encode({ Data: new UnixFS({ type: 'directory' }).marshal(),
    Links: [{ Hash: fileCid, Name: '513', Tsize: fileBytes.length + image.length }] });
  const root = await store(0x70, dirBytes);
  return { resource: `ipfs://${root}/513`, blocks, image, root: root.toString(), leaf: firstCid.toString() };
}

test('official UnixFS reader reconstructs a chunked image using only hash-verified raw blocks', async () => {
  const data = await fixture();
  const requests = [];
  const fetchArtwork = createVerifiedIpfsFetch({ fetchImpl: async (url, options) => {
    if (options.headers.accept === 'application/octet-stream') return new Response(data.image);
    requests.push(url);
    assert.equal(options.headers.accept, 'application/vnd.ipld.raw');
    assert.equal(options.redirect, 'error');
    const cid = requestedCid(url);
    const bytes = data.blocks.get(cid);
    assert.ok(bytes);
    return new Response(bytes);
  } });
  const response = await fetchArtwork(data.resource);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), data.image);
  assert.equal(requests.length, data.blocks.size);
  assert.ok(requests.every(url => new URL(url).hostname === 'ipfs.filebase.io'));
});

for (const corrupt of ['root', 'leaf']) {
  test(`rejects tampered ${corrupt} blocks before returning artwork`, async () => {
    const data = await fixture();
    const fetchArtwork = createVerifiedIpfsFetch({ fetchImpl: async (url, options) => {
      if (options.headers.accept === 'application/octet-stream') return new Response('forged image');
      const cid = requestedCid(url);
      const bytes = data.blocks.get(cid);
      return new Response(cid === data[corrupt] ? Buffer.from('forged image or directory') : bytes);
    } });
    await assert.rejects(fetchArtwork(data.resource), /CID verification/);
  });
}

test('a corrupt or unavailable gateway falls back without trusting the replacement response', async () => {
  const data = await fixture();
  let failures = 0;
  const fetchArtwork = createVerifiedIpfsFetch({ fetchImpl: async (url, options) => {
    if (options.headers.accept === 'application/octet-stream') return new Response('not the requested image');
    if (new URL(url).hostname === 'ipfs.filebase.io') {
      failures++;
      return new Response('not the requested block');
    }
    return new Response(data.blocks.get(requestedCid(url)));
  } });
  assert.deepEqual(Buffer.from(await (await fetchArtwork(data.resource)).arrayBuffer()), data.image);
  assert.equal(failures, data.blocks.size);
});

test('full-path raw file is accepted only after its hash matches the resolved leaf CID', async () => {
  const data = await fixture({ chunked: false });
  let candidateReads = 0;
  const fetchArtwork = createVerifiedIpfsFetch({ fetchImpl: async (url, options) => {
    if (options.headers.accept === 'application/octet-stream') {
      candidateReads++;
      assert.equal(new URL(url).pathname, `/ipfs/${data.root}/513`);
      return new Response(data.image);
    }
    const cid = requestedCid(url);
    if (cid !== data.root) throw new Error('must not need standalone raw leaf retrieval');
    return new Response(data.blocks.get(cid));
  } });
  assert.deepEqual(Buffer.from(await (await fetchArtwork(data.resource)).arrayBuffer()), data.image);
  assert.equal(candidateReads, 1);
});

test('forged full-path response cannot bypass the resolved raw leaf hash', async () => {
  const data = await fixture({ chunked: false });
  const fetchArtwork = createVerifiedIpfsFetch({ fetchImpl: async (url, options) => {
    if (options.headers.accept === 'application/octet-stream') return new Response('forged image');
    const cid = requestedCid(url);
    return new Response(cid === data.root ? data.blocks.get(cid) : Buffer.from('forged leaf'));
  } });
  await assert.rejects(fetchArtwork(data.resource), /CID verification/);
});

test('alternate directory gateway recovers a missing original without trusting its bytes', async () => {
  const data = await fixture({ chunked: false });
  const candidates = [];
  const fetchArtwork = createVerifiedIpfsFetch({ fetchImpl: async (url, options) => {
    if (options.headers.accept === 'application/octet-stream') {
      candidates.push(new URL(url).hostname);
      return new URL(url).hostname === 'ipfs.filebase.io'
        ? new Response('unavailable', { status: 503 }) : new Response(data.image);
    }
    const cid = requestedCid(url);
    assert.equal(cid, data.root, 'standalone leaf should not be needed');
    return new Response(data.blocks.get(cid));
  } });
  assert.deepEqual(Buffer.from(await (await fetchArtwork(data.resource)).arrayBuffer()), data.image);
  assert.deepEqual(candidates, ['ipfs.filebase.io', 'gateway.pinata.cloud']);
});

test('legacy gateway failures do not block original artwork from the verified preferred route', async () => {
  const data = await fixture({ chunked: false });
  const fetchArtwork = createVerifiedIpfsFetch({ fetchImpl: async (url, options) => {
    assert.equal(new URL(url).hostname, 'ipfs.filebase.io');
    assert.equal(options.redirect, 'error');
    return new Response(options.headers.accept === 'application/octet-stream'
      ? data.image : data.blocks.get(requestedCid(url)));
  } });
  assert.deepEqual(Buffer.from(await (await fetchArtwork(data.resource)).arrayBuffer()), data.image);
});

test('third gateway remains available when both earlier providers fail', async () => {
  const data = await fixture({ chunked: false });
  const hosts = new Set();
  const fetchArtwork = createVerifiedIpfsFetch({ fetchImpl: async (url, options) => {
    const host = new URL(url).hostname;
    hosts.add(host);
    if (host !== 'trustless-gateway.link') return new Response('unavailable', {status:503});
    return new Response(options.headers.accept === 'application/octet-stream'
      ? data.image : data.blocks.get(requestedCid(url)));
  } });
  assert.deepEqual(Buffer.from(await (await fetchArtwork(data.resource)).arrayBuffer()), data.image);
  assert.equal(hosts.size, 3);
});

test('artwork retrieval rejects invalid resources and respects cancellation', async () => {
  const data = await fixture();
  const fetchArtwork = createVerifiedIpfsFetch({ fetchImpl: () => { throw Error('must not fetch'); } });
  for (const resource of ['https://example.com/513', data.resource + '?url=evil', data.resource + '#evil', data.resource + '/more']) {
    await assert.rejects(fetchArtwork(resource), /Unsupported NFT image resource/);
  }
  await assert.rejects(fetchArtwork(data.resource, { signal: AbortSignal.abort() }), { name: 'AbortError' });
});

test('raw block reader bounds declared and streamed bodies and rejects HTTP errors', async () => {
  await assert.rejects(boundedBody(new Response('too large', { headers: { 'content-length': '100' } }), 8), /size limit/);
  await assert.rejects(boundedBody(new Response('too large'), 8), /size limit/);
  await assert.rejects(boundedBody(new Response('error', { status: 503 }), 100), /unavailable/);
});
