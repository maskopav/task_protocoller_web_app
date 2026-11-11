// MCP personal access tokens against a real MariaDB (docs/mcp/01_spec.md
// sections 3 and 8, tests 1, 3 and 7): the token API, PAT auth on a probe route
// built exactly like the /mcp chain, and no secret in the logs.
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "crypto";
import { testDbAvailable, withRollback, closeTestDb } from "../helpers/testDb.js";

process.env.JWT_SECRET ||= "test-secret";

const hold = { q: null };
vi.mock("../../src/db/queryHelper.js", () => ({
  executeQuery: (sql, params = []) => hold.q(sql, params),
  executeTransaction: async (cb) => cb({ query: async (sql, params = []) => [await hold.q(sql, params)] }),
}));
vi.mock("../../src/utils/logger.js", () => ({ logToFile: vi.fn(), logFrontendToFile: vi.fn() }));

const dbUp = await testDbAvailable();
afterAll(closeTestDb);
const { requireAuth } = await import("../../src/middleware/authMiddleware.js");
const { requirePat } = await import("../../src/middleware/patAuth.js");
const { requireHttps } = await import("../../src/middleware/requireHttps.js");
const { createMcpAuthLimiter, createMcpCallLimiter } = await import("../../src/middleware/rateLimiter.js");
const { default: mcpTokensRouter } = await import("../../src/routes/mcpTokens.js");
const { default: usersRouter } = await import("../../src/routes/users.js");
const { signAdminToken } = await import("../../src/utils/jwt.js");
const { logToFile } = await import("../../src/utils/logger.js");

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

function buildApp({ authLimit = 1000, callLimit = 1000 } = {}) {
  const app = express();
  app.use(express.json());
  app.use("/account/mcp-tokens", requireAuth, mcpTokensRouter);
  app.use("/users", requireAuth, usersRouter);
  // The /mcp chain of docs/mcp/01_spec.md section 2, with a probe in place of the transport.
  app.post("/mcp", requireHttps, createMcpAuthLimiter({ limit: authLimit }), requirePat,
    createMcpCallLimiter({ limit: callLimit }), (req, res) => res.json({ admin: req.admin }));
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });

async function world(q) {
  const t = crypto.randomBytes(4).toString("hex");
  const roleId = async (name) => (await q(`SELECT id FROM roles WHERE name = ?`, [name]))[0].id;
  const user = async (n, roleName, flag) => {
    const email = `${n}-${t}@mcp.test`;
    const role_id = await roleId(roleName);
    const id = Number((await q(
      `INSERT INTO users (email, password_hash, role_id, can_use_mcp, must_change_password) VALUES (?, 'x', ?, ?, 0)`,
      [email, role_id, flag ? 1 : 0]
    )).insertId);
    const u = { id, email, role: roleName, role_id, token_version: 0 };
    return { ...u, jwt: signAdminToken(u) };
  };
  return {
    master: await user("m", "master", false),
    ann: await user("ann", "admin", true),
    bob: await user("bob", "admin", false),
  };
}

const auth = (jwt) => ({ Authorization: `Bearer ${jwt}` });
const create = (who, body = { name: "laptop" }) =>
  request(app).post("/account/mcp-tokens").set(auth(who.jwt)).send(body);
const probe = (token, a = app) => request(a).post("/mcp").set(token ? auth(token) : {}).send({});

