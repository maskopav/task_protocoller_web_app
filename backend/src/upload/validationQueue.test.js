import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));
vi.mock('../utils/logger.js', () => ({ logToFile: vi.fn(), logFrontendToFile: vi.fn() }));
// Task B's modules: the queue is tested against their contracts only.
vi.mock('./archiveValidator.js', () => ({ validateArchive: vi.fn() }));
vi.mock('./sessionExtractor.js', () => ({ extractSession: vi.fn(), needsAttention: vi.fn() }));
vi.mock('./siteContext.js', () => ({ loadSiteContext: vi.fn() }));

const { executeQuery } = await import('../db/queryHelper.js');
const { logToFile } = await import('../utils/logger.js');
const { validateArchive } = await import('./archiveValidator.js');
const { extractSession } = await import('./sessionExtractor.js');
const { loadSiteContext } = await import('./siteContext.js');
const { validateStoredSession, createValidationQueue } = await import('./validationQueue.js');
const { LocalFileStore } = await import('../storage/fileStore.js');

const SESSION_ID = '76a6f0e1c2d3b4a5968778695a4b3c2d';
const INSTALLATION_ID = '6f933f6e-c07a-414f-9800-47b37253d409';
const store = new LocalFileStore(path.join(path.sep, 'data'));

const row = (over = {}) => ({
  id: 42, session_id: SESSION_ID, site_id: 3, storage_path: `sessions/76/${SESSION_ID}.zip`,
  received_at: '2026-10-13 08:01:02.123', flags: '["duplicate"]', installation_id: INSTALLATION_ID, ...over,
});

const CHECKS = [{ key: 'zip_checksum', result: 'ok' }, { key: 'device', result: 'ok' }];
const PARSED = { manifest: {}, examination: {}, participant: {}, snapshot: {}, timelineOriginal: {}, timelineEdited: null };
const SITE = { currentConfigVersion: '2026-10-05.080231', projects: [{ id: 1, name: 'Speech Study', protocols: [] }] };

let updates;
const mockDb = (r) => {
  updates = [];
  executeQuery.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM upload_sessions us JOIN devices')) return r ? [r] : [];
    if (sql.startsWith('UPDATE upload_sessions')) {
      updates.push({ sql, params });
      return { affectedRows: 1 };
    }
    if (sql.includes("WHERE status = 'validating'")) return [{ id: 5 }, { id: 9 }];
    throw new Error(`Unexpected query: ${sql}`);
  });
};

