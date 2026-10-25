import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

const { executeQuery } = await import('../db/queryHelper.js');
const {
  getVisibleProjectIds,
  getVisibleSiteIds,
  getVisibleScope,
  getEditableProjectIds,
  canEditProject,
  canUseLibrary,
  canCreateProjects,
  canCreateSites,
  ownsRecord,
} = await import('./accessScope.js');

// Three lookups, told apart by their SQL:
//   editors     -- project_editors rows (the studies the user may change)
//   sites       -- user_sites rows (the clinics the user has)
//   viaClinics  -- studies running at those clinics
const ids = (arr) => arr.map((id) => ({ id }));

const mockScope = ({ editors = [], sites = [], viaClinics = [] } = {}) => {
  executeQuery.mockImplementation(async (sql) => {
    if (sql.includes('FROM project_editors WHERE user_id = ?') && !sql.includes('project_id = ?')) return ids(editors);
    if (sql.includes('DISTINCT sp.project_id')) return ids(viaClinics);
    if (sql.includes('FROM user_sites WHERE user_id')) return ids(sites);
    throw new Error(`Unexpected query: ${sql}`);
  });
};

beforeEach(() => {
  executeQuery.mockReset();
});

describe('getVisibleProjectIds', () => {
  it('unions the studies I edit with the ones running at my clinics', async () => {
    mockScope({ editors: [7], viaClinics: [8, 9] });
    expect(await getVisibleProjectIds(2)).toEqual([7, 8, 9]);
  });

  it('does not duplicate a study reachable both ways', async () => {
    mockScope({ editors: [7], viaClinics: [7, 8] });
    expect(await getVisibleProjectIds(2)).toEqual([7, 8]);
  });

  it('returns nothing when the user holds nothing', async () => {
    mockScope({});
    expect(await getVisibleProjectIds(2)).toEqual([]);
  });

  it('never queries for a missing user id', async () => {
    expect(await getVisibleProjectIds(null)).toEqual([]);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('getVisibleSiteIds', () => {
  it('is exactly the clinics assigned in user_sites', async () => {
    mockScope({ sites: [6, 8], editors: [3], viaClinics: [1] });
    expect(await getVisibleSiteIds(2)).toEqual([6, 8]);
  });

  it('does not widen with the studies I edit', async () => {
    mockScope({ sites: [], editors: [7] });
    expect(await getVisibleSiteIds(2)).toEqual([]);
    expect(executeQuery.mock.calls.every(([sql]) => !sql.includes('project_editors'))).toBe(true);
  });

  it('never queries for a missing user id', async () => {
    expect(await getVisibleSiteIds(null)).toEqual([]);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('getEditableProjectIds and canEditProject', () => {
  it('returns the studies in project_editors', async () => {
    mockScope({ editors: [7, 8] });
    expect(await getEditableProjectIds(2)).toEqual([7, 8]);
  });

  it('never includes a study reached only through a clinic', async () => {
    // A protocol is shared by every clinic on its study, so inherited access
    // must not let it be rewritten for clinics the caller cannot even see.
    mockScope({ editors: [], viaClinics: [7] });
    expect(await getVisibleProjectIds(2)).toEqual([7]);
    expect(await getEditableProjectIds(2)).toEqual([]);
  });

  it('canEditProject asks for the exact (user, study) pair', async () => {
    executeQuery.mockResolvedValueOnce([{ 1: 1 }]).mockResolvedValueOnce([]);
    expect(await canEditProject(2, 7)).toBe(true);
    expect(await canEditProject(2, 8)).toBe(false);
    expect(executeQuery.mock.calls[0][1]).toEqual([2, 7]);
  });

  it('never queries for a missing id', async () => {
    expect(await getEditableProjectIds(null)).toEqual([]);
    expect(await canEditProject(null, 7)).toBe(false);
    expect(await canEditProject(2, null)).toBe(false);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('created_by grants nothing', () => {
  it('is never consulted while resolving a scope', async () => {
    mockScope({ editors: [7], sites: [1] });

    await getVisibleProjectIds(2);
    await getVisibleSiteIds(2);
    await getEditableProjectIds(2);

    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('created_by'))).toBe(false);
  });

  it('still answers ownsRecord, which is what gates archiving', async () => {
    executeQuery.mockResolvedValueOnce([{ 1: 1 }]);
    expect(await ownsRecord(2, 'projects', 9)).toBe(true);

    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toContain('created_by = ?');
    expect(params).toEqual([9, 2]);
  });

  it('refuses a table name outside the two ownsRecord knows', async () => {
    await expect(ownsRecord(2, 'users', 5)).rejects.toThrow(/unsupported table/);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('getVisibleScope', () => {
  it('resolves both axes at once', async () => {
    mockScope({ editors: [7], sites: [1] });
    expect(await getVisibleScope(2)).toEqual({ projectIds: [7], siteIds: [1] });
  });

  it('coerces ids to numbers so callers can compare against req.params', async () => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('DISTINCT')) return [];
      if (sql.includes('FROM project_editors')) return [{ id: '7' }];
      if (sql.includes('FROM user_sites')) return [{ id: '5' }];
      throw new Error(`Unexpected query: ${sql}`);
    });

    expect(await getVisibleScope(2)).toEqual({ projectIds: [7], siteIds: [5] });
  });
});

// Both creation rights read a plain column on users, so they behave alike.
describe.each([
  ['canCreateProjects', () => canCreateProjects, 'can_create_projects'],
  ['canCreateSites', () => canCreateSites, 'can_create_sites'],
])('%s', (_name, fn, column) => {
  it('is false unless the master switched it on', async () => {
    executeQuery.mockResolvedValueOnce([{ flag: 0 }]);
    expect(await fn()(2)).toBe(false);
  });

  it('is true when the flag is set', async () => {
    executeQuery.mockResolvedValueOnce([{ flag: 1 }]);
    expect(await fn()(2)).toBe(true);

    const [sql] = executeQuery.mock.calls[0];
    expect(sql).toContain(column);
  });

  it('is false for an unknown user, and never asks for a null id', async () => {
    executeQuery.mockResolvedValueOnce([]);
    expect(await fn()(2)).toBe(false);

    executeQuery.mockReset();
    expect(await fn()(null)).toBe(false);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('canUseLibrary', () => {
  it('is true for a user who may create studies', async () => {
    executeQuery.mockResolvedValueOnce([{ flag: 1 }]);
    expect(await canUseLibrary(2)).toBe(true);
  });

  it('is true for an editor of at least one study', async () => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('can_create_projects')) return [{ flag: 0 }];
      if (sql.includes('FROM project_editors')) return ids([7]);
      throw new Error(`Unexpected query: ${sql}`);
    });
    expect(await canUseLibrary(2)).toBe(true);
  });

  it('is false for a clinician who only receives studies', async () => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('can_create_projects')) return [{ flag: 0 }];
      if (sql.includes('FROM project_editors')) return [];
      throw new Error(`Unexpected query: ${sql}`);
    });
    expect(await canUseLibrary(2)).toBe(false);
  });

  it('is false without a user id', async () => {
    expect(await canUseLibrary(null)).toBe(false);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('session scope', async () => {
  const { scopeWhereClause, canSeeSession, canEditSession } = await import('./accessScope.js');

  it('lets a master through without touching the database', async () => {
    expect(scopeWhereClause({ id: 1, role: 'master' })).toEqual({ sql: '1=1', params: [] });
    expect(await canSeeSession({ id: 1, role: 'master' }, { id: 5 })).toBe(true);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('matches nothing without a user id', () => {
    expect(scopeWhereClause({ role: 'admin' }).sql).toBe('1=0');
  });

  it('never selects quarantined sessions for a non-master', () => {
    expect(scopeWhereClause({ id: 2, role: 'admin' }).sql).toContain('us.site_id IS NOT NULL');
  });

  it('depends on the clinic assignment only, never on studies', () => {
    const { sql, params } = scopeWhereClause({ id: 2, role: 'admin' });
    expect(sql).toContain('user_sites');
    expect(sql).not.toContain('project_editors');
    expect(sql).not.toContain('site_projects');
    expect(params).toEqual([2]);
  });

  it('refuses an alias that is not a plain identifier', () => {
    expect(() => scopeWhereClause({ id: 2, role: 'admin' }, 'us; DROP')).toThrow();
  });

  it('evaluates the same predicate for a single row', async () => {
    executeQuery.mockResolvedValueOnce([{ 1: 1 }]).mockResolvedValueOnce([]);
    expect(await canSeeSession({ id: 2, role: 'admin' }, { id: 9 })).toBe(true);
    expect(await canEditSession({ id: 2, role: 'admin' }, { id: 9 })).toBe(false);
    const [, params] = executeQuery.mock.calls[1];
    expect(params).toEqual([9, 2]);
  });

  it('is false for a row without an id', async () => {
    expect(await canEditSession({ id: 2, role: 'admin' }, {})).toBe(false);
  });
});
