import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({ executeQuery: vi.fn(), executeTransaction: vi.fn() }));
const { executeQuery } = await import('../db/queryHelper.js');
const { findScopedSession, writeAudit } = await import('./sessionAccess.js');

const SID = '76a67cd8af73486da13a7c0e1509bd2f';
beforeEach(() => executeQuery.mockReset());

describe('findScopedSession', () => {
  it('returns null for a malformed id without querying', async () => {
    expect(await findScopedSession({ id: 2, role: 'admin' }, '../x')).toBeNull();
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('scopes the lookup and reports can_edit as a boolean', async () => {
    executeQuery.mockResolvedValueOnce([{ id: 5, session_id: SID, can_edit: 1 }]);
    const row = await findScopedSession({ id: 2, role: 'admin' }, SID);
    expect(row).toMatchObject({ id: 5, can_edit: true });
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toContain('us.site_id IS NOT NULL');
    expect(sql).toContain('user_sites');
    expect(sql).not.toContain('can_edit = 1');
    expect(params).toEqual([2, SID, 2]);
  });

  it('is null when the scope excludes the row (same as missing)', async () => {
    executeQuery.mockResolvedValueOnce([]);
    expect(await findScopedSession({ id: 2, role: 'admin' }, SID)).toBeNull();
  });
});

describe('writeAudit', () => {
  it('stores details as JSON', async () => {
    executeQuery.mockResolvedValueOnce({});
    await writeAudit(3, 'reveal', 5, { fields: ['sex'] });
    expect(executeQuery.mock.calls[0][1]).toEqual([3, 'reveal', 5, '{"fields":["sex"]}']);
  });
});
