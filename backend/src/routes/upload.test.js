import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));
vi.mock('../utils/logger.js', () => ({
  logToFile: vi.fn(),
  logFrontendToFile: vi.fn(),
}));

const { executeQuery, executeTransaction } = await import('../db/queryHelper.js');
const { logToFile } = await import('../utils/logger.js');
const { createUploadRouter } = await import('./upload.js');
const { LocalFileStore } = await import('../storage/fileStore.js');
const { ensureDataPath } = await import('../config/uploads.js');
const { buildSessionZip, PATIENT_CODE } = await import('../../test/fixtures/buildSessionZip.js');

const SITE_TOKEN = 'paris000paris000paris000paris000';
const OTHER_TOKEN = 'nobody00nobody00nobody00nobody00';

// In-memory stand-in for the four tables ingest touches. Dispatching on SQL
// substrings keeps the tests independent of query order and count.
let db;
const freshDb = () => ({
  sites: [{ id: 1, access_token: SITE_TOKEN, is_active: 1 }, { id: 2, access_token: 'inactive0inactive0', is_active: 0 }],
  devices: [],
  sessions: [],
  attempts: [],
  // Hook for the race test: runs instead of the session INSERT once.
  onSessionInsert: null,
});

async function dispatch(sql, p = []) {
  if (sql.includes('INSERT INTO upload_attempts')) {
    const [session_id, installation_id, at, http_code, outcome, bytes, sha_declared, sha_computed] = p;
    db.attempts.push({ session_id, installation_id, at, http_code, outcome, bytes, sha_declared, sha_computed });
    return { insertId: db.attempts.length };
  }
  if (sql.includes('FROM upload_sessions WHERE session_id')) return db.sessions.filter((s) => s.session_id === p[0]);
  if (sql.includes('JSON_ARRAY_APPEND(flags')) {
    const s = db.sessions.find((r) => r.id === p[0]);
    const flags = JSON.parse(s.flags);
    if (!flags.includes('duplicate')) s.flags = JSON.stringify([...flags, 'duplicate']);
    return { affectedRows: 1 };
  }
  if (sql.includes('FROM sites WHERE access_token')) {
    return db.sites.filter((s) => s.access_token === p[0] && s.is_active === 1).map(({ id }) => ({ id }));
  }
  if (sql.includes('INSERT INTO devices')) {
    const withSite = sql.includes('(installation_id, site_id');
    const [installation_id, ...rest] = p;
    const [site_id, app_version, last_seen_at] = withSite ? rest : [undefined, ...rest];
    let d = db.devices.find((x) => x.installation_id === installation_id);
    if (!d) {
      d = { id: db.devices.length + 1, installation_id, site_id: null, app_version: null };
      db.devices.push(d);
    }
    if (withSite) d.site_id = d.site_id ?? site_id; // COALESCE(site_id, VALUES(site_id))
    d.app_version = app_version ?? d.app_version;
    d.last_seen_at = last_seen_at;
    return { affectedRows: 1 };
  }
  if (sql.includes('FROM devices WHERE installation_id')) {
    return db.devices.filter((d) => d.installation_id === p[0]).map(({ id, site_id }) => ({ id, site_id }));
  }
  if (sql.includes('FROM upload_sessions WHERE site_id IS NULL')) {
    const q = db.sessions.filter((s) => s.site_id == null);
    return [{ total: q.reduce((n, s) => n + Number(s.bytes), 0), mine: q.filter((s) => s.device_id === p[0]).length }];
  }
  if (sql.includes('INSERT INTO upload_sessions')) {
    if (db.onSessionInsert) {
      const hook = db.onSessionInsert;
      db.onSessionInsert = null;
      hook();
    }
    const [session_id, device_id, site_id, app_version, received_at, bytes, zip_sha256, storage_path, status, invalid_reason] = p;
    if (db.sessions.some((s) => s.session_id === session_id)) {
      throw Object.assign(new Error("Duplicate entry for key 'session_id'"), { code: 'ER_DUP_ENTRY' });
    }
    const row = { id: db.sessions.length + 100, session_id, device_id, site_id, app_version, received_at, bytes,
      zip_sha256, storage_path, status, invalid_reason, flags: '[]' };
    db.sessions.push(row);
    return { insertId: row.id };
  }
  throw new Error(`Unexpected query: ${sql}`);
}

