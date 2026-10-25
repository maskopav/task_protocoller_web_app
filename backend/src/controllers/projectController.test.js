import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

const { executeQuery, executeTransaction } = await import('../db/queryHelper.js');
const { getProjectList, getProject, createProject, updateProject, archiveProject } =
  await import('./projectController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const ids = (arr) => arr.map((id) => ({ id }));
const master = { id: 1, role: 'master' };
const admin = { id: 2, role: 'admin' };

// What accessScope asks on the way to a controller's own query, told apart by
// its SQL. Anything else is the controller's own statement and returns `rows`.
const mockWorld = ({
  editors = [], viaClinics = [], canCreate = false, owns = false, exists = true, rows = [],
} = {}) => {
  executeQuery.mockImplementation(async (sql) => {
    if (sql.includes('FROM project_editors WHERE user_id = ?')) return ids(editors);
    if (sql.includes('DISTINCT sp.project_id')) return ids(viaClinics);
    if (sql.includes('AS flag FROM users')) return [{ flag: canCreate ? 1 : 0 }];
    if (sql.includes('AND created_by = ?')) return owns ? [{ 1: 1 }] : [];
    if (sql.includes('SELECT id FROM projects WHERE id = ?')) return exists ? [{ id: 1 }] : [];
    return rows;
  });
};

const isScopeQuery = (sql) =>
  sql.includes('FROM project_editors WHERE user_id = ?') ||
  sql.includes('DISTINCT sp.') ||
  sql.includes('AND created_by = ?') ||
  sql.includes('AS flag FROM users') ||
  sql.includes('SELECT id FROM projects WHERE id = ?');
const mainCalls = () => executeQuery.mock.calls.filter(([sql]) => !isScopeQuery(sql));

const row = (over = {}) => ({
  project_id: 7, project_name: 'Project A', created_by: 2, site_count: '2', protocol_count: '3', unreviewed: '1', ...over,
});

beforeEach(() => {
  executeQuery.mockReset();
  executeTransaction.mockReset();
});

describe('getProjectList', () => {
  it('returns every study for a master, all editable', async () => {
    mockWorld({ rows: [row({ created_by: 5 })] });

    const res = makeRes();
    await getProjectList({ query: {}, admin: master }, res);

    const [sql] = mainCalls()[0];
    expect(sql).toContain('v_project_summary_stats');
    expect(sql).not.toContain('IN (?)');
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ project_id: 7, can_edit: true, is_owner: false, site_count: 2, protocol_count: 3, unreviewed: 1 }),
    ]);
  });

  it('scopes a non-master to the studies they edit and the ones at their clinics', async () => {
    mockWorld({ editors: [7], viaClinics: [8], rows: [row(), row({ project_id: 8, created_by: 9 })] });

    const res = makeRes();
    await getProjectList({ query: {}, admin: admin }, res);

    const [sql, params] = mainCalls()[0];
    expect(sql).toContain('IN (?)');
    expect(params.at(-1)).toEqual([7, 8]);
    const items = res.json.mock.calls[0][0];
    expect(items.map((i) => [i.project_id, i.can_edit, i.is_owner])).toEqual([[7, true, true], [8, false, false]]);
  });

  it('limits the unreviewed count to clinics the caller sees', async () => {
    mockWorld({ editors: [7], rows: [row()] });
    await getProjectList({ query: {}, admin: admin }, makeRes());

    const [sql, params] = mainCalls()[0];
    expect(sql).toContain('user_sites usx');
    expect(params[0]).toBe(2);
  });

  it('answers an empty list without a main query when nothing is in scope', async () => {
    mockWorld({});
    const res = makeRes();
    await getProjectList({ query: {}, admin: admin }, res);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(mainCalls()).toHaveLength(0);
  });

  it('500s with a code on a database error', async () => {
    executeQuery.mockRejectedValue(new Error('boom'));
    const res = makeRes();
    await getProjectList({ query: {}, admin: master }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'projects_fetch_failed' });
  });
});

