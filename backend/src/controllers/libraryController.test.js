import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({ executeQuery: vi.fn(), executeTransaction: vi.fn() }));
vi.mock('../utils/accessScope.js', () => ({
  canEditProject: vi.fn(),
  canUseLibrary: vi.fn(),
  getVisibleProjectIds: vi.fn(),
}));
vi.mock('./protocolController.js', () => ({ assembleProtocol: vi.fn() }));

const { executeQuery, executeTransaction } = await import('../db/queryHelper.js');
const { canEditProject, canUseLibrary, getVisibleProjectIds } = await import('../utils/accessScope.js');
const { assembleProtocol } = await import('./protocolController.js');
const { listLibrary, getLibraryEntry, shareProtocol, copyFromLibrary, withdrawEntry } =
  await import('./libraryController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};
const master = { id: 1, role: 'master' };
const user = { id: 7, role: 'admin' };
const req = (admin, { params = {}, body = {}, query = {} } = {}) => ({ admin, params, body, query });
const calls = (fragment) => executeQuery.mock.calls.filter(([sql]) => sql.includes(fragment));

// A fake transaction connection: records statements, answers the few SELECTs.
let conn;
let nextId;
beforeEach(() => {
  vi.resetAllMocks();
  nextId = 100;
  conn = {
    query: vi.fn(async (sql) => {
      if (sql.includes('COALESCE(MAX(protocol_group_id)')) return [[{ next_id: 50 }]];
      if (sql.includes('MAX(version)')) return [[{ max_v: 2 }]];
      if (sql.startsWith('INSERT')) return [{ insertId: nextId++ }];
      if (sql.includes('FROM protocol_tasks')) return [[{ id: 11 }]];
      if (sql.includes('FROM protocol_contents')) return [[{ protocol_task_id: 11, content_type: 'info', text_html: 'x' }]];
      return [[]];
    }),
  };
  executeTransaction.mockImplementation(async (fn) => fn(conn));
  canUseLibrary.mockResolvedValue(true);
  canEditProject.mockResolvedValue(true);
  getVisibleProjectIds.mockResolvedValue([3]);
});

describe('library access', () => {
  it('403 on GET /library for a user who may not write protocols', async () => {
    canUseLibrary.mockResolvedValue(false);
    const res = makeRes();
    await listLibrary(req(user), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('master does not need canUseLibrary', async () => {
    executeQuery.mockResolvedValue([]);
    const res = makeRes();
    await listLibrary(req(master), res);
    expect(canUseLibrary).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([]);
  });
});

describe('listLibrary', () => {
  const row = (o) => ({
    id: 1, protocol_group_id: 9, name: 'Speech', description: null, version: 1, updated_at: 't',
    created_by: 7, author: 'Ann', language_code: 'en', n_tasks: 3, used_in: 2, ...o,
  });

  it('groups language variants into one item and only lists live current entries', async () => {
    executeQuery.mockResolvedValue([row({}), row({ id: 2, language_code: 'cs' })]);
    const res = makeRes();
    await listLibrary(req(user), res);
    const [sql] = executeQuery.mock.calls[0];
    expect(sql).toContain('p.project_id IS NULL');
    expect(sql).toContain('p.is_archived = 0');
    expect(sql).toContain('p.is_current = 1');
    const items = res.json.mock.calls[0][0];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ languages: ['en', 'cs'], used_in: 2, is_author: true, protocol_ids: { en: 1, cs: 2 } });
  });

  it('applies mine, q (escaped) and lang', async () => {
    executeQuery.mockResolvedValue([row({}), row({ protocol_group_id: 10, id: 5, language_code: 'de' })]);
    const res = makeRes();
    await listLibrary(req(user, { query: { mine: '1', q: '50%', lang: 'de' } }), res);
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toContain('p.created_by = ?');
    expect(params).toEqual([7, '%50\\%%', '%50\\%%']);
    expect(res.json.mock.calls[0][0].map((i) => i.protocol_group_id)).toEqual([10]);
  });
});

describe('getLibraryEntry', () => {
  it('404 for a withdrawn or study protocol', async () => {
    executeQuery.mockResolvedValue([]);
    const res = makeRes();
    await getLibraryEntry(req(user, { params: { id: '4' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(executeQuery.mock.calls[0][0]).toContain('project_id IS NULL AND is_archived = 0');
  });

  it('returns the entry with can_edit for its author', async () => {
    executeQuery
      .mockResolvedValueOnce([{ id: 4, protocol_group_id: 9, name: 'S', created_by: 7 }])
      .mockResolvedValueOnce([{ code: 'en', protocol_id: 4 }, { code: 'cs', protocol_id: 5 }])
      .mockResolvedValueOnce([{ author: 'Ann', used_in: 1 }]);
    assembleProtocol.mockResolvedValue({ protocol: { id: 4 }, contentMap: {}, globalFields: { info_text: 'i' }, tasks: [] });
    const res = makeRes();
    await getLibraryEntry(req(user, { params: { id: '4' } }), res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ id: 4, language: ['en', 'cs'], author: 'Ann', used_in: 1, can_edit: true, info_text: 'i' });
  });
});

describe('shareProtocol', () => {
  const study = { id: 20, protocol_group_id: 5, name: 'Speech', project_id: 3 };
  const mockShare = ({ prior = [], clash = [], variants = [{ id: 20 }, { id: 21 }] } = {}) => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, protocol_group_id, name, project_id')) return [study];
      if (sql.includes('is_current = 1 AND is_archived = 0')) return variants;
      if (sql.includes('JOIN protocols s ON s.id = lib.copied_from_id')) return prior;
      if (sql.includes('LOWER(name)')) return clash;
      return [];
    });
  };

  it('copies the current variants into a new library group (version 1, copied_from set)', async () => {
    mockShare();
    const res = makeRes();
    await shareProtocol(req(user, { params: { id: '20' } }), res);
    const inserts = conn.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO protocols'));
    expect(inserts).toHaveLength(2);
    // [groupId, name, version, createdBy, updatedBy, projectId, copiedFromId, sourceId]
    expect(inserts[0][1]).toEqual([50, 'Speech', 1, 7, 7, null, 20, 20]);
    expect(inserts[1][1]).toEqual([50, 'Speech', 1, 7, 7, null, 21, 21]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0]).toMatchObject({ protocol_group_id: 50, version: 1, updated: false, protocol_id: 100 });
  });

  it('adds a new library version when it was shared before, retiring the old current rows', async () => {
    mockShare({ prior: [{ protocol_group_id: 9, created_by: 7 }] });
    const res = makeRes();
    await shareProtocol(req(user, { params: { id: '20' } }), res);
    expect(conn.query.mock.calls.some(([sql]) => sql.includes('SET is_current = 0'))).toBe(true);
    const insert = conn.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO protocols'));
    expect(insert[1].slice(0, 3)).toEqual([9, 'Speech', 3]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ updated: true, version: 3 });
  });

  it('403 when the entry belongs to someone else', async () => {
    mockShare({ prior: [{ protocol_group_id: 9, created_by: 99 }] });
    const res = makeRes();
    await shareProtocol(req(user, { params: { id: '20' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('400 name_taken when another library entry has the name', async () => {
    mockShare({ clash: [{ id: 77 }] });
    const res = makeRes();
    await shareProtocol(req(user, { params: { id: '20' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'name_taken' });
  });

  it('403 for a non-editor who sees the study, 404 when it is out of scope', async () => {
    mockShare();
    canEditProject.mockResolvedValue(false);
    const denied = makeRes();
    await shareProtocol(req(user, { params: { id: '20' } }), denied);
    expect(denied.status).toHaveBeenCalledWith(403);

    getVisibleProjectIds.mockResolvedValue([]);
    const hidden = makeRes();
    await shareProtocol(req(user, { params: { id: '20' } }), hidden);
    expect(hidden.status).toHaveBeenCalledWith(404);
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('404 for a library entry (project_id NULL)', async () => {
    executeQuery.mockResolvedValue([{ id: 20, protocol_group_id: 5, name: 'S', project_id: null }]);
    const res = makeRes();
    await shareProtocol(req(master, { params: { id: '20' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('copyFromLibrary', () => {
  const mockCopy = ({ entry = [{ id: 4, protocol_group_id: 9, name: 'Speech', created_by: 2 }], project = [{ id: 3, is_active: 1 }], taken = [], variants = [{ id: 4 }, { id: 5 }] } = {}) => {
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes('project_id IS NULL AND is_archived = 0') && sql.includes('WHERE id = ?')) return entry;
      if (sql.includes('FROM projects')) return project;
      if (sql.includes('LOWER(name) = LOWER(?)')) return taken;
      if (sql.includes('is_current = 1 AND is_archived = 0')) return variants;
      return [];
    });
  };
  const body = { project_id: 3, name: 'My speech' };

  it('copies all variants into the study with a new group at version 1', async () => {
    mockCopy();
    const res = makeRes();
    await copyFromLibrary(req(user, { params: { id: '5' }, body }), res);
    const inserts = conn.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO protocols'));
    expect(inserts.map(([, p]) => p)).toEqual([
      [50, 'My speech', 1, 7, 7, 3, 4, 4],
      [50, 'My speech', 1, 7, 7, 3, 5, 5],
    ]);
    // the requested row's variant is the one returned: library row 5 -> second copy? entry.id is 4 here
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ protocol_id: 100 });
  });

  it('copies tasks and contents of each variant', async () => {
    mockCopy();
    await copyFromLibrary(req(user, { params: { id: '4' }, body }), makeRes());
    expect(conn.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO protocol_tasks'))).toHaveLength(2);
    expect(conn.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO protocol_contents'))).toHaveLength(2);
  });

  it('400 name_taken when the study already has that name', async () => {
    mockCopy({ taken: [{ id: 1 }] });
    const res = makeRes();
    await copyFromLibrary(req(user, { params: { id: '4' }, body }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'name_taken' });
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('403 when the target study is visible but not editable, 404 when out of scope', async () => {
    mockCopy();
    canEditProject.mockResolvedValue(false);
    const denied = makeRes();
    await copyFromLibrary(req(user, { params: { id: '4' }, body }), denied);
    expect(denied.status).toHaveBeenCalledWith(403);

    getVisibleProjectIds.mockResolvedValue([]);
    const hidden = makeRes();
    await copyFromLibrary(req(user, { params: { id: '4' }, body }), hidden);
    expect(hidden.status).toHaveBeenCalledWith(404);
  });

  it('400 for a missing project or an empty name; 404 for a withdrawn entry', async () => {
    mockCopy();
    const noProject = makeRes();
    await copyFromLibrary(req(user, { params: { id: '4' }, body: { name: 'x' } }), noProject);
    expect(noProject.json).toHaveBeenCalledWith({ error: 'invalid_project' });

    const noName = makeRes();
    await copyFromLibrary(req(user, { params: { id: '4' }, body: { project_id: 3, name: '  ' } }), noName);
    expect(noName.json).toHaveBeenCalledWith({ error: 'invalid_name' });

    mockCopy({ entry: [] });
    const gone = makeRes();
    await copyFromLibrary(req(user, { params: { id: '4' }, body }), gone);
    expect(gone.status).toHaveBeenCalledWith(404);
  });

  it('403 without library access', async () => {
    canUseLibrary.mockResolvedValue(false);
    const res = makeRes();
    await copyFromLibrary(req(user, { params: { id: '4' }, body }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('withdrawEntry', () => {
  it('author withdraws the whole library group, copies are untouched', async () => {
    executeQuery
      .mockResolvedValueOnce([{ id: 4, protocol_group_id: 9, name: 'S', created_by: 7 }])
      .mockResolvedValueOnce({});
    const res = makeRes();
    await withdrawEntry(req(user, { params: { id: '4' } }), res);
    const [sql, params] = executeQuery.mock.calls[1];
    expect(sql).toContain('SET is_archived = 1');
    expect(sql).toContain('project_id IS NULL');
    expect(params).toEqual([9]);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('403 for another user, master may', async () => {
    executeQuery.mockResolvedValue([{ id: 4, protocol_group_id: 9, name: 'S', created_by: 99 }]);
    const denied = makeRes();
    await withdrawEntry(req(user, { params: { id: '4' } }), denied);
    expect(denied.status).toHaveBeenCalledWith(403);

    const ok = makeRes();
    await withdrawEntry(req(master, { params: { id: '4' } }), ok);
    expect(ok.json).toHaveBeenCalledWith({ success: true });
  });
});
