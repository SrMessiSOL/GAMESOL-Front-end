const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const MAX_BODY_BYTES = 1_000_000;

function requestOriginMatchesHost(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const requestHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
    return originHost === requestHost;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requestOriginMatchesHost(req)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "RPC request too large" });
  }

  const rpcUrl = process.env.SOLANA_RPC_URL
    || process.env.GAMESOL_RPC_PROXY_TARGET
    || process.env.VITE_SOLANA_RPC_ENDPOINT
    || DEFAULT_RPC_URL;

  try {
    const upstream = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    return res.send(payload);
  } catch (error) {
    return res.status(502).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "The devnet connection is temporarily unavailable. Please retry." },
      id: null,
    });
  }
}