let dataPath;
let store;
let queue;
let app;
let fixtureDir;

const tmpFiles = () => fs.readdirSync(path.join(dataPath, 'tmp'));
const makeApp = (maxBytes = 50 * 1024 * 1024) => {
  const a = express();
  a.use('/upload', createUploadRouter({ store, queue, maxBytes }));
  return a;
};

// Text parts first, then the zip, the way KtorUploadApi sends them. The
// attachment keeps the app's filename, which carries the patient code.
const post = (fx, fields = {}, a = app) => {
  const req = request(a).post('/upload');
  const all = { installationId: fx.installationId, sessionId: fx.sessionId, zipSha256: fx.sha256, siteToken: SITE_TOKEN,
    appVersion: '1.4.0', ...fields };
  for (const [k, v] of Object.entries(all)) if (v !== undefined) req.field(k, v);
  return req.attach('zip', fx.path);
};

beforeEach(async () => {
  db = freshDb();
  executeQuery.mockReset();
  executeTransaction.mockReset();
  executeQuery.mockImplementation(dispatch);
  // Rolls the fake tables back on a throw, like a real transaction.
  // Rows marked `external` were committed by another request and survive it.
  executeTransaction.mockImplementation(async (cb) => {
    const before = structuredClone({ devices: db.devices, sessions: db.sessions, attempts: db.attempts });
    try {
      return await cb({ query: async (sql, p) => [await dispatch(sql, p)] });
    } catch (err) {
      db.devices = before.devices;
      db.attempts = before.attempts;
      db.sessions = [...before.sessions, ...db.sessions.filter((s) => s.external)];
      throw err;
    }
  });
  dataPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'upload-route-'));
  ensureDataPath(dataPath);
  fixtureDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'upload-fixture-'));
  store = new LocalFileStore(dataPath);
  queue = { enqueue: vi.fn() };
  app = makeApp();
});

afterEach(async () => {
  await fsp.rm(dataPath, { recursive: true, force: true });
  await fsp.rm(fixtureDir, { recursive: true, force: true });
});

const fixture = (opts = {}) => buildSessionZip({ dir: fixtureDir, ...opts });

describe('POST /upload — accepted', () => {
  it('stores the ZIP under its session key, records the session and attempt, and enqueues validation', async () => {
    const fx = fixture();
    const res = await post(fx);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok', sessionId: fx.sessionId, bytes: fx.bytes, sha256: fx.sha256, receivedAt: expect.any(String),
    });
    expect(new Date(res.body.receivedAt).toISOString()).toBe(res.body.receivedAt);

    const key = store.sessionKey(fx.sessionId);
    expect(fs.readFileSync(store.resolve(key))).toEqual(fs.readFileSync(fx.path));
    expect(tmpFiles()).toEqual([]);

    expect(db.sessions).toHaveLength(1);
    expect(db.sessions[0]).toMatchObject({
      session_id: fx.sessionId, site_id: 1, status: 'validating', invalid_reason: null,
      storage_path: key, bytes: fx.bytes, zip_sha256: fx.sha256, app_version: '1.4.0',
    });
    expect(db.devices).toEqual([expect.objectContaining({ installation_id: fx.installationId, site_id: 1, app_version: '1.4.0' })]);
    expect(db.attempts).toEqual([expect.objectContaining({ session_id: fx.sessionId, http_code: 200, outcome: 'accepted',
      sha_declared: fx.sha256, sha_computed: fx.sha256, bytes: fx.bytes })]);
    expect(queue.enqueue).toHaveBeenCalledWith(db.sessions[0].id);
  });

  it('uses the known device\'s site when no token is sent', async () => {
    const fx = fixture();
    db.devices.push({ id: 7, installation_id: fx.installationId, site_id: 1, app_version: null });
    const res = await post(fx, { siteToken: undefined });
    expect(res.status).toBe(200);
    expect(db.sessions[0]).toMatchObject({ device_id: 7, site_id: 1, status: 'validating' });
  });

  it('never moves a device of another site: a token of another clinic quarantines the upload', async () => {
    const fx = fixture();
    db.sites.push({ id: 3, access_token: OTHER_TOKEN, is_active: 1 });
    db.devices.push({ id: 7, installation_id: fx.installationId, site_id: 1, app_version: null });
    const res = await post(fx, { siteToken: OTHER_TOKEN });
    expect(res.status).toBe(404);
    expect(db.devices[0].site_id).toBe(1);
    expect(db.sessions[0]).toMatchObject({ site_id: null, invalid_reason: 'unknown_device' });
  });

  it('a token adopts a device that has no site yet', async () => {
    const fx = fixture();
    db.devices.push({ id: 7, installation_id: fx.installationId, site_id: null, app_version: null });
    const res = await post(fx);
    expect(res.status).toBe(200);
    expect(db.devices[0].site_id).toBe(1);
  });
});

