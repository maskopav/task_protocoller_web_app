// src/middleware/apiKeyAuth.js — guards the server-to-server admin API.
// Expects `Authorization: Bearer <raw api key>`. Resolves the tenant from
// the key's hash and attaches it as req.tenant so downstream handlers never
// have to re-look it up (and can't accidentally operate cross-tenant).
import { executeQuery } from "../db/queryHelper.js";
import { hashApiKey } from "../utils/apiKey.js";

export async function requireApiKey(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, rawKey] = header.split(" ");

  if (scheme !== "Bearer" || !rawKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const rows = await executeQuery(
      `SELECT id, name, link_signing_secret FROM tenants WHERE api_key_hash = ?`,
      [hashApiKey(rawKey)]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.tenant = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
