// backend/src/middleware/authMiddleware.js
import { verifyAdminToken, DOWNLOAD_PURPOSE } from "../utils/jwt.js";
import { executeQuery } from "../db/queryHelper.js";

// A JWT's signature and expiry being valid only proves it was genuinely
// issued at login — it says nothing about whether the account is still
// active or still has the role it had back then. Deactivating an admin
// (POST /users/toggle-status) must take effect immediately, not after the
// token's up-to-8h natural expiry, so every authenticated request re-checks
// the account against the DB and refreshes req.admin.role from the current
// row rather than trusting the (possibly stale) token claim. The same check
// retires tokens issued before the last password change: the token's `tv`
// must match users.token_version, which every password change bumps.
// Re-validates a verified token payload against the account (see above) and
// returns req.admin, or null when the account is gone, inactive or the token
// predates the last password change. Throws on a DB failure.
async function loadAdmin(payload) {
  const rows = await executeQuery(
    `SELECT u.is_active, u.token_version, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
    [payload.id]
  );
  if (
    rows.length === 0 ||
    !rows[0].is_active ||
    Number(payload.tv ?? 0) !== Number(rows[0].token_version ?? 0)
  ) {
    return null;
  }
  return { ...payload, role: rows[0].role };
}

async function authenticate(token, { purpose = null } = {}) {
  let payload;
  try {
    payload = verifyAdminToken(token);
  } catch {
    return null;
  }
  // A session token has no purpose, a download ticket has one. Each is only
  // accepted where it is meant to be, so a ticket from a URL can never act as
  // a session.
  if ((payload.purpose ?? null) !== purpose) return null;
  return loadAdmin(payload);
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const admin = await authenticate(token);
    if (!admin) return res.status(401).json({ error: "Unauthorized" });
    req.admin = admin;
    next();
  } catch (err) {
    // Fail closed: if we can't confirm the account is still active, deny access.
    return res.status(401).json({ error: "Unauthorized" });
  }
}

// For the download routes only: a Bearer session token as usual, or a download
// ticket in ?ticket= (media elements, links) or a form field `ticket` (the
// bundle download, submitted as a plain form so the browser streams it to disk).
export async function requireAuthOrTicket(req, res, next) {
  const header = req.headers.authorization || "";
  if (header) return requireAuth(req, res, next);

  const ticket = typeof req.query?.ticket === "string" ? req.query.ticket
    : typeof req.body?.ticket === "string" ? req.body.ticket : null;
  if (!ticket) return res.status(401).json({ error: "Unauthorized" });

  try {
    const admin = await authenticate(ticket, { purpose: DOWNLOAD_PURPOSE });
    if (!admin) return res.status(401).json({ error: "Unauthorized" });
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