describe.skipIf(!dbUp)("MCP token API", () => {
  it("creates a token once, stores only its hash, audits it", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const res = await create(w.ann, { name: "  laptop  ", expiresInDays: 30 });
      expect(res.status).toBe(201);
      expect(res.body.token).toMatch(/^tpm_[A-Za-z0-9_-]{43}$/);
      expect(res.body).toMatchObject({ name: "laptop", prefix: res.body.token.slice(0, 12), active: true, revokedAt: null });
      const days = (Date.parse(res.body.expiresAt) - Date.parse(res.body.createdAt)) / 86400000;
      expect(Math.round(days)).toBe(30);

      const [row] = await q(`SELECT * FROM personal_access_tokens WHERE id = ?`, [res.body.id]);
      expect(row.token_hash).toBe(sha(res.body.token));
      expect(Object.values(row).map(String)).not.toContain(res.body.token);
      const audit = await q(`SELECT action, details FROM audit_log WHERE user_id = ? AND action = 'mcp_token_create'`, [w.ann.id]);
      expect(audit).toHaveLength(1);

      const list = await request(app).get("/account/mcp-tokens").set(auth(w.ann.jwt));
      expect(list.status).toBe(200);
      expect(list.body.allowed).toBe(true);
      expect(list.body.tokens).toHaveLength(1);
      expect(JSON.stringify(list.body)).not.toContain(res.body.token);
      expect(JSON.stringify(list.body)).not.toContain(row.token_hash);
    }));

  it("needs the flag, except for a master", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      expect((await create(w.bob)).status).toBe(403);
      expect((await create(w.bob)).body.error).toBe("mcp_not_allowed");
      expect((await request(app).get("/account/mcp-tokens").set(auth(w.bob.jwt))).body).toEqual({ allowed: false, tokens: [] });
      expect((await create(w.master)).status).toBe(201);
    }));

  it("validates name and expiry, caps active tokens at 10", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      expect((await create(w.ann, { name: "" })).body.error).toBe("invalid_name");
      expect((await create(w.ann, { name: "x".repeat(65) })).body.error).toBe("invalid_name");
      expect((await create(w.ann, { name: "a", expiresInDays: 7 })).body.error).toBe("invalid_expiry");
      expect((await create(w.ann, { name: "a", expiresInDays: "90" })).body.error).toBe("invalid_expiry");
      for (let i = 0; i < 10; i++) expect((await create(w.ann, { name: `t${i}` })).status).toBe(201);
      const over = await create(w.ann, { name: "eleventh" });
      expect(over.status).toBe(409);
      expect(over.body.error).toBe("token_limit");
      // a revoked token frees a slot
      const [first] = await q(`SELECT id FROM personal_access_tokens WHERE user_id = ? LIMIT 1`, [w.ann.id]);
      expect((await request(app).delete(`/account/mcp-tokens/${first.id}`).set(auth(w.ann.jwt))).status).toBe(204);
      expect((await create(w.ann, { name: "eleventh" })).status).toBe(201);
    }));

  it("revokes own tokens only; master lists and revokes anyone's", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const a = (await create(w.ann)).body;
      const m = (await create(w.master)).body;
      // someone else's token looks missing
      expect((await request(app).delete(`/account/mcp-tokens/${m.id}`).set(auth(w.ann.jwt))).status).toBe(404);
      expect((await request(app).delete(`/account/mcp-tokens/999999999`).set(auth(w.ann.jwt))).status).toBe(404);
      expect((await request(app).delete(`/account/mcp-tokens/abc`).set(auth(w.ann.jwt))).status).toBe(404);

      // master side, behind requireRole("master")
      expect((await request(app).get(`/users/${w.ann.id}/mcp-tokens`).set(auth(w.ann.jwt))).status).toBe(403);
      const list = await request(app).get(`/users/${w.ann.id}/mcp-tokens`).set(auth(w.master.jwt));
      expect(list.status).toBe(200);
      expect(list.body.tokens.map((x) => x.id)).toEqual([a.id]);
      expect((await request(app).delete(`/users/${w.master.id}/mcp-tokens/${a.id}`).set(auth(w.master.jwt))).status).toBe(404);
      expect((await request(app).delete(`/users/${w.ann.id}/mcp-tokens/${a.id}`).set(auth(w.master.jwt))).status).toBe(204);
      // idempotent, audited once
      expect((await request(app).delete(`/users/${w.ann.id}/mcp-tokens/${a.id}`).set(auth(w.master.jwt))).status).toBe(204);
      const audit = await q(`SELECT user_id FROM audit_log WHERE action = 'mcp_token_revoke' AND JSON_VALUE(details, '$.tokenId') = ?`, [a.id]);
      expect(audit.map((r) => Number(r.user_id))).toEqual([w.master.id]);
      expect((await probe(a.token)).status).toBe(401);
    }));

  it("lets a user flag through PATCH /users/:id", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const res = await request(app).patch(`/users/${w.bob.id}`).set(auth(w.master.jwt)).send({ can_use_mcp: true });
      expect(res.status).toBe(200);
      const got = await request(app).get(`/users/${w.bob.id}`).set(auth(w.master.jwt));
      expect(got.body.can_use_mcp).toBe(true);
      expect((await create(w.bob)).status).toBe(201);
    }));
});

