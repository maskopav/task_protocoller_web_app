import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

const { executeQuery } = await import('../db/queryHelper.js');
const {
  getUserSiteAssignments,
  assignUserToSite,
  removeUserSiteAssignment,
} = await import('./userSiteController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  executeQuery.mockReset();
});

describe('getUserSiteAssignments', () => {
  it('returns the rows of v_user_site_assignments', async () => {
    const rows = [{ assignment_id: 1, user_id: 2, site_id: 1, site_name: 'Paris' }];
    executeQuery.mockResolvedValueOnce(rows);

    const res = makeRes();
    await getUserSiteAssignments({}, res);

    expect(executeQuery.mock.calls[0][0]).toContain('v_user_site_assignments');
    expect(res.json).toHaveBeenCalledWith(rows);
  });
});

describe('assignUserToSite', () => {
  it('inserts into user_sites', async () => {
    executeQuery.mockResolvedValueOnce({});

    const res = makeRes();
    await assignUserToSite({ body: { user_id: 2, site_id: 1 } }, res);

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO user_sites');
    expect(params).toEqual([2, 1]);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('maps a duplicate assignment to a 400', async () => {
    executeQuery.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }));

    const res = makeRes();
    await assignUserToSite({ body: { user_id: 2, site_id: 1 } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('removeUserSiteAssignment', () => {
  it('deletes by assignment id', async () => {
    executeQuery.mockResolvedValueOnce({});

    const res = makeRes();
    await removeUserSiteAssignment({ params: { id: 9 } }, res);

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toContain('DELETE FROM user_sites');
    expect(params).toEqual([9]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