// Column → bound value of the single UPDATE, read off "col = ?" pairs.
const updatedColumns = () => {
  expect(updates).toHaveLength(1);
  const { sql, params } = updates[0];
  const setPart = sql.slice(sql.indexOf('SET') + 3, sql.lastIndexOf('WHERE id'));
  const cols = {};
  let i = 0;
  for (const m of setPart.matchAll(/(\w+) = (IF\(|\?)/g)) {
    if (m[2] === '?') cols[m[1]] = params[i++];
    else { cols[m[1]] = params[i + 2]; i += 3; }
  }
  expect(params.at(-1)).toBe(42);
  return cols;
};

beforeEach(() => {
  vi.clearAllMocks();
  loadSiteContext.mockResolvedValue(SITE);
});

describe('validateStoredSession', () => {
  it('validates the stored file and writes status, checks and the extracted columns', async () => {
    mockDb(row());
    validateArchive.mockResolvedValue({ checks: CHECKS, status: 'valid', invalidReason: null, parsed: PARSED });
    extractSession.mockReturnValue({ columns: {
      project_id: 1, protocol_id: null, protocol_name: 'Speech battery', started_at: '2026-10-13 07:40:00.000',
      tasks_total: 5, has_audio: true, patient_code: 'testx',
      participant_fields: { patient_code: 'testx', visit_number: '1' },
      exam_summary: { tasks: [] }, flags: ['duplicate', 'retakes'],
    } });

    await validateStoredSession(42, { store });

    expect(loadSiteContext).toHaveBeenCalledWith(3);
    expect(validateArchive).toHaveBeenCalledWith(store.resolve(`sessions/76/${SESSION_ID}.zip`), {
      sessionId: SESSION_ID, installationId: INSTALLATION_ID, siteKnown: true, currentConfigVersion: SITE.currentConfigVersion,
    });
    expect(extractSession).toHaveBeenCalledWith(PARSED, {
      receivedAt: '2026-10-13T08:01:02.123Z', currentConfigVersion: SITE.currentConfigVersion,
      projects: SITE.projects, existingFlags: ['duplicate'],
    });
    expect(updatedColumns()).toEqual({
      status: 'valid', invalid_reason: null, checks: JSON.stringify(CHECKS),
      project_id: 1, protocol_id: null, protocol_name: 'Speech battery', started_at: '2026-10-13 07:40:00.000',
      tasks_total: 5, has_audio: true, patient_code: 'testx',
      participant_fields: JSON.stringify({ patient_code: 'testx', visit_number: '1' }),
      exam_summary: JSON.stringify({ tasks: [] }),
      flags: JSON.stringify(['duplicate', 'retakes']),
    });
  });

  it('keeps a duplicate flag added while it ran (merged in SQL)', async () => {
    mockDb(row({ flags: '[]' }));
    validateArchive.mockResolvedValue({ checks: CHECKS, status: 'valid', invalidReason: null, parsed: PARSED });
    extractSession.mockReturnValue({ columns: { flags: [] } });
    await validateStoredSession(42, { store });
    expect(updates[0].sql).toMatch(/flags = IF\(JSON_CONTAINS\(flags, '"duplicate"'\)/);
  });

  it('writes only status and checks when the archive is not parseable', async () => {
    mockDb(row());
    validateArchive.mockResolvedValue({ checks: CHECKS, status: 'invalid', invalidReason: 'malformed',
      parsed: { ...PARSED, examination: null } });
    await validateStoredSession(42, { store });
    expect(extractSession).not.toHaveBeenCalled();
    expect(updatedColumns()).toEqual({ status: 'invalid', invalid_reason: 'malformed', checks: JSON.stringify(CHECKS) });
  });

  it('validates a quarantined session without a site', async () => {
    mockDb(row({ site_id: null }));
    loadSiteContext.mockResolvedValue({ currentConfigVersion: null, projects: [] });
    validateArchive.mockResolvedValue({ checks: CHECKS, status: 'invalid', invalidReason: 'unknown_device', parsed: PARSED });
    extractSession.mockReturnValue({ columns: { project_id: null, flags: ['duplicate'] } });
    await validateStoredSession(42, { store });
    expect(loadSiteContext).toHaveBeenCalledWith(null);
    expect(validateArchive.mock.calls[0][1]).toMatchObject({ siteKnown: false, currentConfigVersion: null });
    expect(updatedColumns()).toMatchObject({ status: 'invalid', invalid_reason: 'unknown_device', project_id: null });
  });

  it('on an I/O failure tags the error with the sessionId and leaves the row untouched', async () => {
    mockDb(row());
    validateArchive.mockRejectedValue(Object.assign(new Error('EIO'), { code: 'EIO' }));
    await expect(validateStoredSession(42, { store })).rejects.toMatchObject({ code: 'EIO', sessionId: SESSION_ID });
    expect(updates).toEqual([]);
  });

  it('a throwing extractor closes the row as invalid/malformed instead of throwing', async () => {
    mockDb(row());
    const checks = [{ key: 'zip_checksum', result: 'ok' }, { key: 'archive', result: 'ok' }, { key: 'complete', result: 'warn' }];
    validateArchive.mockResolvedValue({ checks, status: 'valid', invalidReason: null, parsed: PARSED });
    extractSession.mockImplementation(() => { throw new TypeError("Cannot read properties of null (reading 'taskIndex')"); });
    await expect(validateStoredSession(42, { store })).resolves.toBeUndefined();
    expect(updatedColumns()).toEqual({
      checks: JSON.stringify([checks[0], { key: 'archive', result: 'bad', detail: 'unprocessable content' }, checks[2]]),
    });
    expect(updates[0].sql).toMatch(/status = 'invalid', invalid_reason = 'malformed', checks = \?/);
  });

  it('a validator that throws without an errno code also closes the row as invalid', async () => {
    mockDb(row());
    validateArchive.mockRejectedValue(new TypeError('Cannot convert object to primitive value'));
    await validateStoredSession(42, { store });
    const { checks } = updatedColumns();
    expect(JSON.parse(checks).find((c) => c.key === 'archive')).toEqual({ key: 'archive', result: 'bad', detail: 'unprocessable content' });
    expect(JSON.parse(checks).map((c) => c.key)).toEqual(['zip_checksum', 'archive', 'manifest', 'ids', 'device', 'config_version', 'complete']);
  });

  it('when the database refuses the extracted data, closes the row as invalid; a lost connection still throws', async () => {
    mockDb(row());
    validateArchive.mockResolvedValue({ checks: CHECKS, status: 'valid', invalidReason: null, parsed: PARSED });
    extractSession.mockReturnValue({ columns: { protocol_name: 'x', flags: [] } });
    let first = true;
    const base = executeQuery.getMockImplementation();
    executeQuery.mockImplementation(async (sql, params) => {
      if (sql.startsWith('UPDATE') && first) {
        first = false;
        throw Object.assign(new Error('Data too long'), { code: 'ER_DATA_TOO_LONG' });
      }
      return base(sql, params);
    });
    await validateStoredSession(42, { store });
    expect(updatedColumns()).toEqual({ checks: expect.stringContaining('unprocessable content') });
    expect(updates[0].sql).toMatch(/status = 'invalid', invalid_reason = 'malformed'/);

    mockDb(row());
    executeQuery.mockImplementation(async (sql) => {
      if (sql.startsWith('UPDATE')) throw Object.assign(new Error('gone'), { code: 'PROTOCOL_CONNECTION_LOST' });
      return [row()];
    });
    await expect(validateStoredSession(42, { store })).rejects.toMatchObject({ code: 'PROTOCOL_CONNECTION_LOST' });
  });

  it('keeps patient_code, visit_number and participant_fields once a master has edited them', async () => {
    mockDb(row({ participant_edited_at: '2026-10-14 09:00:00' }));
    validateArchive.mockResolvedValue({ checks: CHECKS, status: 'valid', invalidReason: null, parsed: PARSED });
    extractSession.mockReturnValue({ columns: {
      protocol_name: 'Speech battery', patient_code: 'archive', visit_number: '1',
      participant_fields: { patient_code: 'archive' }, exam_summary: { tasks: [] }, flags: [],
    } });
    await validateStoredSession(42, { store });
    const cols = updatedColumns();
    expect(cols).toMatchObject({ status: 'valid', protocol_name: 'Speech battery', exam_summary: JSON.stringify({ tasks: [] }) });
    expect(cols).not.toHaveProperty('patient_code');
    expect(cols).not.toHaveProperty('visit_number');
    expect(cols).not.toHaveProperty('participant_fields');
    expect(executeQuery.mock.calls[0][0]).toMatch(/participant_edited_at/);
  });

  it('does nothing for a row that no longer exists', async () => {
    mockDb(null);
    await validateStoredSession(42, { store });
    expect(validateArchive).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });
});

describe('createValidationQueue', () => {
  it('runs one validation at a time, in order', async () => {
    let active = 0;
    let maxActive = 0;
    const order = [];
    const validate = vi.fn(async (id) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      order.push(id);
      active--;
    });
    const queue = createValidationQueue({ store, validate });
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    queue.enqueue(2); // already pending
    await queue.idle();
    expect(order).toEqual([1, 2, 3]);
    expect(maxActive).toBe(1);

    queue.enqueue(4);
    await queue.idle();
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('keeps going after a validation throws, and logs by sessionId only', async () => {
    const done = [];
    const validate = vi.fn(async (id) => {
      if (id === 1) throw Object.assign(new Error('Unexpected token in "testx_secret"'), { code: 'EIO', sessionId: SESSION_ID });
      done.push(id);
    });
    const queue = createValidationQueue({ store, validate });
    queue.enqueue(1);
    queue.enqueue(2);
    await queue.idle();
    expect(done).toEqual([2]);
    expect(logToFile).toHaveBeenCalledWith('ERROR', expect.any(String),
      { sessionId: SESSION_ID, uploadSessionId: 1, code: 'EIO' });
    expect(JSON.stringify(logToFile.mock.calls)).not.toContain('testx');
  });

  it('recover() re-enqueues every row still validating', async () => {
    mockDb(null);
    const validate = vi.fn(async () => {});
    const queue = createValidationQueue({ store, validate });
    expect(await queue.recover()).toBe(2);
    await queue.idle();
    expect(validate.mock.calls.map(([id]) => id)).toEqual([5, 9]);
    expect(executeQuery.mock.calls.some(([sql]) => sql.includes("status = 'validating'"))).toBe(true);
  });

  it('defaults to validateStoredSession', async () => {
    mockDb(row());
    validateArchive.mockResolvedValue({ checks: CHECKS, status: 'invalid', invalidReason: 'malformed', parsed: {} });
    const queue = createValidationQueue({ store });
    queue.enqueue(42);
    await queue.idle();
    expect(updates).toHaveLength(1);
  });
});
