import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../db/queryHelper.js', () => ({ executeQuery: vi.fn(), executeTransaction: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ logToFile: vi.fn(), logFrontendToFile: vi.fn() }));

const { executeQuery } = await import('../db/queryHelper.js');
const { createUploadDownloadsRouter } = await import('../routes/uploadDownloads.js');
const { LocalFileStore } = await import('../storage/fileStore.js');
const { openZip } = await import('../upload/zipReader.js');
const { buildSessionZip } = await import('../../test/fixtures/buildSessionZip.js');

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

let root, store, app, db, audits;

// Commits a fixture ZIP and registers a session row for it.
async function addSession(over = {}) {
  const fx = buildSessionZip({ dir: root });
  await store.commit(fx.path, store.sessionKey(fx.sessionId));
  // Clips only: the master WAV is never a task's clipFile.
  const media = [...fx.parts.files.keys()].filter((k) => /^clips\/.*\.(wav|mp4)$/.test(k));
  const tasks = media.map((k) => (k.endsWith('.wav') ? { clipFile: k } : { videoFile: k }));
  const row = {
    id: db.rows.length + 1, session_id: fx.sessionId, storage_path: store.sessionKey(fx.sessionId),
    status: 'valid', can_edit: 1, bytes: fx.bytes, exam_summary: JSON.stringify({ tasks }),
    participant_fields: null, participant_edited_at: null, patient_code: 'p1', visit_number: '2',
    site_name: 'Paris', started_at: new Date('2026-10-13T08:00:00Z'), ended_at: new Date('2026-10-13T08:15:00Z'), received_at: new Date('2026-10-13T09:00:00Z'),
    qc: 'unreviewed', flags: JSON.stringify(['a', 'b']), protocol_name: 'snap', protocol_project: 'snapproj',
    ...over,
  };
  db.rows.push(row);
  return { fx, row, media };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-test-'));
  store = new LocalFileStore(root);
  db = { rows: [] };
  audits = [];
  executeQuery.mockReset();
  executeQuery.mockImplementation(async (sql, p = []) => {
    if (sql.includes('INSERT INTO audit_log')) { audits.push(p); return { insertId: 1 }; }
    if (sql.includes('LEFT JOIN protocols')) {
      return db.rows.filter((r) => p.includes(r.session_id)).map((r) => ({ session_id: r.session_id, protocol: 'Speech battery', project: 'Speech Study' }));
    }
    if (sql.includes('FROM upload_sessions us')) return db.rows.filter((r) => p.includes(r.session_id));
    throw new Error(`unexpected query ${sql}`);
  });
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.admin = { id: 7, role: 'master' }; next(); });
  app.use('/uploads', createUploadDownloadsRouter({ store }));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('GET /uploads/:id/zip', () => {
  it('404 unknown, 403 not editable, 409 validating', async () => {
    expect((await request(app).get(`/uploads/${'a'.repeat(32)}/zip`)).status).toBe(404);
    expect((await request(app).get('/uploads/nothex/zip')).status).toBe(404);
    const ro = await addSession({ can_edit: 0 });
    expect((await request(app).get(`/uploads/${ro.row.session_id}/zip`)).status).toBe(403);
    const v = await addSession({ status: 'validating' });
    expect((await request(app).get(`/uploads/${v.row.session_id}/zip`)).status).toBe(409);
    expect(audits).toHaveLength(0);
  });

  it('streams the stored bytes with headers and audits once', async () => {
    const { fx, row } = await addSession();
    const res = await request(app).get(`/uploads/${row.session_id}/zip`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${row.session_id}.zip"`);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(Number(res.headers['content-length'])).toBe(fx.bytes);
    expect(res.body.equals(store.resolve && fs.readFileSync(store.resolve(row.storage_path)))).toBe(true);
    await vi.waitFor(() => expect(audits).toHaveLength(1));
    expect(audits[0][1]).toBe('download');
  });

  it('edited participant gives original + sidecar in a stored zip', async () => {
    const { fx, row } = await addSession({
      participant_fields: JSON.stringify({ age: 30 }), participant_edited_at: new Date('2026-10-14T10:00:00Z'),
    });
    const res = await request(app).get(`/uploads/${row.session_id}/zip`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-length']).toBeUndefined();
    const out = path.join(root, 'outer.zip');
    fs.writeFileSync(out, res.body);
    const zip = await openZip(out);
    expect(zip.entries.map((e) => e.name).sort()).toEqual([`${row.session_id}.json`.replace('.json', '.participant.json'), `${row.session_id}.zip`].sort());
    expect(zip.entries.every((e) => e.compressedSize === e.uncompressedSize)).toBe(true);
    const chunks = [];
    for await (const c of await zip.openEntry(`${row.session_id}.zip`)) chunks.push(c);
    expect(Buffer.concat(chunks).equals(fs.readFileSync(store.resolve(row.storage_path)))).toBe(true);
    const side = [];
    for await (const c of await zip.openEntry(`${row.session_id}.participant.json`)) side.push(c);
    expect(JSON.parse(Buffer.concat(side).toString())).toEqual({ fields: { age: 30 }, editedAt: '2026-10-14T10:00:00.000Z' });
    zip.close();
    expect(fx.bytes).toBeGreaterThan(0);
  });
});

describe('GET /uploads/:id/clips/*', () => {
  async function original(fx, name) {
    const z = await openZip(store.resolve(store.sessionKey(fx.sessionId)));
    const chunks = [];
    for await (const c of await z.openEntry(name)) chunks.push(c);
    z.close();
    return Buffer.concat(chunks);
  }

  it('404/403 matrix', async () => {
    expect((await request(app).get(`/uploads/${'a'.repeat(32)}/clips/x.wav`)).status).toBe(404);
    const ro = await addSession({ can_edit: 0 });
    expect((await request(app).get(`/uploads/${ro.row.session_id}/clips/${ro.media[0].replace(/^clips\//, '')}`)).status).toBe(403);
  });

  it('serves the full entry and honours ranges', async () => {
    const { fx, row, media } = await addSession();
    const name = media.find((m) => m.endsWith('.wav'));
    const orig = await original(fx, name);
    const url = `/uploads/${row.session_id}/clips/${name.replace(/^clips\//, '')}`;

    const full = await request(app).get(url).buffer(true).parse(binary);
    expect(full.status).toBe(200);
    expect(full.headers['content-type']).toBe('audio/wav');
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.body.equals(orig)).toBe(true);

    const ab = await request(app).get(url).set('Range', 'bytes=10-99').buffer(true).parse(binary);
    expect(ab.status).toBe(206);
    expect(ab.headers['content-range']).toBe(`bytes 10-99/${orig.length}`);
    expect(ab.headers['content-length']).toBe('90');
    expect(ab.body.equals(orig.subarray(10, 100))).toBe(true);

    const a = await request(app).get(url).set('Range', 'bytes=100-').buffer(true).parse(binary);
    expect(a.status).toBe(206);
    expect(a.body.equals(orig.subarray(100))).toBe(true);

    const n = await request(app).get(url).set('Range', 'bytes=-20').buffer(true).parse(binary);
    expect(n.status).toBe(206);
    expect(n.headers['content-range']).toBe(`bytes ${orig.length - 20}-${orig.length - 1}/${orig.length}`);
    expect(n.body.equals(orig.subarray(orig.length - 20))).toBe(true);

    const bad = await request(app).get(url).set('Range', `bytes=${orig.length}-`);
    expect(bad.status).toBe(416);
    expect(bad.headers['content-range']).toBe(`bytes */${orig.length}`);
    expect(audits).toHaveLength(0);
  });

  it('serves video as video/mp4', async () => {
    const { row, media } = await addSession();
    const res = await request(app).get(`/uploads/${row.session_id}/clips/${media.find((m) => m.endsWith('.mp4')).replace(/^clips\//, '')}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('video/mp4');
  });

  it('404 for unlisted paths including traversal', async () => {
    const { row } = await addSession();
    for (const p of ['../manifest.json', 'ghost.wav', '../../x.wav', '%2e%2e/%2e%2e/x.wav', 'clips/x.wav', '%2e%2e%2fmanifest.json']) {
      const res = await request(app).get(`/uploads/${row.session_id}/clips/${p}`);
      expect(res.status, p).toBe(404);
    }
  });
});

describe('POST /uploads/download', () => {
  const post = (ids) => request(app).post('/uploads/download').send({ sessionIds: ids });

  it('rejects malformed input', async () => {
    const a = await addSession();
    expect((await post([])).status).toBe(400);
    expect((await post('x')).status).toBe(400);
    expect((await post(['nope'])).status).toBe(400);
    expect((await post([a.row.session_id, a.row.session_id])).status).toBe(400);
    const many = Array.from({ length: 201 }, (_, i) => i.toString(16).padStart(32, '0'));
    expect((await post(many)).status).toBe(400);
  });

  it('403 for a visible read-only id, 404 for an invisible one, 409 validating, 413 too large', async () => {
    const a = await addSession();
    const ro = await addSession({ can_edit: 0 });
    expect((await post([a.row.session_id, ro.row.session_id])).status).toBe(403);
    expect((await post([a.row.session_id, 'b'.repeat(32)])).status).toBe(404);
    const v = await addSession({ status: 'validating' });
    expect((await post([a.row.session_id, v.row.session_id])).status).toBe(409);
    const big1 = await addSession({ bytes: 3 * 1024 ** 3 });
    const big2 = await addSession({ bytes: 3 * 1024 ** 3 });
    const res = await post([big1.row.session_id, big2.row.session_id]);
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'too_large' });
    expect(audits).toHaveLength(0);
  });

  it('500 file_missing before streaming when a stored session file is gone, no audit', async () => {
    const a = await addSession();
    const b = await addSession();
    fs.rmSync(store.resolve(b.row.storage_path));
    const res = await post([a.row.session_id, b.row.session_id]);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'file_missing' });
    expect(audits).toHaveLength(0);
  });

  it('streams originals, sidecars and sessions.csv; one audit row', async () => {
    const a = await addSession({ patient_code: '=evil' });
    const b = await addSession({ participant_fields: '{"x":1}', participant_edited_at: new Date('2026-10-14T10:00:00Z') });
    const res = await post([a.row.session_id, b.row.session_id]).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="uploads-\d{8}-\d{4}\.zip"$/);
    const out = path.join(root, 'bundle.zip');
    fs.writeFileSync(out, res.body);
    const zip = await openZip(out);
    expect(zip.entries.map((e) => e.name).sort()).toEqual([
      `${a.row.session_id}.zip`, `${b.row.session_id}.participant.json`, `${b.row.session_id}.zip`, 'sessions.csv',
    ].sort());
    const chunks = [];
    for await (const c of await zip.openEntry('sessions.csv')) chunks.push(c);
    zip.close();
    const lines = Buffer.concat(chunks).toString().trim().split('\r\n');
    expect(lines[0]).toBe('sessionId,patient_code,visit_number,protocol,project,site,recordedAt,receivedAt,status,qc,flags');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(`${a.row.session_id},'=evil,2,Speech battery,Speech Study,Paris,2026-10-13T08:15:00.000Z,2026-10-13T09:00:00.000Z,valid,unreviewed,a;b`);
    await vi.waitFor(() => expect(audits).toHaveLength(1));
    expect(audits[0][1]).toBe('bundle');
    expect(JSON.parse(audits[0][3])).toEqual({ sessionIds: [a.row.session_id, b.row.session_id] });
  });
});