describe('POST /upload — storage limits', () => {
  const limited = (limits) => {
    const a = express();
    a.use('/upload', createUploadRouter({ store, queue, maxBytes: 50 * 1024 * 1024,
      limits: { quarantineMaxBytes: 1e12, quarantineMaxPerDevice: 1e6, minFreeBytes: 0, ...limits } }));
    return a;
  };

  it('503 quarantine_full once a device has its quota of quarantined sessions, nothing stored', async () => {
    const a = limited({ quarantineMaxPerDevice: 1 });
    const first = fixture();
    expect((await post(first, { siteToken: undefined }, a)).status).toBe(404);
    const second = fixture({ installationId: first.installationId });
    const res = await post(second, { siteToken: undefined }, a);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'quarantine_full' });
    expect(db.sessions).toHaveLength(1);
    expect(fs.existsSync(store.resolve(store.sessionKey(second.sessionId)))).toBe(false);
    expect(db.attempts.at(-1)).toMatchObject({ http_code: 503, outcome: 'quarantine_full' });
    expect(tmpFiles()).toEqual([]);
  });

  it('503 once quarantine as a whole would exceed its byte budget', async () => {
    const fx = fixture();
    const res = await post(fx, { siteToken: undefined }, limited({ quarantineMaxBytes: fx.bytes - 1 }));
    expect(res.status).toBe(503);
    expect(db.sessions).toHaveLength(0);
  });

  it('the quarantine limits never apply to an upload with a valid token', async () => {
    const res = await post(fixture(), {}, limited({ quarantineMaxBytes: 0, quarantineMaxPerDevice: 0 }));
    expect(res.status).toBe(200);
  });

  it('507 insufficient_storage below the free-space floor, nothing stored', async () => {
    const fx = fixture();
    const res = await post(fx, {}, limited({ minFreeBytes: Number.MAX_SAFE_INTEGER }));
    expect(res.status).toBe(507);
    expect(db.sessions).toHaveLength(0);
    expect(db.attempts.at(-1)).toMatchObject({ http_code: 507, outcome: 'disk_full' });
    expect(tmpFiles()).toEqual([]);
  });
});

