// src/controllers/mcpTokenController.js
//
// Personal access tokens for MCP (docs/mcp/01_spec.md section 3.3).
//   GET    /account/mcp-tokens          own tokens + whether you may create one
//   POST   /account/mcp-tokens          create; the token is returned once
//   DELETE /account/mcp-tokens/:id      revoke one of your own
//   GET    /users/:id/mcp-tokens        master: someone's tokens
//   DELETE /users/:id/mcp-tokens/:tid   master: revoke one
// These routes sit behind requireAuth (a JWT session), never behind a token,
// so a leaked token cannot mint more tokens.
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { toIso } from "../utils/dateIso.js";
import { generatePat } from "../utils/pat.js";
import { writeAudit } from "../upload/sessionAccess.js";
import { logToFile } from "../utils/logger.js";

export const EXPIRY_DAYS = [30, 90, 365];
export const DEFAULT_EXPIRY_DAYS = 90;
export const MAX_ACTIVE_TOKENS = 10;
const NAME_MAX = 64;

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const TOKEN_SQL = `SELECT id, user_id, name, token_prefix, created_at, last_used_at, expires_at, revoked_at,
                          (revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()) AS active
                   FROM personal_access_tokens`;

/** Never the hash, never the token. */
export const tokenRow = (r) => ({
  id: Number(r.id),
  name: r.name,
  prefix: r.token_prefix,
  createdAt: toIso(r.created_at),
  lastUsedAt: toIso(r.last_used_at),
  expiresAt: toIso(r.expires_at),
  revokedAt: toIso(r.revoked_at),
  active: Number(r.active) === 1,
});

const listFor = async (userId) =>
  (await executeQuery(`${TOKEN_SQL} WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`, [userId])).map(tokenRow);

/** Masters always; anyone else needs the master-granted flag (D10). */
export async function canUseMcp(admin) {
  if (admin?.role === "master") return true;
  const rows = await executeQuery(`SELECT can_use_mcp FROM users WHERE id = ? AND is_active = 1`, [admin?.id ?? null]);
  return rows.length > 0 && Number(rows[0].can_use_mcp) === 1;
}

function fail(res, err, what, extra = {}) {
  logToFile("ERROR", `MCP token ${what} failed`, { ...extra, code: err?.code ?? err?.name ?? "Error" });
  res.status(500).json({ error: "internal" });
}

// GET /account/mcp-tokens -> { allowed, tokens }
export const listOwnTokens = async (req, res) => {
  try {
    const [allowed, tokens] = await Promise.all([canUseMcp(req.admin), listFor(req.admin.id)]);
    res.json({ allowed, tokens });
  } catch (err) {
    fail(res, err, "list", { userId: req.admin?.id });
  }
};

// POST /account/mcp-tokens { name, expiresInDays }
export const createOwnToken = async (req, res) => {
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > NAME_MAX) return res.status(400).json({ error: "invalid_name" });
  const days = body.expiresInDays === undefined ? DEFAULT_EXPIRY_DAYS : body.expiresInDays;
  if (!EXPIRY_DAYS.includes(days)) return res.status(400).json({ error: "invalid_expiry" });

  try {
    if (!(await canUseMcp(req.admin))) return res.status(403).json({ error: "mcp_not_allowed" });
    const userId = req.admin.id;
    const { token, hash, prefix } = generatePat();

    const id = await executeTransaction(async (conn) => {
      const q = async (sql, p) => (await conn.query(sql, p))[0];
      // Locks the user row, so two parallel creates cannot both pass the limit.
      const users = await q(`SELECT token_version FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (users.length === 0) return null;
      const [{ n }] = await q(
        `SELECT COUNT(*) AS n FROM personal_access_tokens
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
        [userId]
      );
      if (Number(n) >= MAX_ACTIVE_TOKENS) return "limit";
      const result = await q(
        `INSERT INTO personal_access_tokens (user_id, name, token_prefix, token_hash, token_version, expires_at)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? DAY)`,
        [userId, name, prefix, hash, Number(users[0].token_version ?? 0), days]
      );
      return Number(result.insertId);
    });
    if (id === null) return res.status(401).json({ error: "Unauthorized" });
    if (id === "limit") return res.status(409).json({ error: "token_limit", max: MAX_ACTIVE_TOKENS });

    await writeAudit(userId, "mcp_token_create", null, { tokenId: id, ownerId: userId });
    const rows = await executeQuery(`${TOKEN_SQL} WHERE id = ?`, [id]);
    res.status(201).json({ ...tokenRow(rows[0]), token });
  } catch (err) {
    fail(res, err, "create", { userId: req.admin?.id });
  }
};

async function revoke(res, actorId, ownerId, tokenId) {
  if (!ownerId || !tokenId) return res.status(404).json({ error: "not_found" });
  const rows = await executeQuery(`SELECT id, revoked_at FROM personal_access_tokens WHERE id = ? AND user_id = ?`, [tokenId, ownerId]);
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  if (rows[0].revoked_at == null) {
    await executeQuery(`UPDATE personal_access_tokens SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND revoked_at IS NULL`, [tokenId]);
    await writeAudit(actorId, "mcp_token_revoke", null, { tokenId, ownerId });
  }
  return res.status(204).end();
}

// DELETE /account/mcp-tokens/:id
export const revokeOwnToken = async (req, res) => {
  try {
    await revoke(res, req.admin.id, req.admin.id, parseId(req.params.id));
  } catch (err) {
    fail(res, err, "revoke", { userId: req.admin?.id });
  }
};

// GET /users/:id/mcp-tokens (master; the users router enforces the role)
export const listUserTokens = async (req, res) => {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(404).json({ error: "not_found" });
  try {
    res.json({ tokens: await listFor(userId) });
  } catch (err) {
    fail(res, err, "list", { userId });
  }
};

// DELETE /users/:id/mcp-tokens/:tokenId (master)
export const revokeUserToken = async (req, res) => {
  try {
    await revoke(res, req.admin.id, parseId(req.params.id), parseId(req.params.tokenId));
  } catch (err) {
    fail(res, err, "revoke", { userId: req.params?.id });
  }
};
