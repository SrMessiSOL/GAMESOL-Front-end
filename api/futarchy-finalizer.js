const { runFutarchyKeeper } = require("../server/futarchy-keeper.cjs");

function bodyFromRequest(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  return JSON.parse(req.body);
}

function sameOriginRequest(req) {
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "same-origin") return true;
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const cronAuthorized = Boolean(process.env.CRON_SECRET)
    && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  if (req.method === "GET" && !cronAuthorized) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  if (req.method === "POST" && !cronAuthorized && !sameOriginRequest(req)) {
    return res.status(403).json({ error: "Cross-origin finalization triggers are not allowed." });
  }

  try {
    const body = req.method === "POST" ? bodyFromRequest(req) : {};
    const proposalAddress = typeof body.proposal === "string" ? body.proposal.trim() : null;
    if (req.method === "POST" && !proposalAddress) {
      return res.status(400).json({ error: "A proposal address is required." });
    }
    const result = await runFutarchyKeeper({ proposalAddress });
    const retryPending = result.results.some((entry) => entry.retryable);
    return res.status(retryPending ? 202 : 200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Futarchy keeper failed.";
    const configurationError = /not configured|devnet-only/i.test(message);
    return res.status(configurationError ? 503 : 400).json({ error: message });
  }
};
