// src/middleware/requireHttps.js
//
// A personal access token is a long-lived bearer credential, so /mcp refuses
// plain HTTP (docs/mcp/01_spec.md D12). HTTPS is recognised from the trusted
// proxy's X-Forwarded-Proto (req.protocol under "trust proxy"). The nginx
// block for /api/mcp passes the outer TLS proxy's value through.
//
// Exempt: a direct loopback client with no forwarding headers (local
// development). nginx always sets X-Forwarded-For, so a proxied request never
// looks direct. MCP_ALLOW_HTTP=true opts out entirely, for the internal test
// container only.
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function requireHttps(req, res, next) {
  if (process.env.MCP_ALLOW_HTTP === "true") return next();
  if (req.protocol === "https") return next();
  const direct = !req.headers["x-forwarded-for"] && !req.headers["x-forwarded-proto"];
  if (direct && LOOPBACK.has(req.socket?.remoteAddress)) return next();
  return res.status(403).json({ error: "https_required" });
}
