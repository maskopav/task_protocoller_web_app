// backend/src/middleware/authMiddleware.js
import { verifyAdminToken } from "../utils/jwt.js";
import { executeQuery } from "../db/queryHelper.js";

// A JWT's signature and expiry being valid only proves it was genuinely
// issued at login — it says nothing about whether the account is still
// active or still has the role it had back then. Deactivating an admin
// (POST /users/toggle-status) must take effect immediately, not after the
// token's up-to-8h natural expiry, so every authenticated request re-checks
// the account against the DB and refreshes req.admin.role from the current
// row rather than trusting the (possibly stale) token claim.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let payload;
  try {
    payload = verifyAdminToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const rows = await executeQuery(
      `SELECT u.is_active, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
      [payload.id]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.admin = { ...payload, role: rows[0].role };
    next();
  } catch (err) {
    // Fail closed: if we can't confirm the account is still active, deny access.
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
