import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

const { executeQuery } = await import('../db/queryHelper.js');
const { getProjectList, createProject, updateProject } = await import('./projectController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const ids = (arr) => arr.map((id) => ({ id }));

// Everything accessScope asks on the way to a controller's own query. Miss one
// and unrelated assertions start counting it as the main call.
const isScopeQuery = (sql) =>
  sql.includes('FROM user_projects WHERE user_id') ||
  sql.includes('FROM user_sites WHERE user_id') ||
  sql.includes('DISTINCT sp.') ||
  sql.includes('AND created_by = ?') ||
  sql.includes('AS flag FROM users');

const statsRows = [{ project_id: 7, project_name: 'Project A' }];

// Five lookups, told apart by their SQL:
//   ... AND can_edit = 1        -- editable projects
//   DISTINCT sp.project_id      -- projects reached through granted clinics
//   DISTINCT sp.site_id         -- clinics reached through granted projects
//   FROM user_projects WHERE    -- granted projects (any can_edit)
//   FROM user_sites WHERE       -- granted clinics
const mockGrants = ({ projects = [], sites = [], viaClinics = [], editable = null }, rows = statsRows) => {
  executeQuery.mockImplementation(async (sql) => {
    if (sql.includes('can_edit = 1')) return ids(editable ?? projects);
    if (sql.includes('DISTINCT sp.project_id')) return ids(viaClinics);
    if (sql.includes('DISTINCT sp.site_id')) return [];
    if (sql.includes('FROM user_projects WHERE user_id')) return ids(projects);
    if (sql.includes('FROM user_sites WHERE user_id')) return ids(sites);
    return rows;
  });
};

const mainCalls = () => executeQuery.mock.calls.filter(([sql]) => !isScopeQuery(sql));

beforeEach(() => {
  executeQuery.mockReset();
});

describe('getProjectList', () => {
  it('returns every project for a master', async () => {
    executeQuery.mockResolvedValueOnce(statsRows);

    const res = makeRes();
    await getProjectList({ query: {}, admin: { id: 1, role: 'master' } }, res);

    const [sql] = executeQuery.mock.calls[0];
    expect(sql).toBe('SELECT * FROM v_project_summary_stats');
    // can_edit tells the UI whether to render the project read-only.
    expect(res.json).toHaveBeenCalledWith([{ ...statsRows[0], can_edit: true }]);
  });

  it('marks a project reached only through a clinic as not editable', async () => {
    mockGrants({ sites: [1], viaClinics: [7] });

    const res = makeRes();
    await getProjectList({ query: {}, admin: { id: 2, role: 'admin' } }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload[0].can_edit).toBe(false);
  });

  it('marks an explicitly granted project as editable', async () => {
    mockGrants({ projects: [7] });

    const res = makeRes();
    await getProjectList({ query: {}, admin: { id: 2, role: 'admin' } }, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload[0].can_edit).toBe(true);
  });

  it('scopes to the explicit user_projects grant', async () => {
    mockGrants({ projects: [7, 8] });

    const res = makeRes();
    await getProjectList({ query: {}, admin: { id: 2, role: 'admin' } }, res);

    const [sql, params] = mainCalls()[0];
    expect(sql).toContain('WHERE project_id IN (?)');
    expect(params).toEqual([[7, 8]]);
  });

  it('derives projects from the granted sites when no project was specified', async () => {
    // Ticking only a clinic must hand over that clinic's projects.
    mockGrants({ sites: [1], viaClinics: [7, 8] });

    const res = makeRes();
    await getProjectList({ query: {}, admin: { id: 2, role: 'admin' } }, res);

    const [, params] = mainCalls()[0];
    expect(params).toEqual([[7, 8]]);
  });

  it('unions a direct grant with the projects reached through clinics', async () => {
    // Nothing replaces anything any more: a grant on one axis never switches
    // off what the other one reaches. Narrowing is stated in
    // user_project_sites and applies only inside its own project.
    mockGrants({ projects: [7], sites: [1], viaClinics: [8, 9] });

    const res = makeRes();
    await getProjectList({ query: {}, admin: { id: 2, role: 'admin' } }, res);

    expect(mainCalls()[0][1]).toEqual([[7, 8, 9]]);
  });

  it('returns an empty list when the admin has no grant on either axis', async () => {
    mockGrants({});

    const res = makeRes();
    await getProjectList({ query: {}, admin: { id: 2, role: 'admin' } }, res);

    expect(res.json).toHaveBeenCalledWith([]);
    expect(mainCalls()).toHaveLength(0);
  });

  it('ignores a spoofed userId/role in the query string', async () => {
    mockGrants({ projects: [7] });

    const res = makeRes();
    // Claiming to be the master in the query string must change nothing.
    await getProjectList(
      { query: { userId: '1', role: 'master' }, admin: { id: 2, role: 'admin' } },
      res
    );

    const [sql, params] = mainCalls()[0];
    expect(sql).toContain('WHERE project_id IN (?)');
    expect(params).toEqual([[7]]);
  });
});

describe('createProject', () => {
  const body = { name: 'New Study' };

  const mockCreate = ({ allowed = false } = {}) => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('can_create_projects') && sql.includes('FROM users')) {
        return [{ flag: allowed ? 1 : 0 }];
      }
      if (sql.includes('INSERT INTO projects')) return { insertId: 42 };
      return [];
    });
  };

  it('refuses an admin the master has not given the right', async () => {
    mockCreate({ allowed: false });

    const res = makeRes();
    await createProject({ body, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO projects'))).toBe(false);
  });

  it('allows an admin holding can_create_projects', async () => {
    mockCreate({ allowed: true });

    const res = makeRes();
    await createProject({ body, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    const insert = executeQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO projects'));
    expect(insert[1].slice(-2)).toEqual([2, 2]); // created_by / updated_by from the session
  });

  it('grants the creator an explicit, revocable assignment', async () => {
    // Not inferred from created_by: the row is what makes the access show up in
    // the assignments table and lets a master take it away again.
    mockCreate({ allowed: true });

    const res = makeRes();
    await createProject({ body, admin: { id: 2, role: 'admin' } }, res);

    const grant = executeQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO user_projects'));
    expect(grant).toBeTruthy();
    expect(grant[0]).toContain('can_edit');
    expect(grant[1]).toEqual([2, 42]);
  });

  it('does not self-assign for a master, who sees everything anyway', async () => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO projects')) return { insertId: 42 };
      return [];
    });

    const res = makeRes();
    await createProject({ body, admin: { id: 1, role: 'master' } }, res);

    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO user_projects'))).toBe(false);
    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('can_create_projects'))).toBe(false);
  });

  it('rejects a nameless project before checking anything else', async () => {
    executeQuery.mockResolvedValue([]);

    const res = makeRes();
    await createProject({ body: {}, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

// Archiving a project is this app's delete, and it reaches every clinic on the
// project at once (an inactive project drops out of v_site_protocols). can_edit
// is enough to change metadata; flipping is_active is the creator's call.
describe('updateProject', () => {
  const mockRights = ({ editable = [7], owns = false } = {}) => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('can_edit = 1')) return ids(editable);
      if (sql.includes('DISTINCT sp.')) return [];
      if (sql.includes('FROM user_projects WHERE user_id')) return ids(editable);
      if (sql.includes('FROM user_sites WHERE user_id')) return [];
      if (sql.includes('SELECT id FROM') && sql.includes('WHERE created_by')) return [];
      if (sql.includes('AND created_by = ?')) return owns ? [{ 1: 1 }] : [];
      return {};
    });
  };

  it('refuses to archive a project the caller did not create', async () => {
    mockRights({ editable: [7], owns: false });

    const res = makeRes();
    await updateProject({ body: { id: 7, name: 'X', is_active: 0 }, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('UPDATE projects'))).toBe(false);
  });

  it('refuses to restore one either', async () => {
    mockRights({ editable: [7], owns: false });

    const res = makeRes();
    await updateProject({ body: { id: 7, name: 'X', is_active: 1 }, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('still allows metadata edits with can_edit alone', async () => {
    mockRights({ editable: [7], owns: false });

    const res = makeRes();
    await updateProject({ body: { id: 7, name: 'Renamed' }, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('UPDATE projects'))).toBe(true);
  });

  it('lets the creator archive their own project', async () => {
    mockRights({ editable: [7], owns: true });

    const res = makeRes();
    await updateProject({ body: { id: 7, name: 'X', is_active: 0 }, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('UPDATE projects'))).toBe(true);
  });

  it('lets a master archive anything, without an ownership lookup', async () => {
    executeQuery.mockResolvedValue({});

    const res = makeRes();
    await updateProject({ body: { id: 7, name: 'X', is_active: 0 }, admin: { id: 1, role: 'master' } }, res);

    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('AND created_by = ?'))).toBe(false);
    expect(executeQuery.mock.calls.some(([sql]) => sql.includes('UPDATE projects'))).toBe(true);
  });

  it('refuses a project outside the caller edit scope before anything else', async () => {
    mockRights({ editable: [8], owns: true });

    const res = makeRes();
    await updateProject({ body: { id: 7, name: 'X' }, admin: { id: 2, role: 'admin' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
