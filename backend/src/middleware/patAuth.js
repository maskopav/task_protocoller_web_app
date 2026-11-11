// src/middleware/patAuth.js
//
// Authenticates /mcp with a personal access token (docs/mcp/01_spec.md 3.2).
// Like requireAuth it re-reads the account on every call, so deactivation, a
// role change or turning off can_use_mcp takes effect at once, and a password
// change (token_version bump) retires every token issued before it.
//
// req.admin gets the shape loadAdmin gives a JWT session, plus `via` and
// `tokenId`, so every controller sees an ordinary user. A JWT is never
// accepted here, and a token is never accepted by requireAuth.
import { executeQuery } from "../db/queryHelper.js";
import { hashPat, isPatFormat } from "../utils/pat.js";

export async function loadPatAdmin(token) {
  if (!isPatFormat(token)) return null;
  const rows = await executeQuery(
    `SELECT t.id AS token_id, t.token_version AS token_tv,
            (t.last_used_at IS NULL OR t.last_used_at < UTC_TIMESTAMP() - INTERVAL 1 MINUTE) AS stale,
            u.id, u.email, u.role_id, u.is_active, u.can_use_mcp, u.token_version, r.name AS role
     FROM personal_access_tokens t
     JOIN users u ON u.id = t.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE t.token_hash = ? AND t.revoked_at IS NULL AND t.expires_at > UTC_TIMESTAMP()`,
    [hashPat(token)]
  );
  const row = rows[0];
  if (
    !row ||
    !Number(row.is_active) ||
    (row.role !== "master" && !Number(row.can_use_mcp)) ||
    Number(row.token_tv) !== Number(row.token_version ?? 0)
  ) {
    return null;
  }
  if (Number(row.stale)) {
    await executeQuery(`UPDATE personal_access_tokens SET last_used_at = UTC_TIMESTAMP() WHERE id = ?`, [row.token_id]);
  }
  return {
    id: Number(row.id),
    email: row.email,
    role: row.role,
    role_id: Number(row.role_id),
    tv: Number(row.token_version ?? 0),
    via: "mcp",
    tokenId: Number(row.token_id),
  };
}

function unauthorized(res) {
  res.set("WWW-Authenticate", 'Bearer realm="mcp"');
  return res.status(401).json({ error: "Unauthorized" });
}

export async function requirePat(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) return unauthorized(res);
  try {
    const admin = await loadPatAdmin(token);
    if (!admin) return unauthorized(res);
    req.admin = admin;
    next();
  } catch {
    // Fail closed, as requireAuth does.
    return unauthorized(res);
  }
}
