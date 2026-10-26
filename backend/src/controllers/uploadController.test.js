import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));
vi.mock('../utils/logger.js', () => ({ logToFile: vi.fn() }));

const { executeQuery, executeTransaction } = await import('../db/queryHelper.js');
const C = await import('./uploadController.js');

const SID = 'a'.repeat(32);
const asAdmin = (extra = {}) => ({ query: {}, params: {}, body: {}, admin: { id: 2, role: 'admin' }, ...extra });
const asMaster = (extra = {}) => ({ query: {}, params: {}, body: {}, admin: { id: 1, role: 'master' }, ...extra });

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

const sessionRow = (over = {}) => ({
  id: 7, session_id: SID, site_id: 3, site_name: 'Prague', installation_id: 'dev-1', device_label: 'PC 1',
  project_id: 4, protocol_name: 'PD', protocol_project: 'Proj', status: 'valid', qc: 'unreviewed',
  flags: '["recovered"]', bytes: '10', received_at: '2026-10-01 10:00:00.000', ended_at: null,
  processed_at: '2026-10-01 09:00:00.000', patient_code: 'PD1', visit_number: 'V1',
  participant_fields: '{"patient_code":"PD1","visit_number":"V1","surname":"Novak","sex":"f"}',
  exam_summary: '{"tasks":[{"taskIndex":0}],"hardware":{"x":1},"timeline":[]}', checks: '[{"key":"archive","result":"ok"}]',
  can_edit: 1, ...over,
});