describe.skipIf(!dbUp)("PAT auth on /mcp", () => {
  it("accepts a valid token and builds req.admin from the DB", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const tok = (await create(w.ann)).body;
      const res = await probe(tok.token);
      expect(res.status).toBe(200);
      expect(res.body.admin).toEqual({ id: w.ann.id, email: w.ann.email, role: "admin", role_id: w.ann.role_id, tv: 0, via: "mcp", tokenId: tok.id });
      const [row] = await q(`SELECT last_used_at FROM personal_access_tokens WHERE id = ?`, [tok.id]);
      expect(row.last_used_at).not.toBeNull();
      // master without the flag
      const mt = (await create(w.master)).body;
      expect((await probe(mt.token)).body.admin.role).toBe("master");
    }));

  it("refuses every invalid credential with 401 and WWW-Authenticate", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const fresh = async () => (await create(w.ann)).body;

      const none = await probe(null);
      expect(none.status).toBe(401);
      expect(none.headers["www-authenticate"]).toMatch(/^Bearer/);
      expect((await request(app).post("/mcp").set({ Authorization: "Basic abc" }).send({})).status).toBe(401);
      expect((await probe("tpm_short")).status).toBe(401);
      expect((await probe("tpm_" + crypto.randomBytes(32).toString("base64url"))).status).toBe(401);
      // a JWT session is not a token, and a token is not a session
      expect((await probe(w.ann.jwt)).status).toBe(401);
      const t0 = await fresh();
      expect((await request(app).get("/account/mcp-tokens").set(auth(t0.token))).status).toBe(401);

      const revoked = await fresh();
      await q(`UPDATE personal_access_tokens SET revoked_at = UTC_TIMESTAMP() WHERE id = ?`, [revoked.id]);
      expect((await probe(revoked.token)).status).toBe(401);

      const expired = await fresh();
      await q(`UPDATE personal_access_tokens SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE id = ?`, [expired.id]);
      expect((await probe(expired.token)).status).toBe(401);

      const t1 = await fresh();
      expect((await probe(t1.token)).status).toBe(200);
      await q(`UPDATE users SET can_use_mcp = 0 WHERE id = ?`, [w.ann.id]);
      expect((await probe(t1.token)).status).toBe(401);
      await q(`UPDATE users SET can_use_mcp = 1, is_active = 0 WHERE id = ?`, [w.ann.id]);
      expect((await probe(t1.token)).status).toBe(401);
      await q(`UPDATE users SET is_active = 1 WHERE id = ?`, [w.ann.id]);
      expect((await probe(t1.token)).status).toBe(200);
      // a password change (what reset-password and setup-profile do)
      await q(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`, [w.ann.id]);
      expect((await probe(t1.token)).status).toBe(401);
    }));

  it("throttles failed attempts per client and valid calls per token", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      const a = (await create(w.ann, { name: "a" })).body;
      const b = (await create(w.ann, { name: "b" })).body;

      const guarded = buildApp({ authLimit: 2 });
      const bad = "tpm_" + crypto.randomBytes(32).toString("base64url");
      expect((await probe(bad, guarded)).status).toBe(401);
      expect((await probe(bad, guarded)).status).toBe(401);
      expect((await probe(bad, guarded)).status).toBe(429);

      const limited = buildApp({ callLimit: 2 });
      expect((await probe(a.token, limited)).status).toBe(200);
      expect((await probe(a.token, limited)).status).toBe(200);
      expect((await probe(a.token, limited)).status).toBe(429);
      expect((await probe(b.token, limited)).status).toBe(200);
    }));

  it("never writes a token or its hash to the log", () =>
    withRollback(async (q) => {
      hold.q = q;
      const w = await world(q);
      logToFile.mockClear();
      const tok = (await create(w.ann)).body;
      await probe(tok.token);
      await probe(tok.token.slice(0, -1) + "A");
      // force the error path of create
      const real = hold.q;
      hold.q = async (sql, p) => { if (/INSERT INTO personal_access_tokens/.test(sql)) throw Object.assign(new Error(`boom ${tok.token}`), { code: "ER_X" }); return real(sql, p); };
      expect((await create(w.ann)).status).toBe(500);
      hold.q = real;
      const logged = JSON.stringify(logToFile.mock.calls);
      expect(logged).not.toContain(tok.token);
      expect(logged).not.toContain(sha(tok.token));
      expect(logged).toContain("ER_X");
    }));
});
