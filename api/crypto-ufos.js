const { createService } = require('../server/crypto-ufos.cjs');
let service;
const windows = new Map();

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed.' }); }
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  let origin;
  try {
    origin = new URL(req.headers.origin).origin;
    if (new URL(origin).host !== host) throw new Error();
  } catch { return res.status(403).json({ error: 'Use the game website to link your wallet.' }); }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  for (const [key, value] of windows) if (value.until < now) windows.delete(key);
  const window = windows.get(ip) || { until: now + 60000, count: 0 };
  window.count++; windows.set(ip, window);
  if (window.count > 20) return res.status(429).json({ error: 'Too many NFT requests. Wait a minute and retry.' });
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (Buffer.byteLength(raw) > 16000) return res.status(413).json({ error: 'Wallet-link request too large.' });
    service ||= createService();
    return res.status(200).json(await service(JSON.parse(raw), origin));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'NFT lookup failed.';
    const configured = /not configured|service requires|must use Solana mainnet/.test(message);
    const upstream = /temporarily unavailable|lookup failed/.test(message);
    return res.status(configured ? 503 : upstream ? 502 : 400).json({ error: /Invalid character|Non-base58|Invalid public key/.test(message) ? 'Invalid Solana address.' : message });
  }
};