describe('getProject', () => {
  it('404s for a study outside the caller scope', async () => {
    mockWorld({ editors: [7] });
    const res = makeRes();
    await getProject({ params: { id: '99' }, admin: admin }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'project_not_found' });
  });

  it('marks a study received through a clinic as not editable', async () => {
    mockWorld({ viaClinics: [8], rows: [row({ project_id: 8, created_by: 9 })] });
    const res = makeRes();
    await getProject({ params: { id: '8' }, admin: admin }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ project_id: 8, can_edit: false, is_owner: false }));
  });

  it('404s for a master on an unknown study', async () => {
    mockWorld({ rows: [] });
    const res = makeRes();
    await getProject({ params: { id: '99' }, admin: master }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('createProject', () => {
  const body = { name: ' Study X ', description: 'd', countries: 'CZ', contact_persons: 'A', contact_emails: 'a@b.org' };
  const conn = { query: vi.fn() };

  beforeEach(() => {
    conn.query.mockReset();
    conn.query.mockResolvedValueOnce([{ insertId: 42 }]).mockResolvedValue([{}]);
    executeTransaction.mockImplementation(async (cb) => cb(conn));
  });

  it('requires a name', async () => {
    const res = makeRes();
    await createProject({ body: { name: '  ' }, admin: master }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'name_required' });
  });

  it('rejects an invalid contact email', async () => {
    const res = makeRes();
    await createProject({ body: { ...body, contact_emails: 'nope' }, admin: master }, res);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_contact_email' });
  });

  it('403s without the can_create_projects right', async () => {
    mockWorld({ canCreate: false });
    const res = makeRes();
    await createProject({ body, admin: admin }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('makes the creator the first editor', async () => {
    mockWorld({ canCreate: true });
    const res = makeRes();
    await createProject({ body, admin: admin }, res);

    expect(conn.query.mock.calls[0][1][0]).toBe('Study X');
    const [sql, params] = conn.query.mock.calls[1];
    expect(sql).toContain('INSERT INTO project_editors');
    expect(params).toEqual([2, 42]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, id: 42 });
  });

  it('lets a master create without the flag', async () => {
    const res = makeRes();
    await createProject({ body, admin: master }, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, id: 42 });
  });

  it('answers a duplicate name with 400 name_taken', async () => {
    executeTransaction.mockRejectedValue({ errno: 1062 });
    const res = makeRes();
    await createProject({ body, admin: master }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'name_taken' });
  });
});

describe('updateProject', () => {
  const req = (over = {}) => ({ params: { id: '7' }, body: { name: 'New name' }, admin: admin, ...over });

  it('takes the id from the path, not the body', async () => {
    mockWorld({ editors: [7] });
    const res = makeRes();
    await updateProject(req({ body: { id: 99, name: 'New name' } }), res);

    const [, params] = mainCalls().find(([sql]) => sql.includes('UPDATE projects'));
    expect(params.at(-1)).toBe(7);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('404s for a study the caller cannot see', async () => {
    mockWorld({ editors: [8] });
    const res = makeRes();
    await updateProject(req(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mainCalls().some(([sql]) => sql.includes('UPDATE'))).toBe(false);
  });

  it('403s for a received study', async () => {
    mockWorld({ viaClinics: [7] });
    const res = makeRes();
    await updateProject(req(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'not_editor' });
    expect(mainCalls().some(([sql]) => sql.includes('UPDATE'))).toBe(false);
  });

  it('lets a master edit without any assignment', async () => {
    mockWorld({});
    const res = makeRes();
    await updateProject(req({ admin: master }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('keeps archiving to the creator, even for another editor', async () => {
    mockWorld({ editors: [7], owns: false });
    const res = makeRes();
    await updateProject(req({ body: { is_active: false } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'creator_only' });
  });

  it('rejects a blank name and a bad email before touching the database', async () => {
    let res = makeRes();
    await updateProject(req({ body: { name: ' ' } }), res);
    expect(res.json).toHaveBeenCalledWith({ error: 'name_required' });

    res = makeRes();
    await updateProject(req({ body: { contact_emails: 'x' } }), res);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_contact_email' });
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('answers a duplicate name with 400 name_taken', async () => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('UPDATE projects')) throw { code: 'ER_DUP_ENTRY' };
      if (sql.includes('SELECT id FROM projects')) return [{ id: 7 }];
      return [];
    });
    const res = makeRes();
    await updateProject(req({ admin: master }), res);
    expect(res.json).toHaveBeenCalledWith({ error: 'name_taken' });
  });
});

describe('archiveProject', () => {
  const req = (over = {}) => ({ params: { id: '7' }, body: { archived: true }, admin: admin, ...over });

  it('requires a boolean archived flag', async () => {
    const res = makeRes();
    await archiveProject(req({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'archived_required' });
  });

  it('lets the creator archive, which sets is_active to 0', async () => {
    mockWorld({ editors: [7], owns: true });
    const res = makeRes();
    await archiveProject(req(), res);

    const [, params] = mainCalls().find(([sql]) => sql.includes('UPDATE projects'));
    expect(params.slice(5, 8)).toEqual([0, 0, 0]);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('restores with archived false', async () => {
    mockWorld({ editors: [7], owns: true });
    await archiveProject(req({ body: { archived: false } }), makeRes());
    const [, params] = mainCalls().find(([sql]) => sql.includes('UPDATE projects'));
    expect(params.slice(5, 8)).toEqual([1, 1, 1]);
  });

  it('403s for an editor who is not the creator', async () => {
    mockWorld({ editors: [7], owns: false });
    const res = makeRes();
    await archiveProject(req(), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('404s for a study out of scope and lets a master through', async () => {
    mockWorld({});
    let res = makeRes();
    await archiveProject(req(), res);
    expect(res.status).toHaveBeenCalledWith(404);

    res = makeRes();
    await archiveProject(req({ admin: master }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
