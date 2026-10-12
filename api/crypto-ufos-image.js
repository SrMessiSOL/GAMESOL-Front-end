const { PublicKey } = require('@solana/web3.js');
const { createImageService } = require('../server/crypto-ufo-images.cjs');
let service;

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const id = req.query?.id;
  try {
    if (typeof id !== 'string' || id.length > 44 || new PublicKey(id).toBase58() !== id) throw new Error();
  } catch { return res.status(400).json({ error: 'Invalid NFT address.' }); }
  try {
    service ||= createImageService();
    const image = await service(id);
    res.setHeader('Content-Type', image.type);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(image.bytes);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Original NFT artwork is temporarily unavailable. Please retry.' });
  }
};
