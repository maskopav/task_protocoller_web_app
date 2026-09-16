import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

const { executeQuery, executeTransaction } = await import('../db/queryHelper.js');
const { getProjectSiteAccess, setProjectSiteAccess } =
  await import('./userProjectSiteController.js');
const { removeUserProjectAssignment } =
  await import('./userProjectController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  executeQuery.mockReset();
  executeTransaction.mockReset();
});

describe('getProjectSiteAccess', () => {
  // rows = the project's clinics joined against the whitelist;
  // count = how many whitelist rows exist for the pair, asked separately.
  const mock = (rows, count) => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('COUNT(*)')) return [{ n: count }];
      return rows;
    });
  };

  it('reports every clinic as selected when there is no whitelist', async () => {
    mock([{ id: 1, name: 'Paris', restricted_to: 0, granted_directly: 0 }], 0);

    const res = makeRes();
    await getProjectSiteAccess({ params: { userId: '2', projectId: '1' } }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.restricted).toBe(false);
    expect(payload.sites[0].selected).toBe(true);
  });

  it('marks only the whitelisted clinics when one exists', async () => {
    mock([
      { id: 1, name: 'Paris', restricted_to: 1, granted_directly: 0 },
      { id: 2, name: 'London', restricted_to: 0, granted_directly: 0 },
    ], 1);

    const res = makeRes();
    await getProjectSiteAccess({ params: { userId: '2', projectId: '1' } }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.restricted).toBe(true);
    expect(payload.sites.filter((s) => s.selected).map((s) => s.name)).toEqual(['Paris']);
  });

  // The bug: `restricted` used to be derived from the joined rows, which are
  // filtered through site_projects. A whitelist entry for a clinic since
  // unassigned from the project vanished from that join, so the panel said
  // "all clinics" while the resolver still restricted the user to nothing.
  it('still reports restricted when the whitelist points only at clinics no longer on the project', async () => {
    mock([
      { id: 1, name: 'Paris', restricted_to: 0, granted_directly: 0 },
      { id: 3, name: 'Praha', restricted_to: 0, granted_directly: 0 },
    ], 1);

    const res = makeRes();
    await getProjectSiteAccess({ params: { userId: '2', projectId: '1' } }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.restricted).toBe(true);
    expect(payload.sites.filter((s) => s.selected)).toEqual([]);
  });

  it('flags a clinic the user also holds directly', async () => {
    // Unticking such a clinic here will not hide it, and the UI says so.
    mock([{ id: 6, name: 'Mine', restricted_to: 0, granted_directly: 1 }], 0);

    const res = makeRes();
    await getProjectSiteAccess({ params: { userId: '2', projectId: '4' } }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.sites[0].granted_directly).toBe(true);
  });
});

describe('setProjectSiteAccess', () => {
  it('refuses an empty list rather than storing it', async () => {
    // No rows already means "all", so an empty selection would silently widen
    // access to every clinic on the project instead of narrowing it.
    const res = makeRes();
    await setProjectSiteAccess(
      { params: { userId: '2', projectId: '1' }, body: { site_ids: [] } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('refuses a value that is neither an array nor null', async () => {
    const res = makeRes();
    await setProjectSiteAccess(
      { params: { userId: '2', projectId: '1' }, body: { site_ids: 3 } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('refuses clinics that are not on the project', async () => {
    executeQuery.mockResolvedValueOnce([{ site_id: 1 }]);

    const res = makeRes();
    await setProjectSiteAccess(
      { params: { userId: '2', projectId: '1' }, body: { site_ids: [1, 99] } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('clears the whitelist on null, without inserting anything', async () => {
    const queries = [];
    executeTransaction.mockImplementation(async (cb) => {
      await cb({ query: async (sql, params) => { queries.push([sql, params]); return [{}]; } });
    });

    const res = makeRes();
    await setProjectSiteAccess(
      { params: { userId: '2', projectId: '1' }, body: { site_ids: null } },
      res
    );

    expect(queries).toHaveLength(1);
    expect(queries[0][0]).toContain('DELETE FROM user_project_sites');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('replaces the whitelist wholesale rather than merging', async () => {
    executeQuery.mockResolvedValueOnce([{ site_id: 1 }, { site_id: 2 }]);
    const queries = [];
    executeTransaction.mockImplementation(async (cb) => {
      await cb({ query: async (sql, params) => { queries.push([sql, params]); return [{}]; } });
    });

    const res = makeRes();
    await setProjectSiteAccess(
      { params: { userId: '2', projectId: '1' }, body: { site_ids: [1, 2] } },
      res
    );

    expect(queries[0][0]).toContain('DELETE FROM user_project_sites');
    expect(queries.slice(1).map((q) => q[1])).toEqual([['2', '1', 1], ['2', '1', 2]]);
  });
});

describe('removeUserProjectAssignment', () => {
  it('takes the clinic whitelist with it', async () => {
    // Left behind, it silently re-applies the next time the master assigns the
    // same project — the user quietly gets fewer clinics than the project has.
    executeQuery.mockResolvedValueOnce([{ user_id: 2, project_id: 1 }]);
    const queries = [];
    executeTransaction.mockImplementation(async (cb) => {
      await cb({ query: async (sql, params) => { queries.push([sql, params]); return [{}]; } });
    });

    const res = makeRes();
    await removeUserProjectAssignment({ params: { id: '15' } }, res);

    expect(queries[0][0]).toContain('DELETE FROM user_project_sites');
    expect(queries[0][1]).toEqual([2, 1]);
    expect(queries[1][0]).toContain('DELETE FROM user_projects');
  });

  it('404s when the assignment was already gone', async () => {
    executeQuery.mockResolvedValueOnce([]);

    const res = makeRes();
    await removeUserProjectAssignment({ params: { id: '99' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(executeTransaction).not.toHaveBeenCalled();
  });
});
