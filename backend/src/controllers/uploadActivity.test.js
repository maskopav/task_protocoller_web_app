import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({ executeQuery: vi.fn(), executeTransaction: vi.fn() }));
vi.mock('../upload/sessionAccess.js', () => ({
  findScopedSession: vi.fn(),
  writeAudit: vi.fn(),
}));

const { executeQuery } = await import('../db/queryHelper.js');
const { findScopedSession } = await import('../upload/sessionAccess.js');
const { getActivity, activityDetail, getSummary } = await import('./uploadController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};
const SID = 'a'.repeat(32);
const master = { id: 1, role: 'master' };
const admin = { id: 2, role: 'admin' };

beforeEach(() => {
  executeQuery.mockReset();
  findScopedSession.mockReset();
});

describe('activityDetail', () => {
  it('keeps field names of a participant edit but never their values', () => {
    const raw = JSON.stringify({ changes: [{ field: 'patient_code', old: 'SECRET1', new: 'SECRET2' }, { field: 'visit_number', old: '1', new: '2' }] });
    const d = activityDetail('participant_edit', raw);
    expect(d).toEqual({ fields: ['patient_code', 'visit_number'] });
    expect(JSON.stringify(d)).not.toContain('SECRET');
  });

  it('keeps from/to of a qc change, nothing for reveals and downloads', () => {
    expect(activityDetail('qc_change', '{"from":"unreviewed","to":"ok"}')).toEqual({ from: 'unreviewed', to: 'ok' });
    expect(activityDetail('reveal', null)).toBeNull();
    expect(activityDetail('download', '{"clip":"x"}')).toBeNull();
  });
});

describe('GET /uploads/:sid/activity (F-044)', () => {
  it('404 when the session is out of scope (same scoping as getUpload), without querying the audit log', async () => {
    findScopedSession.mockResolvedValue(null);
    const res = makeRes();
    await getActivity({ admin, params: { sessionId: SID } }, res);
    expect(findScopedSession).toHaveBeenCalledWith(admin, SID);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('lists the audit entries of that session, newest first, with who did it', async () => {
    findScopedSession.mockResolvedValue({ id: 42, session_id: SID });
    executeQuery.mockResolvedValue([
      { id: 3, action: 'reveal', details: null, created_at: '2026-10-20 10:00:00', user_id: 2, full_name: 'Ann', email: 'a@x' },
      { id: 2, action: 'qc_change', details: '{"from":"unreviewed","to":"ok"}', created_at: '2026-10-20 09:00:00', user_id: null, full_name: null, email: null },
    ]);
    const res = makeRes();
    await getActivity({ admin, params: { sessionId: SID } }, res);

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toContain('FROM audit_log a');
    expect(sql).toContain('ORDER BY a.created_at DESC');
    expect(params).toEqual([42]);
    expect(res.json).toHaveBeenCalledWith([
      { id: 3, action: 'reveal', at: '2026-10-20T10:00:00Z', user: { id: 2, name: 'Ann' }, detail: null },
      { id: 2, action: 'qc_change', at: '2026-10-20T09:00:00Z', user: null, detail: { from: 'unreviewed', to: 'ok' } },
    ]);
  });
});

describe('GET /uploads/summary unassigned_devices', () => {
  // Everything but the unassigned-computer count is irrelevant here.
  const mockSummary = (unassigned) => executeQuery.mockImplementation(async (sql) => {
    if (sql.includes('FROM devices WHERE site_id IS NULL')) return [{ n: unassigned }];
    if (sql.includes('COUNT(*) AS total')) return [{}];
    return [];
  });

  it('master gets the number of computers without a clinic', async () => {
    mockSummary(3);
    const res = makeRes();
    await getSummary({ admin: master, query: {} }, res);
    expect(res.json.mock.calls[0][0].unassigned_devices).toBe(3);
  });

  it('a non-master does not get the key at all', async () => {
    mockSummary(3);
    const res = makeRes();
    await getSummary({ admin, query: {} }, res);
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('unassigned_devices');
    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('FROM devices'))).toBe(false);
  });
});
