import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

const { executeQuery, executeTransaction } = await import('../db/queryHelper.js');
const { getProtocolsByProjectId, getProtocolById, saveProtocol, archiveProtocol } =
  await import('./protocolController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const ids = (arr) => arr.map((id) => ({ id }));
const master = { id: 1, role: 'master' };
const admin = { id: 2, role: 'admin' };

// Every statement the controller or accessScope can issue, told apart by its
// SQL. Unlisted statements answer [].
const mockWorld = ({
  editors = [], viaClinics = [], canCreate = false,
  projectActive = 1, projectExists = true,
  groupRows = [],          // protocol_group_id lookup: [{project_id}]
  libraryRows = [],        // library author lookup: [{project_id, created_by}]
  nameTaken = false,
  protocolRow = null,      // SELECT * FROM protocols WHERE id (assembleProtocol)
  archiveRow = null,       // archiveProtocol lookup
  firstAuthor = null,      // canWriteProtocol library author
  listRows = [],
} = {}) => {
  executeQuery.mockImplementation(async (sql) => {
    if (sql.includes('FROM project_editors WHERE user_id = ?')) return ids(editors);
    if (sql.includes('DISTINCT sp.project_id')) return ids(viaClinics);
    if (sql.includes('AS flag FROM users')) return [{ flag: canCreate ? 1 : 0 }];
    if (sql.includes('SELECT is_active FROM projects')) return projectExists ? [{ is_active: projectActive }] : [];
    if (sql.includes('SELECT project_id, created_by FROM protocols')) return libraryRows;
    if (sql.includes('FROM protocols WHERE protocol_group_id = ?') && sql.includes('is_archived FROM protocols')) return groupRows;
    if (sql.includes('SELECT created_by FROM protocols WHERE protocol_group_id')) return firstAuthor ? [{ created_by: firstAuthor }] : [];
    if (sql.includes('LOWER(name)')) return nameTaken ? [{ id: 9 }] : [];
    if (sql.includes('SELECT * FROM protocols WHERE id')) return protocolRow ? [{ ...protocolRow }] : [];
    if (sql.includes('SELECT protocol_group_id, project_id, is_archived')) return archiveRow ? [archiveRow] : [];
    if (sql.includes('FROM protocols p') && sql.includes('JOIN languages l ON l.id')) return listRows;
    return [];
  });
};

const isScopeQuery = (sql) =>
  sql.includes('FROM project_editors WHERE user_id = ?') ||
  sql.includes('DISTINCT sp.') ||
  sql.includes('AS flag FROM users');
const mainCalls = () => executeQuery.mock.calls.filter(([sql]) => !isScopeQuery(sql));

beforeEach(() => {
  executeQuery.mockReset();
  executeTransaction.mockReset();
});

describe('getProtocolsByProjectId', () => {
  it('reads the study from the path and groups languages into one item', async () => {
    mockWorld({
      editors: [7],
      listRows: [
        { id: 10, protocol_group_id: 1, name: 'Speech', language_id: 1, language_code: 'en', version: 2, updated_at: '2026-10-01 10:00:00' },
        { id: 11, protocol_group_id: 1, name: 'Speech', language_id: 2, language_code: 'cs', version: 2, updated_at: '2026-10-02 10:00:00' },
        { id: 12, protocol_group_id: 2, name: 'Other', language_id: 1, language_code: 'en', version: 1, updated_at: '2026-09-01 10:00:00' },
      ],
    });

    const res = makeRes();
    await getProtocolsByProjectId({ params: { id: '7' }, query: {}, admin: admin }, res);

    const items = res.json.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0].languages).toEqual([
      { language_id: 1, code: 'en', protocol_id: 10 },
      { language_id: 2, code: 'cs', protocol_id: 11 },
    ]);
    expect(items[0].updated_at).toBe('2026-10-02 10:00:00');
    const [sql, params] = mainCalls().at(-1);
    expect(sql).toContain('p.project_id = ?');
    expect(params).toEqual([7, 0]);
  });

  it('asks for archived groups with archived=1', async () => {
    mockWorld({ editors: [7] });
    await getProtocolsByProjectId({ params: { id: '7' }, query: { archived: '1' }, admin: admin }, makeRes());
    expect(mainCalls().at(-1)[1]).toEqual([7, 1]);
  });

  it('falls back to ?project_id= until the route passes the id', async () => {
    mockWorld({ editors: [7] });
    await getProtocolsByProjectId({ query: { project_id: '7' }, admin: admin }, makeRes());
    expect(mainCalls().at(-1)[1]).toEqual([7, 0]);
  });

  it('never lists library entries (they have no project)', async () => {
    mockWorld({ editors: [7] });
    await getProtocolsByProjectId({ params: { id: '7' }, query: {}, admin: admin }, makeRes());
    const [sql] = mainCalls().at(-1);
    expect(sql).toContain('WHERE p.project_id = ?');
  });

  it('requires a study', async () => {
    const res = makeRes();
    await getProtocolsByProjectId({ params: {}, query: {}, admin: master }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'project_required' });
  });

  it('404s for a study out of scope and skips the scope for a master', async () => {
    mockWorld({ editors: [8] });
    let res = makeRes();
    await getProtocolsByProjectId({ params: { id: '7' }, query: {}, admin: admin }, res);
    expect(res.status).toHaveBeenCalledWith(404);

    executeQuery.mockReset();
    mockWorld({});
    res = makeRes();
    await getProtocolsByProjectId({ params: { id: '7' }, query: {}, admin: master }, res);
    expect(executeQuery.mock.calls.some(([sql]) => isScopeQuery(sql))).toBe(false);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('lets a study received through a clinic list its protocols', async () => {
    mockWorld({ viaClinics: [7] });
    const res = makeRes();
    await getProtocolsByProjectId({ params: { id: '7' }, query: {}, admin: admin }, res);
    expect(res.status).not.toHaveBeenCalledWith(404);
  });
});

