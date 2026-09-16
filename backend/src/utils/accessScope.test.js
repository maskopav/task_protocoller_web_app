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
  canCreateProjects,
  canCreateSites,
  ownsRecord,
} = await import('./accessScope.js');

// Five distinct lookups, told apart by their SQL:
//   editable      -- user_projects ... AND can_edit = 1
//   projects      -- user_projects rows (any can_edit)
//   sites         -- user_sites rows
//   viaClinics    -- projects reached through granted clinics
//   viaProjects   -- clinics reached through granted projects, whitelist applied
//
// The whitelist itself lives inside that last query (NOT EXISTS / EXISTS over
// user_project_sites), so these tests treat it as a black box and assert its
// shape; the behaviour is covered against a real database instead.
const ids = (arr) => arr.map((id) => ({ id }));

const mockScope = ({
  editable = null, projects = [], sites = [], viaClinics = [], viaProjects = [],
} = {}) => {
  executeQuery.mockImplementation(async (sql) => {
    if (sql.includes('can_edit = 1')) return ids(editable ?? projects);
    if (sql.includes('DISTINCT sp.project_id')) return ids(viaClinics);
    if (sql.includes('DISTINCT sp.site_id')) return ids(viaProjects);
    if (sql.includes('FROM user_projects WHERE user_id')) return ids(projects);
    if (sql.includes('FROM user_sites WHERE user_id')) return ids(sites);
    throw new Error(`Unexpected query: ${sql}`);
  });
};

beforeEach(() => {
  executeQuery.mockReset();
});

describe('getVisibleProjectIds', () => {
  it('unions granted projects with the ones reached through clinics', async () => {
    mockScope({ projects: [7], viaClinics: [8, 9] });
    expect(await getVisibleProjectIds(2)).toEqual([7, 8, 9]);
  });

  it('does not duplicate a project reachable both ways', async () => {
    mockScope({ projects: [7], viaClinics: [7, 8] });
    expect(await getVisibleProjectIds(2)).toEqual([7, 8]);
  });

  it('keeps a read-only assignment visible', async () => {
    mockScope({ projects: [7], editable: [] });

    expect(await getVisibleProjectIds(2)).toEqual([7]);
    expect(await getEditableProjectIds(2)).toEqual([]);
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
  it('unions granted clinics with the ones reached through projects', async () => {
    mockScope({ sites: [6, 8], viaProjects: [1, 2, 3] });
    expect(await getVisibleSiteIds(2)).toEqual([6, 8, 1, 2, 3]);
  });

  it('does not duplicate a clinic reachable both ways', async () => {
    mockScope({ sites: [1], viaProjects: [1, 2] });
    expect(await getVisibleSiteIds(2)).toEqual([1, 2]);
  });

  it('asks the whitelist question inside the project lookup', async () => {
    // "no whitelist for this project" and "this clinic is not on it" both look
    // like a NULL in a LEFT JOIN, so the query has to use NOT EXISTS / EXISTS.
    mockScope({ sites: [], viaProjects: [] });
    await getVisibleSiteIds(2);

    const [sql] = executeQuery.mock.calls.find(([q]) => q.includes('DISTINCT sp.site_id'));
    expect(sql).toContain('user_project_sites');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('EXISTS');
  });

  it('never queries for a missing user id', async () => {
    expect(await getVisibleSiteIds(null)).toEqual([]);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('getEditableProjectIds', () => {
  it('returns only the assignments carrying can_edit', async () => {
    mockScope({ projects: [7, 8], editable: [7] });
    expect(await getEditableProjectIds(2)).toEqual([7]);
  });

  it('never includes a project reached only through a clinic', async () => {
    // A protocol is shared by every clinic on its project, so inherited access
    // must not let it be rewritten for clinics the caller cannot even see.
    mockScope({ projects: [], editable: [], viaClinics: [7] });

    expect(await getVisibleProjectIds(2)).toEqual([7]);
    expect(await getEditableProjectIds(2)).toEqual([]);
  });

  it('never queries for a missing user id', async () => {
    expect(await getEditableProjectIds(null)).toEqual([]);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('created_by grants nothing', () => {
  it('is never consulted while resolving a scope', async () => {
    // Three earlier versions inferred access from created_by. Each one broke:
    // the grant existed nowhere a master could see or revoke, or it silently
    // switched off a derivation. Access comes from the assignment tables only.
    mockScope({ projects: [7], sites: [1] });

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
    // The table name is interpolated into the SQL, so the whitelist is the
    // thing standing between this helper and an injection.
    await expect(ownsRecord(2, 'users', 5)).rejects.toThrow(/unsupported table/);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('getVisibleScope', () => {
  it('resolves both axes at once', async () => {
    mockScope({ projects: [7], sites: [1], viaProjects: [1, 2] });
    expect(await getVisibleScope(2)).toEqual({ projectIds: [7], siteIds: [1, 2] });
  });

  it('coerces ids to numbers so callers can compare against req.params', async () => {
    // mysql2 can hand back strings depending on column type and driver config;
    // getSiteById compares with Number(id), so the axis must be numeric.
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('DISTINCT')) return [];
      if (sql.includes('FROM user_projects WHERE user_id')) return [{ id: '7' }];
      if (sql.includes('FROM user_sites WHERE user_id')) return [{ id: '5' }];
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
