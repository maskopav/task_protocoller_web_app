import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

const { executeQuery, executeTransaction } = await import('../db/queryHelper.js');
const {
  deviceCheckin,
  deviceHealth,
  listDevices,
  renameDevice,
  makeAssignDeviceSite,
} = await import('./deviceController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};
const master = { id: 1, role: 'master' };
const admin = { id: 2, role: 'admin' };
const req = (a, extra = {}) => ({ admin: a, query: {}, params: {}, body: {}, ...extra });

const NOW = Date.parse('2026-10-22T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 24 * 3600e3).toISOString();

describe('deviceHealth', () => {
  const base = { neverUploaded: false, lastUpload: daysAgo(1), lastSeenAt: daysAgo(1), pending: 0, failed: 0 };
  it('off: never uploaded', () => {
    expect(deviceHealth({ ...base, neverUploaded: true }, NOW)).toMatchObject({ key: 'off', label: 'No uploads yet' });
  });
  it('off: nothing in the caller scope', () => {
    expect(deviceHealth({ ...base, lastUpload: null }, NOW)).toMatchObject({ key: 'off', label: 'No uploads in your scope' });
  });
  it('bad: silent for more than 7 days, even with a backlog', () => {
    expect(deviceHealth({ ...base, lastSeenAt: daysAgo(8), pending: 3 }, NOW).key).toBe('bad');
    expect(deviceHealth({ ...base, lastSeenAt: null }, NOW).key).toBe('bad');
  });
  it('warn: pending or failed backlog', () => {
    expect(deviceHealth({ ...base, pending: 1 }, NOW).key).toBe('warn');
    expect(deviceHealth({ ...base, failed: 1 }, NOW).key).toBe('warn');
  });
  it('ok otherwise, 7 days exactly still counts as seen', () => {
    expect(deviceHealth(base, NOW)).toMatchObject({ key: 'ok', label: 'Healthy' });
    expect(deviceHealth({ ...base, lastSeenAt: daysAgo(7) }, NOW).key).toBe('ok');
  });
});

describe('deviceCheckin', () => {
  const body = { siteToken: 'tok', installationId: 'dev-1', appVersion: '1.0', pending: 2, failed: 1 };
  beforeEach(() => executeQuery.mockReset());

  it('upserts the device for an active token', async () => {
    executeQuery.mockImplementation(async (sql = '') => (sql.includes('FROM sites') ? [{ id: 5 }] : []));
    const res = makeRes();
    await deviceCheckin({ body }, res);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    const upsert = executeQuery.mock.calls.find(([sql]) => sql.includes('INTO devices'));
    expect(upsert[1]).toEqual(['dev-1', 5, '1.0', 2, 1]);
  });

  it('409 for a device that belongs to another site, and writes nothing', async () => {
    executeQuery.mockImplementation(async (sql = '') =>
      sql.includes('FROM sites') ? [{ id: 5 }] : sql.includes('FROM devices WHERE installation_id') ? [{ site_id: 9 }] : []);
    const res = makeRes();
    await deviceCheckin({ body }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('INTO devices'))).toBe(false);
  });

  it('404 invalid_token for an unknown or inactive token, and writes nothing', async () => {
    executeQuery.mockResolvedValue([]);
    const res = makeRes();
    await deviceCheckin({ body }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_token' });
    expect(executeQuery).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['bad installationId', { installationId: 'a b' }],
    ['missing installationId', { installationId: undefined }],
    ['missing token', { siteToken: undefined }],
    ['negative pending', { pending: -1 }],
    ['fractional failed', { failed: 1.5 }],
    ['string pending', { pending: '2' }],
    ['too large pending', { pending: 100001 }],
    ['long appVersion', { appVersion: 'x'.repeat(33) }],
    ['control char in appVersion', { appVersion: 'a\u0001' }],
  ])('400 for %s without touching the DB', async (_n, patch) => {
    const res = makeRes();
    await deviceCheckin({ body: { ...body, ...patch } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('accepts a missing appVersion', async () => {
    executeQuery.mockImplementation(async (sql = '') => (sql.includes('FROM sites') ? [{ id: 5 }] : []));
    const res = makeRes();
    await deviceCheckin({ body: { ...body, appVersion: undefined } }, res);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
  });
});

describe('listDevices', () => {
  const row = (o) => ({
    id: 1, installation_id: 'dev-1', label: null, site_id: 5, site_name: 'Paris', app_version: '1.0',
    last_config_version: 'v1', last_config_at: '2026-10-21 10:00:00', last_seen_at: '2026-10-21 10:00:00',
    local_pending: 3, local_failed: 1, last_upload: '2026-10-20 10:00:00', uploads30: 4, has_uploads: 1, ...o,
  });
  let deviceRows;
  let userSites;
  let visibleSites;
  beforeEach(() => {
    executeQuery.mockReset();
    deviceRows = [];
    userSites = [];
    visibleSites = [];
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM devices d')) return deviceRows;
      if (sql.includes('SELECT site_id AS id FROM user_sites')) return visibleSites.map((id) => ({ id }));
      if (sql.includes('SELECT site_id FROM user_sites')) return userSites.map((site_id) => ({ site_id }));
      return [];
    });
  });
  const deviceQuery = () => executeQuery.mock.calls.find(([sql]) => sql.includes('FROM devices d'));

  it('master sees everything unscoped, sorted by health then name, with stats', async () => {
    deviceRows = [
      row({ id: 1, installation_id: 'b-ok', local_pending: 0, local_failed: 0, last_seen_at: new Date().toISOString() }),
      row({ id: 2, installation_id: 'a-ok', local_pending: 0, local_failed: 0, last_seen_at: new Date().toISOString() }),
      row({ id: 3, installation_id: 'silent', last_seen_at: '2020-01-01 00:00:00' }),
      row({ id: 4, installation_id: 'new', site_id: null, site_name: null, has_uploads: 0, last_upload: null, local_pending: 9 }),
    ];
    const res = makeRes();
    await listDevices(req(master), res);

    const [sql, params] = deviceQuery();
    expect(sql).not.toContain('d.site_id IN');
    expect(params).toEqual([]);
    const { devices, stats } = res.json.mock.calls[0][0];
    expect(devices.map((d) => d.installationId)).toEqual(['silent', 'new', 'a-ok', 'b-ok']);
    expect(devices[1]).toMatchObject({ siteId: null, siteName: null, neverUploaded: true, health: { key: 'off' } });
    expect(devices[0]).toMatchObject({ lastSeenAt: '2020-01-01T00:00:00.000Z', backlogHidden: false, health: { key: 'bad' } });
    expect(devices[0]).not.toHaveProperty('rank');
    expect(stats).toEqual({ devices: 4, healthy: 2, waiting: 3 + 9, failed: 1 + 1, silent: 1 });
  });

  it('scoped admin: restricts by visible sites in SQL and scopes the session subqueries', async () => {
    visibleSites = [5, 6];
    userSites = [5];
    deviceRows = [row({ site_id: 5 })];
    const res = makeRes();
    await listDevices(req(admin), res);

    const [sql, params] = deviceQuery();
    expect(sql).toContain('d.site_id IN (?)');
    expect(sql).toContain('user_sites usx');
    // scope params twice (last upload, count 30d), then the site list
    expect(params).toEqual([2, 2, 2, 2, [5, 6]]);
    expect(res.json.mock.calls[0][0].devices[0]).toMatchObject({ pending: 3, failed: 1, backlogHidden: false });
  });

  it('hides the backlog for a project-only grant and keeps it out of the sums', async () => {
    visibleSites = [5, 6];
    userSites = [6];
    deviceRows = [row({ id: 1, site_id: 5 }), row({ id: 2, installation_id: 'dev-2', site_id: 6, local_pending: 2, local_failed: 0 })];
    const res = makeRes();
    await listDevices(req(admin), res);

    const { devices, stats } = res.json.mock.calls[0][0];
    const hidden = devices.find((d) => d.id === 1);
    expect(hidden).toMatchObject({ pending: 0, failed: 0, backlogHidden: true });
    expect(hidden.health.key).toBe('ok');
    expect(stats).toMatchObject({ devices: 2, waiting: 2, failed: 0 });
  });

  it('returns an empty list without querying devices when no site is visible', async () => {
    const res = makeRes();
    await listDevices(req(admin), res);
    expect(res.json).toHaveBeenCalledWith({ devices: [], stats: { devices: 0, healthy: 0, waiting: 0, failed: 0, silent: 0 } });
    expect(deviceQuery()).toBeUndefined();
  });

  it('applies ?siteId as an extra AND and rejects garbage', async () => {
    await listDevices(req(master, { query: { siteId: '5' } }), makeRes());
    expect(deviceQuery()[1]).toEqual([5]);
    const res = makeRes();
    await listDevices(req(master, { query: { siteId: 'x' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('renameDevice', () => {
  beforeEach(() => executeQuery.mockReset());

  it('master sets a label', async () => {
    executeQuery.mockImplementation(async (sql = '') => (sql.startsWith('SELECT') ? [{ id: 3 }] : []));
    const res = makeRes();
    await renameDevice(req(master, { params: { id: '3' }, body: { label: ' Lab tablet ' } }), res);
    expect(executeQuery).toHaveBeenLastCalledWith(expect.stringContaining('UPDATE devices SET label'), ['Lab tablet', 3]);
    expect(res.json).toHaveBeenCalledWith({ id: 3, label: 'Lab tablet' });
  });

  it('an empty label becomes NULL', async () => {
    executeQuery.mockImplementation(async (sql = '') => (sql.startsWith('SELECT') ? [{ id: 3 }] : []));
    await renameDevice(req(master, { params: { id: '3' }, body: { label: '  ' } }), makeRes());
    expect(executeQuery).toHaveBeenLastCalledWith(expect.any(String), [null, 3]);
  });

  it('rejects a label over 255 characters', async () => {
    const res = makeRes();
    await renameDevice(req(master, { params: { id: '3' }, body: { label: 'x'.repeat(256) } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('403 for a non-master, before any DB access', async () => {
    const res = makeRes();
    await renameDevice(req(admin, { params: { id: '3' }, body: { label: 'x' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('404 for an unknown id', async () => {
    executeQuery.mockResolvedValue([]);
    const res = makeRes();
    await renameDevice(req(master, { params: { id: '99' }, body: { label: 'x' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('assign device site', () => {
  let queue;
  let handler;
  let conn;
  beforeEach(() => {
    executeTransaction.mockReset();
    queue = { enqueue: vi.fn() };
    handler = makeAssignDeviceSite(queue);
  });
  const runWith = (state) => {
    conn = {
      query: vi.fn(async (sql) => {
        if (sql.includes('FROM devices')) return [state.device ? [{ id: 3 }] : []];
        if (sql.includes('FROM sites')) return [state.site ? [{ id: 5 }] : []];
        if (sql.includes('SELECT id FROM upload_sessions')) return [state.sessions.map((id) => ({ id }))];
        return [[]];
      }),
    };
    executeTransaction.mockImplementation(async (cb) => cb(conn));
  };

  it('moves quarantined sessions to validating and re-enqueues them after commit', async () => {
    runWith({ device: true, site: true, sessions: [11, 12] });
    const res = makeRes();
    await handler(req(master, { params: { id: '3' }, body: { siteId: 5 } }), res);

    const update = conn.query.mock.calls.find(([sql]) => sql.includes('UPDATE upload_sessions'));
    expect(update[0]).toContain("status = 'validating'");
    expect(update[0]).toContain('invalid_reason = NULL');
    expect(update[0]).toContain('site_id IS NULL');
    expect(update[1]).toEqual([5, 3]);
    expect(conn.query.mock.calls.some(([sql, p]) => sql.includes('UPDATE devices SET site_id') && p[0] === 5 && p[1] === 3)).toBe(true);
    expect(queue.enqueue.mock.calls).toEqual([[11], [12]]);
    expect(res.json).toHaveBeenCalledWith({ moved: 2 });
  });

  it('moved 0 when nothing was quarantined', async () => {
    runWith({ device: true, site: true, sessions: [] });
    const res = makeRes();
    await handler(req(master, { params: { id: '3' }, body: { siteId: '5' } }), res);
    expect(res.json).toHaveBeenCalledWith({ moved: 0 });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('403 for a non-master', async () => {
    const res = makeRes();
    await handler(req(admin, { params: { id: '3' }, body: { siteId: 5 } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('404 for an unknown device or site, enqueues nothing', async () => {
    runWith({ device: false, site: true, sessions: [1] });
    let res = makeRes();
    await handler(req(master, { params: { id: '3' }, body: { siteId: 5 } }), res);
    expect(res.status).toHaveBeenCalledWith(404);

    runWith({ device: true, site: false, sessions: [1] });
    res = makeRes();
    await handler(req(master, { params: { id: '3' }, body: { siteId: 5 } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('400 for a missing siteId', async () => {
    const res = makeRes();
    await handler(req(master, { params: { id: '3' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