describe('getProtocolById', () => {
  const study = { id: 3, protocol_group_id: 1, project_id: 7, is_archived: 0 };
  const library = { id: 4, protocol_group_id: 2, project_id: null, is_archived: 0 };
  const get = (admin_, id = 3) => {
    const res = makeRes();
    return getProtocolById({ params: { id: String(id) }, admin: admin_ }, res).then(() => res);
  };

  it('404s for a protocol outside the caller scope, without confirming it exists', async () => {
    mockWorld({ editors: [8], protocolRow: study });
    const res = await get(admin);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'protocol_not_found' });
  });

  it('serves a received protocol read-only', async () => {
    mockWorld({ viaClinics: [7], protocolRow: study });
    const res = await get(admin);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 3, can_edit: false }));
  });

  it('serves an edited protocol with can_edit', async () => {
    mockWorld({ editors: [7], protocolRow: study });
    const res = await get(admin);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 3, can_edit: true }));
  });

  it('serves a library entry to someone who writes protocols', async () => {
    mockWorld({ editors: [7], protocolRow: library });
    const res = await get(admin, 4);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 4, can_edit: false }));
  });

  it('404s a library entry for a clinician with only received studies', async () => {
    mockWorld({ viaClinics: [7], protocolRow: library });
    const res = await get(admin, 4);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('hides a withdrawn library entry from everyone but master', async () => {
    mockWorld({ editors: [7], protocolRow: { ...library, is_archived: 1 } });
    expect((await get(admin, 4)).status).toHaveBeenCalledWith(404);

    executeQuery.mockReset();
    mockWorld({ protocolRow: { ...library, is_archived: 1 } });
    expect((await get(master, 4)).json).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
  });

  it('skips the scope lookups for a master', async () => {
    mockWorld({ protocolRow: study });
    await get(master);
    expect(executeQuery.mock.calls.some(([sql]) => isScopeQuery(sql))).toBe(false);
  });

  it('404s a protocol that does not exist', async () => {
    mockWorld({});
    expect((await get(master)).status).toHaveBeenCalledWith(404);
  });
});