describe('POST /upload — rejected after receipt', () => {
  it('400 checksum_mismatch when the bytes do not hash to zipSha256', async () => {
    const fx = fixture();
    const res = await post(fx, { zipSha256: 'f'.repeat(64) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'checksum_mismatch' });
    expect(db.sessions).toEqual([]);
    expect(db.attempts).toEqual([expect.objectContaining({ http_code: 400, outcome: 'checksum',
      sha_declared: 'f'.repeat(64), sha_computed: fx.sha256 })]);
    expect(tmpFiles()).toEqual([]);
    expect(fs.existsSync(path.join(dataPath, 'sessions', fx.sessionId.slice(0, 2)))).toBe(false);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('a same-hash re-send gets the original receipt and flags the session duplicate (once)', async () => {
    const fx = fixture();
    const first = await post(fx);
    expect(first.status).toBe(200);

    const second = await post(fx);
    const third = await post(fx);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(third.body).toEqual(first.body);
    expect(JSON.parse(db.sessions[0].flags)).toEqual(['duplicate']);
    expect(db.attempts.map((a) => a.outcome)).toEqual(['accepted', 'resent', 'resent']);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(tmpFiles()).toEqual([]);
  });

  it('409 session_exists when the same sessionId arrives with different bytes, keeping the stored file', async () => {
    const fx = fixture();
    await post(fx);
    const original = fs.readFileSync(fx.path);
    const other = fixture({ sessionId: fx.sessionId, variant: 'edited' });
    expect(other.sha256).not.toBe(fx.sha256);

    const res = await post(other);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'session_exists' });
    expect(fs.readFileSync(store.resolve(store.sessionKey(fx.sessionId)))).toEqual(original);
    expect(db.attempts.at(-1)).toMatchObject({ http_code: 409, outcome: 'conflict', sha_computed: other.sha256 });
    expect(tmpFiles()).toEqual([]);
  });

  it.each([
    ['an unknown device without a token', {}],
    ['an invalid token', { siteToken: OTHER_TOKEN }],
    ['an inactive site\'s token', { siteToken: 'inactive0inactive0' }],
  ])('quarantines %s: stored, site NULL, invalid/unknown_device, 404', async (_label, fields) => {
    const fx = fixture();
    const res = await post(fx, { siteToken: undefined, ...fields });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'device_not_registered', quarantined: true });
    expect(fs.existsSync(store.resolve(store.sessionKey(fx.sessionId)))).toBe(true);
    expect(db.sessions[0]).toMatchObject({ site_id: null, status: 'invalid', invalid_reason: 'unknown_device' });
    expect(db.devices[0]).toMatchObject({ installation_id: fx.installationId, site_id: null });
    expect(db.attempts).toEqual([expect.objectContaining({ http_code: 404, outcome: 'quarantined' })]);
    expect(queue.enqueue).toHaveBeenCalledWith(db.sessions[0].id);
    expect(tmpFiles()).toEqual([]);
  });

  it('a same-hash re-send of a quarantined session is still answered 404', async () => {
    const fx = fixture();
    await post(fx, { siteToken: undefined });
    const again = await post(fx, { siteToken: undefined });
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: 'device_not_registered', quarantined: true });
    expect(db.attempts.map((a) => [a.http_code, a.outcome])).toEqual([[404, 'quarantined'], [404, 'quarantined']]);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('replaces an orphan file left by a crash before the DB commit', async () => {
    const fx = fixture();
    const key = store.sessionKey(fx.sessionId);
    fs.mkdirSync(path.dirname(store.resolve(key)), { recursive: true });
    fs.writeFileSync(store.resolve(key), 'half of an earlier attempt');

    const res = await post(fx);
    expect(res.status).toBe(200);
    expect(fs.readFileSync(store.resolve(key))).toEqual(fs.readFileSync(fx.path));
    expect(tmpFiles()).toEqual([]);
  });

  it('an invalid token quarantines even a device that already has a site', async () => {
    const fx = fixture();
    db.devices.push({ id: 7, installation_id: fx.installationId, site_id: 1, app_version: null });
    const res = await post(fx, { siteToken: OTHER_TOKEN });
    expect(res.status).toBe(404);
    expect(db.sessions[0].site_id).toBeNull();
    expect(db.devices[0].site_id).toBe(1);
  });

  it('a concurrent insert of the same sessionId falls back to the idempotency step', async () => {
    const fx = fixture();
    // The other request commits between our step 3 and our INSERT.
    db.onSessionInsert = () => db.sessions.push({
      id: 55, external: true, session_id: fx.sessionId, bytes: fx.bytes, zip_sha256: fx.sha256,
      received_at: '2026-10-13 08:01:02.123', flags: '[]', site_id: 1, status: 'validating',
    });
    const res = await post(fx);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', sessionId: fx.sessionId, bytes: fx.bytes, sha256: fx.sha256,
      receivedAt: '2026-10-13T08:01:02.123Z' });
    expect(db.sessions).toHaveLength(1);
    expect(JSON.parse(db.sessions[0].flags)).toEqual(['duplicate']);
    expect(db.attempts.map((a) => a.outcome)).toEqual(['resent']);
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(tmpFiles()).toEqual([]);
  });

  it('500 internal on an unexpected failure, without echoing it, and the temp file is gone', async () => {
    const fx = fixture();
    executeQuery.mockImplementation(async (sql, p) => {
      if (sql.includes('FROM upload_sessions WHERE session_id')) {
        throw new Error(`driver blew up near '${PATIENT_CODE}_${fx.sessionId}.zip'`);
      }
      return dispatch(sql, p);
    });
    const res = await post(fx);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal' });
    expect(logToFile).toHaveBeenCalledWith('ERROR', expect.any(String), expect.objectContaining({ sessionId: fx.sessionId }));
    expect(db.attempts.at(-1)).toMatchObject({ http_code: 500, outcome: 'error' });
    expect(tmpFiles()).toEqual([]);
  });
});