// Dispatch on SQL substrings so tests don't depend on query order.
function mockDb({ session = sessionRow(), comments = [], extra = {} } = {}) {
  const calls = [];
  executeQuery.mockImplementation(async (sql, params) => {
    calls.push({ sql, params });
    for (const [needle, out] of Object.entries(extra)) if (sql.includes(needle)) return typeof out === 'function' ? out(sql, params) : out;
    if (sql.includes('WHERE us.session_id = ?') && sql.includes('AS can_edit')) return session ? [session] : [];
    if (sql.includes('FROM session_comments c')) return comments;
    if (sql.includes('LAG(')) return [{ prev_id: 'p'.repeat(32), next_id: null }];
    if (sql.includes('SELECT name FROM projects')) return [{ name: 'Proj' }];
    if (sql.includes('INSERT INTO audit_log')) return { insertId: 1 };
    if (sql.includes('INSERT INTO session_comments')) return { insertId: 55 };
    return [];
  });
  return calls;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('parseListQuery / buildListQuery', () => {
  it('binds every filter as a parameter', () => {
    const q = C.buildListQuery({ id: 2, role: 'admin' }, {
      q: 'PD1', site: ['1', '2,3'], project: '9', protocol: 'PD-battery', dateField: 'recorded',
      from: '2026-01-01', to: '2026-02-01', status: 'invalid', qc: 'review', flag: ['recovered', 'late'],
      hasVideo: '1', attention: '1',
    });
    expect(q.sql).not.toMatch(/PD1|PD-battery|2026-01-01/);
    expect(q.params).toEqual(expect.arrayContaining([
      'PD1%', '%PD1%', [1, 2, 3], 9, 'PD-battery', '2026-01-01 00:00:00', '2026-02-01', 'invalid', 'review', 'recovered', 'late',
    ]));
    expect(q.sql).toMatch(/COALESCE\(us\.ended_at, us\.processed_at\) >= \?/);
    expect(q.sql).toMatch(/video_clips > 0/);
    expect(q.sql.match(/JSON_CONTAINS\(us\.flags, JSON_QUOTE\(\?\)\)/g)).toHaveLength(2);
    expect(q.countParams.length).toBe(q.params.length - 1); // can_edit scope param
  });

  it('filters a project given by name through the project name', () => {
    const q = C.buildListQuery({ id: 1, role: 'master' }, { project: 'Test Study' });
    expect(q.sql).toMatch(/COALESCE\(p\.name, us\.protocol_project\) = \?/);
    expect(q.params).toContain('Test Study');
  });

  it('escapes LIKE wildcards in the search term', () => {
    const q = C.buildListQuery({ id: 1, role: 'master' }, { q: '50%_x' });
    expect(q.params).toContain('50\\%\\_x%');
  });

  it('maps sort keys through the whitelist and uses semantic orders', () => {
    const m = { id: 1, role: 'master' };
    expect(C.buildListQuery(m, { sort: 'status', dir: 'asc' }).sql)
      .toContain("ORDER BY FIELD(us.status, 'invalid', 'validating', 'valid') ASC, us.id DESC");
    expect(C.buildListQuery(m, { sort: 'qc' }).sql)
      .toContain("FIELD(us.qc, 'review', 'unreviewed', 'ok', 'excluded') DESC");
    expect(C.buildListQuery(m, {}).sql).toContain('ORDER BY us.received_at DESC');
  });

  it.each([
    [{ sort: 'received_at; DROP TABLE users' }, 'invalid_sort'],
    [{ sort: '__proto__' }, 'invalid_sort'],
    [{ sort: 'constructor' }, 'invalid_sort'],
    [{ dir: 'desc; --' }, 'invalid_dir'],
    [{ status: 'bogus' }, 'invalid_status'],
    [{ qc: "ok' OR '1'='1" }, 'invalid_qc'],
    [{ flag: 'nope' }, 'invalid_flag'],
    [{ site: '1 OR 1=1' }, 'invalid_site'],
    [{ from: '2026-13-45' }, 'invalid_date'],
    [{ dateField: 'created' }, 'invalid_dateField'],
    [{ q: { a: 1 } }, 'invalid_q'],
  ])('rejects %j', (query, code) => {
    expect(() => C.parseListQuery(query)).toThrow(code);
  });

  it('clamps page and pageSize', () => {
    const f = (q) => C.parseListQuery(q);
    expect(f({}).pageSize).toBe(25);
    expect(f({ pageSize: '50' }).pageSize).toBe(50);
    expect(f({ pageSize: '1000' }).pageSize).toBe(25);
    expect(f({ pageSize: '7' }).pageSize).toBe(25);
    expect(f({ page: '-3' }).page).toBe(1);
    expect(f({ page: 'abc' }).page).toBe(1);
    const q = C.buildListQuery({ id: 1, role: 'master' }, { page: '3', pageSize: '10' });
    expect(q.sql).toMatch(/LIMIT 10 OFFSET 20/);
  });

  it('scopes in SQL for non-masters and not for masters', () => {
    expect(C.buildListQuery({ id: 2, role: 'admin' }, {}).sql).toMatch(/user_sites usx/);
    expect(C.buildListQuery({ id: 1, role: 'master' }, {}).sql).not.toMatch(/user_sites/);
  });
});

describe('listUploads', () => {
  it('returns rows, total, kpis and facets, shaped like the mock', async () => {
    mockDb({
      extra: {
        'AS pk': [{ ...sessionRow(), pk: 7, project_name: 'Proj', can_edit: 0, comment_count: '2', tasks_total: 5, tasks_done: 4, tasks_skipped: 1,
          audio_clips: 3, video_clips: 0, has_audio: 1, ended_at: '2026-10-01 09:30:00.000' }],
        'COUNT(*) AS total': [{ total: '41' }],
        'AS received7d': [{ received7d: '5', valid: '30', invalid: '4', attention: '9', unreviewed: '7' }],
        'GROUP BY us.site_id': [{ id: 3, name: 'Prague', count: '12' }],
        'AS f0': [{ f0: '2', f1: '0', f2: '1', f3: '0', f4: '0', f5: '0', f6: '3', f7: '0', f8: '0', f9: '0', f10: '1', video: '6' }],
      },
    });
    const res = makeRes();
    await C.listUploads(asAdmin({ query: { pageSize: '10' } }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.total).toBe(41);
    expect(body.kpis).toEqual({ received7d: 5, valid: 30, invalid: 4, attention: 9, unreviewed: 7 });
    expect(body.facets.sites).toEqual([{ id: 3, name: 'Prague', count: 12 }]);
    expect(body.facets.flags).toHaveLength(11);
    expect(body.facets.flags[0]).toEqual({ key: 'recovered', count: 2 });
    expect(body.facets.flags[6]).toEqual({ key: 'late', count: 3 });
    const row = body.rows[0];
    expect(row).toMatchObject({
      id: SID, site: 'Prague', deviceId: 'dev-1', deviceLabel: 'PC 1', protocol: 'PD', project: 'Proj',
      receivedAt: '2026-10-01T10:00:00.000Z', endedAt: '2026-10-01T09:30:00.000Z', bytes: 10,
      status: 'valid', qc: 'unreviewed', issues: ['recovered'], needsAttention: true,
      canEdit: false, commentCount: 2, tasksDone: 4,
      participant: { patient_code: 'PD1', visit_number: 'V1' },
    });
    expect(JSON.stringify(body)).not.toMatch(/Novak|surname|participant_fields/);
  });

  it('KPIs ignore status/qc/attention filters, facets ignore their own axis', async () => {
    const calls = mockDb();
    await C.listUploads(asAdmin({ query: { status: 'invalid', site: '3', flag: 'late' } }), makeRes());
    const kpi = calls.find((c) => c.sql.includes('AS received7d'));
    expect(kpi.params).not.toContain('invalid');
    expect(kpi.params).toContainEqual([3]);
    const siteFacet = calls.find((c) => c.sql.includes('GROUP BY us.site_id'));
    expect(siteFacet.params).not.toContainEqual([3]);
    expect(siteFacet.params).toContain('invalid');
    const flagFacet = calls.find((c) => c.sql.includes('AS f0'));
    expect(flagFacet.params).not.toContain('late');
  });

  it('answers 400 on a bad filter and never hits the DB', async () => {
    mockDb();
    const res = makeRes();
    await C.listUploads(asAdmin({ query: { sort: 'x; DROP' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_sort' });
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('answers 500 without echoing internals', async () => {
    executeQuery.mockRejectedValue(new Error('secret sql detail'));
    const res = makeRes();
    await C.listUploads(asAdmin(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'internal' });
  });
});

describe('CSV export', () => {
  it('quotes fields and neutralises formulas', () => {
    expect(C.csvField('plain')).toBe('plain');
    expect(C.csvField('a,b')).toBe('"a,b"');
    expect(C.csvField('say "hi"')).toBe('"say ""hi"""');
    expect(C.csvField('line\nbreak')).toBe('"line\nbreak"');
    for (const bad of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx']) expect(C.csvField(bad)).toBe(`'${bad}`);
    expect(C.csvField('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
    expect(C.csvField(-5)).toBe('-5');
    expect(C.csvField(null)).toBe('');
  });

  it('exports a text/csv attachment with the list columns and no masked fields', async () => {
    mockDb({
      extra: { 'AS pk': [{ ...sessionRow(), pk: 7, patient_code: '=evil', comment_count: 0, can_edit: 1 }] },
    });
    const res = makeRes();
    await C.exportCsv(asMaster(), res);
    const headers = res.set.mock.calls[0][0];
    expect(headers['Content-Type']).toMatch(/^text\/csv/);
    expect(headers['Content-Disposition']).toMatch(/^attachment; filename="uploads-\d{4}-\d{2}-\d{2}\.csv"$/);
    const text = res.send.mock.calls[0][0];
    const lines = text.replace('﻿', '').split('\r\n');
    expect(lines[0]).toMatch(/^sessionId,receivedAt,recordedAt,site,/);
    expect(lines[1]).toContain("'=evil");
    expect(lines[1]).toContain('recovered');
    expect(text).not.toMatch(/Novak|surname/);
  });

  it('applies the same filters and scope', async () => {
    const calls = mockDb();
    await C.exportCsv(asAdmin({ query: { qc: 'review' } }), makeRes());
    expect(calls[0].params).toContain('review');
    expect(calls[0].sql).toMatch(/user_sites usx/);
  });
});

describe('getSummary', () => {
  const summaryDb = (extra = {}) => mockDb({
    extra: {
      'AS needsReview': [{ total: '9', week: '3', last30: '8', invalid: '1', needsReview: '2', attention: '4', unreviewed: '5', lastUpload: '2026-10-20 08:00:00.000' }],
      'GROUP BY DATE': [{ day: new Date().toISOString().slice(0, 10), count: '2', invalid: '1' }],
      'GROUP BY us.protocol_name': [{ protocol: 'PD', count: '3' }],
      'GROUP BY us.site_id, s.name ORDER BY count': [{ id: 3, name: 'Prague', count: '3' }],
      ...extra,
    },
  });

  it('404s when the site is not visible to the caller', async () => {
    summaryDb();
    vi.resetModules();
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM user_sites WHERE user_id')) return [{ id: 3 }];
      if (sql.includes('FROM project_editors')) return [];
      return [];
    });
    const res = makeRes();
    await C.getSummary(asAdmin({ query: { siteId: '99' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'not_found' });
  });

  it('404s for a master on an unknown site', async () => {
    executeQuery.mockResolvedValue([]);
    const res = makeRes();
    await C.getSummary(asMaster({ query: { projectId: '99' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('scopes counts to the caller and the given site, fills missing days', async () => {
    const calls = summaryDb({ 'FROM user_sites WHERE user_id': [{ id: 3 }] });
    const res = makeRes();
    await C.getSummary(asAdmin({ query: { siteId: '3', days: '7' } }), res);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ week: 3, last30: 8, invalid: 1, needsReview: 2, attention: 4, unreviewed: 5, days: 7 });
    expect(body.lastUpload).toBe('2026-10-20T08:00:00.000Z');
    expect(body.perDay).toHaveLength(7);
    expect(body.perDay.at(-1)).toMatchObject({ count: 2, invalid: 1 });
    expect(body.perDay[0].count).toBe(0);
    expect(body.byProtocol).toEqual([{ protocol: 'PD', count: 3 }]);
    expect(body.bySite).toEqual([{ id: 3, name: 'Prague', count: 3 }]);
    const agg = calls.find((c) => c.sql.includes('AS needsReview'));
    expect(agg.sql).toMatch(/user_sites usx/);
    expect(agg.sql).toMatch(/us\.site_id = \?/);
    expect(agg.params).toContain(3);
  });

  it('covers the whole scope with neither id and clamps days', async () => {
    const calls = summaryDb();
    const res = makeRes();
    await C.getSummary(asAdmin({ query: { days: '500' } }), res);
    expect(res.json.mock.calls[0][0].days).toBe(90);
    const agg = calls.find((c) => c.sql.includes('AS needsReview'));
    expect(agg.sql).not.toMatch(/us\.site_id = \?/);
    await C.getSummary(asAdmin({ query: { days: '1' } }), makeRes());
  });

  it('rejects a malformed id', async () => {
    const res = makeRes();
    await C.getSummary(asAdmin({ query: { siteId: '1;DROP' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('maskParticipant', () => {
  it('keeps patient_code and visit_number only', () => {
    expect(C.maskParticipant({ patient_code: 'A', visit_number: 'V1', surname: 'X', sex: 'f' })).toEqual({
      fields: { patient_code: 'A', visit_number: 'V1', surname: null, sex: null },
      maskedKeys: ['surname', 'sex'],
    });
    expect(C.maskParticipant(null)).toEqual({ fields: {}, maskedKeys: [] });
  });
});

describe('getUpload', () => {
  it('404s when findScopedSession finds nothing (out of scope = nonexistent)', async () => {
    mockDb({ session: null });
    const res = makeRes();
    await C.getUpload(asAdmin({ params: { sessionId: SID } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('404s on a malformed id without a query', async () => {
    const res = makeRes();
    await C.getUpload(asAdmin({ params: { sessionId: 'nope' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('returns the detail with a masked participant, exam summary, comments and neighbours', async () => {
    mockDb({
      comments: [
        { id: 1, user_id: 2, full_name: 'Eva Editor', email: 'e@x', text: 'hi', is_system: 0, created_at: '2026-10-02 10:00:00' },
        { id: 2, user_id: 3, full_name: null, email: 'zed@x', text: 'set review to OK', is_system: 1, created_at: '2026-10-02 11:00:00' },
      ],
    });
    const res = makeRes();
    await C.getUpload(asAdmin({ params: { sessionId: SID }, query: { site: '3' } }), res);
    const b = res.json.mock.calls[0][0];
    expect(b).toMatchObject({
      id: SID, site: 'Prague', deviceLabel: 'PC 1', project: 'Proj', canEdit: true,
      tasks: [{ taskIndex: 0 }], hardware: { x: 1 }, checks: [{ key: 'archive', result: 'ok' }],
      prevId: 'p'.repeat(32), nextId: null,
    });
    expect(b.questionTexts).toEqual({});
    expect(b.participant.fields).toEqual({ patient_code: 'PD1', visit_number: 'V1', surname: null, sex: null });
    expect(b.participant.maskedKeys).toEqual(['surname', 'sex']);
    expect(JSON.stringify(b)).not.toContain('Novak');
    expect(b.comments).toEqual([
      expect.objectContaining({ who: 'EE', name: 'Eva Editor', system: false, at: '2026-10-02T10:00:00Z' }),
      expect.objectContaining({ who: 'ZE', name: 'zed', system: true }),
    ]);
  });

  it('passes the list filters through to prev/next, ctx included', async () => {
    const calls = mockDb();
    await C.getUpload(asAdmin({ params: { sessionId: SID }, query: { ctx: 'status=invalid&sort=bytes&dir=asc' } }), makeRes());
    const nav = calls.find((c) => c.sql.includes('LAG('));
    expect(nav.params).toContain('invalid');
    expect(nav.sql).toContain('us.bytes ASC');
    expect(nav.params.at(-1)).toBe(SID);
  });

  it('ignores a bad ctx instead of failing the detail', async () => {
    mockDb();
    const res = makeRes();
    await C.getUpload(asAdmin({ params: { sessionId: SID }, query: { sort: 'bogus' } }), res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ prevId: null, nextId: null });
  });
});

describe('attempts and comments (read)', () => {
  it('lists attempts newest first', async () => {
    const calls = mockDb({
      extra: { 'FROM upload_attempts': [{ id: 2, at: '2026-10-01 10:00:00.000', http_code: 200, outcome: 'accepted', bytes: '5', device_reported: 0 }] },
    });
    const res = makeRes();
    await C.getAttempts(asAdmin({ params: { sessionId: SID } }), res);
    expect(calls.find((c) => c.sql.includes('upload_attempts')).sql).toMatch(/ORDER BY at DESC/);
    expect(res.json.mock.calls[0][0][0]).toMatchObject({ code: 200, outcome: 'accepted', at: '2026-10-01T10:00:00.000Z', bytes: 5 });
  });

  it('404s on attempts and comments for an invisible session', async () => {
    mockDb({ session: null });
    for (const fn of [C.getAttempts, C.getComments]) {
      const res = makeRes();
      await fn(asAdmin({ params: { sessionId: SID } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    }
  });
});

describe('edit rights: 404 vs 403', () => {
  const edits = [
    ['reveal', () => C.revealParticipant, {}],
    ['participant', () => C.patchParticipant, { fields: { surname: 'x' } }],
    ['qc', () => C.putQc, { qc: 'ok' }],
    ['comment', () => C.addComment, { text: 'x' }],
  ];
  it.each(edits)('%s: 404 when invisible', async (_n, fn, body) => {
    mockDb({ session: null });
    const res = makeRes();
    await fn()(asAdmin({ params: { sessionId: SID }, body }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it.each(edits)('%s: 403 when visible but read-only, with no write', async (_n, fn, body) => {
    const calls = mockDb({ session: sessionRow({ can_edit: 0 }) });
    const res = makeRes();
    await fn()(asAdmin({ params: { sessionId: SID }, body }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(calls.some((c) => /INSERT|UPDATE/.test(c.sql))).toBe(false);
    expect(executeTransaction).not.toHaveBeenCalled();
  });
});

describe('revealParticipant', () => {
  it('returns the full fields and writes the reveal audit entry', async () => {
    const calls = mockDb();
    const res = makeRes();
    await C.revealParticipant(asAdmin({ params: { sessionId: SID } }), res);
    expect(res.json).toHaveBeenCalledWith({ fields: { patient_code: 'PD1', visit_number: 'V1', surname: 'Novak', sex: 'f' } });
    const audit = calls.find((c) => c.sql.includes('INSERT INTO audit_log'));
    expect(audit.params.slice(0, 3)).toEqual([2, 'reveal', 7]);
  });
});

describe('patchParticipant', () => {
  // The transaction callback gets a fake connection that records SQL.
  const runTx = (fieldsJson = '{"patient_code":"PD1","visit_number":"V1","surname":"Novak"}') => {
    const writes = [];
    executeTransaction.mockImplementation(async (cb) => {
      const conn = {
        query: vi.fn(async (sql, params) => {
          if (sql.includes('FOR UPDATE')) return [[{ participant_fields: fieldsJson }]];
          writes.push({ sql, params });
          return [{ insertId: 9 }];
        }),
      };
      return cb(conn);
    });
    return writes;
  };
  const patch = async (fields) => {
    mockDb();
    const res = makeRes();
    await C.patchParticipant(asAdmin({ params: { sessionId: SID }, body: { fields } }), res);
    return res;
  };

  it('updates JSON and columns, audits old/new values and posts a names-only comment', async () => {
    const writes = runTx();
    const res = await patch({ surname: 'Svoboda', patient_code: 'PD9', visit_number: 'V1' });
    expect(res.status).not.toHaveBeenCalled();
    const upd = writes.find((w) => w.sql.includes('UPDATE upload_sessions'));
    expect(upd.sql).toMatch(/participant_edited_at = CURRENT_TIMESTAMP/);
    expect(JSON.parse(upd.params[0])).toEqual({ patient_code: 'PD9', visit_number: 'V1', surname: 'Svoboda' });
    expect(upd.params.slice(1)).toEqual(['PD9', 'V1', 7]);
    const audit = writes.find((w) => w.sql.includes('audit_log'));
    expect(audit.sql).toContain("'participant_edit'");
    expect(JSON.parse(audit.params[2])).toEqual({
      changes: [{ field: 'surname', old: 'Novak', new: 'Svoboda' }, { field: 'patient_code', old: 'PD1', new: 'PD9' }],
    });
    const comment = writes.find((w) => w.sql.includes('session_comments'));
    expect(comment.params[2]).toBe('edited participant fields: surname, patient_code');
    expect(comment.params[2]).not.toMatch(/Svoboda|Novak/);
    expect(executeQuery).toHaveBeenCalled(); // reload of the masked participant
  });

  it('writes nothing when nothing changed', async () => {
    const writes = runTx();
    await patch({ surname: 'Novak' });
    expect(writes).toHaveLength(0);
  });

  it.each([
    ['unknown key', { shoeSize: '42' }, 'unknown_field'],
    ['blank patient_code', { patient_code: '  ' }, 'required_field'],
    ['blank visit_number', { visit_number: '' }, 'required_field'],
    ['non-string', { surname: 12 }, 'invalid_value'],
    ['too long', { surname: 'x'.repeat(256) }, 'invalid_value'],
  ])('rejects %s', async (_n, fields, code) => {
    const writes = runTx();
    const res = await patch(fields);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: code });
    expect(writes).toHaveLength(0);
  });

  it('allows blanking a non-required field', async () => {
    const writes = runTx();
    await patch({ surname: '' });
    expect(writes.find((w) => w.sql.includes('UPDATE upload_sessions'))).toBeTruthy();
  });

  it.each([null, [], {}, 'x'])('rejects fields = %j', async (fields) => {
    runTx();
    const res = await patch(fields);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_fields' });
  });
});

describe('putQc', () => {
  const runTx = () => {
    const writes = [];
    executeTransaction.mockImplementation(async (cb) => cb({ query: vi.fn(async (sql, params) => { writes.push({ sql, params }); return [{}]; }) }));
    return writes;
  };

  it('sets the status, posts the system comment and audits', async () => {
    mockDb();
    const writes = runTx();
    const res = makeRes();
    await C.putQc(asAdmin({ params: { sessionId: SID }, body: { qc: 'review' } }), res);
    expect(writes.find((w) => w.sql.includes('UPDATE upload_sessions')).params).toEqual(['review', 7]);
    expect(writes.find((w) => w.sql.includes('session_comments')).params).toEqual([7, 2, 'set review to Needs review']);
    const audit = writes.find((w) => w.sql.includes('audit_log'));
    expect(audit.sql).toContain("'qc_change'");
    expect(JSON.parse(audit.params[2])).toEqual({ from: 'unreviewed', to: 'review' });
    expect(res.json.mock.calls[0][0].qc).toBe('review');
  });

  it.each(['bogus', '', null, 5, 'OK'])('rejects qc = %j', async (qc) => {
    mockDb();
    const writes = runTx();
    const res = makeRes();
    await C.putQc(asAdmin({ params: { sessionId: SID }, body: { qc } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(writes).toHaveLength(0);
  });
});

describe('addComment', () => {
  const post = async (text) => {
    const calls = mockDb({
      extra: { 'WHERE c.id = ?': [{ id: 55, user_id: 2, full_name: 'Eva Editor', text: 'trimmed', is_system: 0, created_at: '2026-10-02 10:00:00' }] },
    });
    const res = makeRes();
    await C.addComment(asAdmin({ params: { sessionId: SID }, body: { text } }), res);
    return { res, calls };
  };

  it('trims, stores with the caller as author and returns the comment', async () => {
    const { res, calls } = await post('  trimmed  ');
    const ins = calls.find((c) => c.sql.includes('INSERT INTO session_comments'));
    expect(ins.params).toEqual([7, 2, 'trimmed']);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0]).toMatchObject({ id: 55, who: 'EE', name: 'Eva Editor', system: false });
  });

  it('accepts exactly 2000 characters', async () => {
    const { res } = await post('x'.repeat(2000));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it.each([['empty', ''], ['blank', '   \n'], ['too long', 'x'.repeat(2001)], ['non-string', 42], ['missing', undefined]])(
    'rejects %s text', async (_n, text) => {
      const { res, calls } = await post(text);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid_text' });
      expect(calls.some((c) => c.sql.includes('INSERT INTO session_comments'))).toBe(false);
    });

  it('counts the length after trimming', async () => {
    const { res } = await post(`  ${'x'.repeat(2000)}  `);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