describe('saveProtocol', () => {
  const body = {
    name: 'P', language_id: [1], project_id: 7, tasks: [{ task_id: 2 }],
    created_by: 99, updated_by: 99,
  };
  const save = (b, admin_) => {
    const res = makeRes();
    return saveProtocol({ body: b, admin: admin_ }, res).then(() => res);
  };

  it('403s a study received through a clinic (the heart of the rule)', async () => {
    mockWorld({ viaClinics: [7] });
    const res = await save(body, admin);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'not_editor' });
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('404s a study the caller cannot see at all', async () => {
    mockWorld({ editors: [8] });
    const res = await save(body, admin);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('404s an unknown study even for a master', async () => {
    mockWorld({ projectExists: false });
    const res = await save(body, master);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('allows an editor of the study', async () => {
    mockWorld({ editors: [7] });
    executeTransaction.mockResolvedValue(123);
    const res = await save(body, admin);
    expect(res.json).toHaveBeenCalledWith({ success: true, protocol_id: 123 });
  });

  it('does not consult the scope for a master', async () => {
    mockWorld({});
    executeTransaction.mockResolvedValue(123);
    await save(body, master);
    expect(executeQuery.mock.calls.some(([sql]) => isScopeQuery(sql))).toBe(false);
    expect(executeTransaction).toHaveBeenCalled();
  });

  it('refuses an inactive study ahead of any write', async () => {
    mockWorld({ editors: [7], projectActive: 0 });
    const res = await save(body, admin);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'project_inactive' });
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('rejects a name already used in the study with 400 name_taken', async () => {
    mockWorld({ editors: [7], nameTaken: true });
    const res = await save(body, admin);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'name_taken' });
    const [sql, params] = executeQuery.mock.calls.find(([q]) => q.includes('LOWER(name)'));
    expect(sql).toContain('project_id <=> ?');
    expect(params.slice(0, 2)).toEqual(['P', 7]);
  });

  it('rejects an empty task list with a code', async () => {
    const res = await save({ ...body, tasks: [] }, master);
    expect(res.json).toHaveBeenCalledWith({ error: 'no_tasks' });
  });

  it('maps a duplicate-key error from the unique index to name_taken', async () => {
    mockWorld({ editors: [7] });
    executeTransaction.mockRejectedValue({ errno: 1062, message: 'dup' });
    const res = await save(body, admin);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'name_taken' });
  });

  it('inserts with project_id and no project_protocols link', async () => {
    mockWorld({ editors: [7] });
    const conn = { query: vi.fn(async (sql) => (sql.includes('MAX(protocol_group_id)') ? [[{ next_group_id: 4 }]] : [{ insertId: 55 }])) };
    executeTransaction.mockImplementation(async (cb) => cb(conn));

    await save(body, admin);

    const insert = conn.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO protocols'));
    expect(insert[0]).toContain('project_id');
    expect(insert[1].slice(0, 3)).toEqual([4, 7, null]);
    expect(conn.query.mock.calls.some(([sql]) => sql.includes('project_protocols'))).toBe(false);
  });

  describe('cross-project group guard', () => {
    const editBody = { ...body, protocol_group_id: 5, editingMode: true };

    it('refuses a group that belongs to another study, for a master too (404 for others, no enumeration)', async () => {
      mockWorld({ editors: [7], groupRows: [{ project_id: 1 }] });
      expect((await save(editBody, admin)).status).toHaveBeenCalledWith(404);

      executeQuery.mockReset();
      mockWorld({ groupRows: [{ project_id: 1 }] });
      const res = await save(editBody, master);
      expect(res.json).toHaveBeenCalledWith({ error: 'wrong_project' });
      expect(executeTransaction).not.toHaveBeenCalled();
    });

    it('refuses a library group saved into a study', async () => {
      mockWorld({ editors: [7], groupRows: [{ project_id: null }] });
      expect((await save(editBody, admin)).status).toHaveBeenCalledWith(404);
    });

    it('refuses to save into an archived group instead of reviving it', async () => {
      mockWorld({ editors: [7], groupRows: [{ project_id: 7, is_current: 1, is_archived: 1 }] });
      const res = await save(editBody, admin);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'protocol_archived' });
      expect(executeTransaction).not.toHaveBeenCalled();
    });

    it('checks the name against other groups when editing (rename clash)', async () => {
      mockWorld({ editors: [7], groupRows: [{ project_id: 7, is_current: 1, is_archived: 0 }], nameTaken: true });
      const res = await save(editBody, admin);
      expect(res.json).toHaveBeenCalledWith({ error: 'name_taken' });
      const nameSql = executeQuery.mock.calls.map(([sql]) => sql).find((sql) => sql.includes('LOWER(name)'));
      expect(nameSql).toContain('protocol_group_id <> ?');
    });

    it('allows a group that belongs to the target study, and a brand-new group', async () => {
      executeTransaction.mockResolvedValue(123);
      mockWorld({ editors: [7], groupRows: [{ project_id: 7 }, { project_id: 7 }] });
      await save(editBody, admin);
      expect(executeTransaction).toHaveBeenCalledTimes(1);

      executeQuery.mockReset();
      mockWorld({ editors: [7], groupRows: [] });
      await save(editBody, admin);
      expect(executeTransaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('library entries (no project_id)', () => {
    const libBody = { ...body, project_id: null, protocol_group_id: 9, editingMode: true };

    it('needs an existing group: entries are created by sharing', async () => {
      const res = await save({ ...body, project_id: null }, master);
      expect(res.json).toHaveBeenCalledWith({ error: 'project_required' });
    });

    it('lets the author save a new version', async () => {
      mockWorld({ editors: [7], libraryRows: [{ project_id: null, created_by: 2 }], groupRows: [{ project_id: null }] });
      executeTransaction.mockResolvedValue(77);
      const res = await save(libBody, admin);
      expect(res.json).toHaveBeenCalledWith({ success: true, protocol_id: 77 });
    });

    it('403s another library user who is not the author', async () => {
      mockWorld({ editors: [7], libraryRows: [{ project_id: null, created_by: 5 }] });
      const res = await save(libBody, admin);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'not_author' });
    });

    it('404s someone without library access', async () => {
      mockWorld({ viaClinics: [7], libraryRows: [{ project_id: null, created_by: 2 }] });
      expect((await save(libBody, admin)).status).toHaveBeenCalledWith(404);
    });

    it('lets a master save any entry, and 404s an unknown group', async () => {
      mockWorld({ libraryRows: [{ project_id: null, created_by: 5 }], groupRows: [{ project_id: null }] });
      executeTransaction.mockResolvedValue(78);
      expect((await save(libBody, master)).json).toHaveBeenCalledWith({ success: true, protocol_id: 78 });

      executeQuery.mockReset();
      mockWorld({ libraryRows: [] });
      expect((await save(libBody, master)).status).toHaveBeenCalledWith(404);
    });
  });
});

describe('archiveProtocol', () => {
  const studyRow = { protocol_group_id: 1, project_id: 7, is_archived: 0 };
  const archive = (admin_) => {
    const res = makeRes();
    return archiveProtocol({ params: { id: '3' }, admin: admin_ }, res).then(() => res);
  };

  it('404s a protocol that does not exist', async () => {
    mockWorld({});
    expect((await archive(master)).status).toHaveBeenCalledWith(404);
  });

  it('404s for a caller who cannot see the study', async () => {
    mockWorld({ editors: [8], archiveRow: studyRow });
    expect((await archive(admin)).status).toHaveBeenCalledWith(404);
  });

  it('403s for read-only access inherited through a clinic', async () => {
    mockWorld({ viaClinics: [7], archiveRow: studyRow });
    const res = await archive(admin);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('archives the whole group for an editor and keeps the project link', async () => {
    mockWorld({ editors: [7], archiveRow: studyRow });
    const conn = { query: vi.fn(async () => [{}]) };
    executeTransaction.mockImplementation(async (cb) => cb(conn));

    const res = await archive(admin);

    expect(res.json).toHaveBeenCalledWith({ success: true });
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain('is_archived = 1');
    expect(sql).not.toContain('project_protocols');
    expect(params).toEqual([1]);
  });

  it('lets a master archive without any assignment', async () => {
    mockWorld({ archiveRow: studyRow });
    executeTransaction.mockImplementation(async (cb) => cb({ query: vi.fn(async () => [{}]) }));
    expect((await archive(master)).json).toHaveBeenCalledWith({ success: true });
  });

  it('withdraws a library entry for its author only', async () => {
    const lib = { protocol_group_id: 2, project_id: null, is_archived: 0 };
    executeTransaction.mockImplementation(async (cb) => cb({ query: vi.fn(async () => [{}]) }));

    mockWorld({ editors: [7], archiveRow: lib, firstAuthor: 2 });
    expect((await archive(admin)).json).toHaveBeenCalledWith({ success: true });

    executeQuery.mockReset();
    mockWorld({ editors: [7], archiveRow: lib, firstAuthor: 5 });
    const res = await archive(admin);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'not_author' });
  });
});