describe('POST /upload — malformed requests (400, nothing kept)', () => {
  const expect400 = async (res, error = 'bad_request') => {
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(tmpFiles()).toEqual([]);
    expect(db.sessions).toEqual([]);
    expect(queue.enqueue).not.toHaveBeenCalled();
  };

  it('too_large when the ZIP exceeds maxBytes, and records the attempt', async () => {
    const fx = fixture();
    const res = await post(fx, {}, makeApp(fx.bytes - 1));
    await expect400(res, 'too_large');
    expect(db.attempts).toEqual([expect.objectContaining({ session_id: fx.sessionId, http_code: 400, outcome: 'error' })]);
  });

  it('accepts a ZIP of exactly maxBytes', async () => {
    const fx = fixture();
    const res = await post(fx, {}, makeApp(fx.bytes));
    expect(res.status).toBe(200);
  });

  it('rejects an unknown text part', async () => {
    await expect400(await post(fixture(), { comment: 'hello' }));
  });

  it('rejects an unknown file part', async () => {
    const fx = fixture();
    const res = await post(fx).attach('extra', fx.path);
    await expect400(res);
  });

  it('rejects a duplicated text part', async () => {
    const fx = fixture();
    const req = request(app).post('/upload')
      .field('installationId', fx.installationId).field('sessionId', fx.sessionId).field('sessionId', fx.sessionId)
      .field('zipSha256', fx.sha256).attach('zip', fx.path);
    await expect400(await req);
  });

  it('rejects a second zip part', async () => {
    const fx = fixture();
    await expect400(await post(fx).attach('zip', fx.path));
  });

  it.each(['installationId', 'sessionId', 'zipSha256'])('rejects a missing %s', async (name) => {
    await expect400(await post(fixture(), { [name]: undefined }));
  });

  it('rejects a request without the zip part', async () => {
    const fx = fixture();
    const res = await request(app).post('/upload')
      .field('installationId', fx.installationId).field('sessionId', fx.sessionId).field('zipSha256', fx.sha256);
    await expect400(res);
  });

  it('rejects the zip before the text parts', async () => {
    const fx = fixture();
    const res = await request(app).post('/upload').attach('zip', fx.path)
      .field('installationId', fx.installationId).field('sessionId', fx.sessionId).field('zipSha256', fx.sha256);
    await expect400(res);
  });

  it.each([
    ['installationId', 'has spaces'],
    ['installationId', 'x'.repeat(65)],
    ['sessionId', 'A'.repeat(32)],
    ['sessionId', 'a'.repeat(31)],
    ['zipSha256', 'A'.repeat(64)],
    ['siteToken', 'short'],
    ['siteToken', 'bad token with spaces!'],
    ['appVersion', 'x'.repeat(33)],
  ])('rejects a malformed %s (%s)', async (name, value) => {
    await expect400(await post(fixture(), { [name]: value }));
    // Format checks run before the DB: nothing was even looked up.
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('rejects a body that is not multipart', async () => {
    const res = await request(app).post('/upload').send({ sessionId: 'x' });
    await expect400(res);
  });
});

// Self-contained: sends an upload with the app's real filename
// (<patientCode>_<id>.zip, patient code inside the ZIP) and makes the 500 path
// feed both into an error message, then checks nothing reached the log.
describe('logging', () => {
  it('never logs the client filename, the patient code or the site token', async () => {
    logToFile.mockClear();
    const ok = fixture();
    expect((await post(ok)).status).toBe(200);
    const fx = fixture();
    executeQuery.mockImplementation(async (sql, p) => {
      if (sql.includes('FROM upload_sessions WHERE session_id')) {
        throw new Error(`driver blew up near '${PATIENT_CODE}_${fx.sessionId}.zip'`);
      }
      return dispatch(sql, p);
    });
    expect((await post(fx)).status).toBe(500);
    expect(logToFile).toHaveBeenCalled();
    const logged = JSON.stringify(logToFile.mock.calls);
    expect(logged).not.toContain(PATIENT_CODE);
    expect(logged).not.toMatch(/\.zip/);
    expect(logged).not.toContain(SITE_TOKEN);
  });
});
