import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({ executeQuery: vi.fn() }));
vi.mock('../utils/accessScope.js', () => ({
  canEditProject: vi.fn(),
  getVisibleProjectIds: vi.fn(),
  getVisibleSiteIds: vi.fn(),
}));

const { executeQuery } = await import('../db/queryHelper.js');
const { canEditProject, getVisibleProjectIds, getVisibleSiteIds } = await import('../utils/accessScope.js');
const { listEditors, addEditor, removeEditor, putRunsAt, deleteRunsAt } = await import('./projectEditorController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};
const master = { id: 1, role: 'master' };
const user = { id: 7, role: 'admin' };
const req = (admin, params = {}, body = {}) => ({ admin, params, body, query: {} });

// SQL -> rows dispatcher; `projects` empty means the study does not exist.
let db;
const calls = (fragment) => executeQuery.mock.calls.filter(([sql]) => sql.includes(fragment));
beforeEach(() => {
  vi.resetAllMocks();
  db = { projects: [{ id: 3, created_by: 7 }], editors: [{ user_id: 7 }, { user_id: 8 }], users: [], sites: [{ id: 5 }] };
  executeQuery.mockImplementation(async (sql) => {
    if (sql.includes('FROM projects')) return db.projects;
    if (sql.includes('FROM project_editors pe')) return db.editors.map((e) => ({ ...e, full_name: 'N', email: 'e@x', created_at: 't' }));
    if (sql.includes('SELECT user_id FROM project_editors')) return db.editors;
    if (sql.includes('SELECT created_at FROM project_editors')) return db.grant ? [db.grant] : [];
    if (sql.includes('INSERT IGNORE INTO project_editors')) return { affectedRows: db.alreadyEditor ? 0 : 1 };
    if (sql.includes('FROM users')) return db.users;
    if (sql.includes('FROM sites')) return db.sites;
    return {};
  });
  canEditProject.mockResolvedValue(true);
  getVisibleProjectIds.mockResolvedValue([3]);
  getVisibleSiteIds.mockResolvedValue([5]);
});

describe('access semantics shared by every endpoint', () => {
  it('404 for a study that does not exist', async () => {
    db.projects = [];
    const res = makeRes();
    await listEditors(req(master, { id: '99' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('404 for a study the caller cannot see (never 403)', async () => {
    canEditProject.mockResolvedValue(false);
    getVisibleProjectIds.mockResolvedValue([]);
    const res = makeRes();
    await listEditors(req(user, { id: '3' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('403 for a visible study the caller may not edit', async () => {
    canEditProject.mockResolvedValue(false);
    const res = makeRes();
    await addEditor(req(user, { id: '3' }, { email: 'a@b.cz' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(calls('INSERT')).toHaveLength(0);
  });

  it('master skips the access lookups', async () => {
    const res = makeRes();
    await listEditors(req(master, { id: '3' }), res);
    expect(canEditProject).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toHaveLength(2);
  });
});

describe('listEditors', () => {
  it('flags the creator', async () => {
    const res = makeRes();
    await listEditors(req(user, { id: '3' }), res);
    const rows = res.json.mock.calls[0][0];
    expect(rows.find((r) => r.user_id === 7).is_creator).toBe(true);
    expect(rows.find((r) => r.user_id === 8).is_creator).toBe(false);
  });
});

describe('addEditor', () => {
  it('adds a user found by exact email', async () => {
    db.users = [{ id: 9, full_name: 'Eve', email: 'eve@x.cz' }];
    const res = makeRes();
    await addEditor(req(user, { id: '3' }, { email: ' eve@x.cz ' }), res);
    const [, params] = calls('FROM users')[0];
    expect(params).toEqual(['eve@x.cz']);
    expect(calls('INSERT IGNORE INTO project_editors')[0][1]).toEqual([9, 3]);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('F-100: a new editor answers 201 with a real ISO added_at', async () => {
    db.users = [{ id: 9, full_name: 'Eve', email: 'eve@x.cz' }];
    db.grant = { created_at: '2026-10-30 08:15:00' };
    const res = makeRes();
    await addEditor(req(user, { id: '3' }, { email: 'eve@x.cz' }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0]).toMatchObject({ user_id: 9, added_at: '2026-10-30T08:15:00Z' });
  });

  it('F-100: re-adding an existing editor answers 200 with the existing grant and its added_at', async () => {
    db.users = [{ id: 8, full_name: 'Bob', email: 'bob@x.cz' }];
    db.alreadyEditor = true;
    db.grant = { created_at: '2026-10-01 10:00:00' };
    const res = makeRes();
    await addEditor(req(user, { id: '3' }, { email: 'bob@x.cz' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.status).not.toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ user_id: 8, email: 'bob@x.cz', added_at: '2026-10-01T10:00:00Z' });
    expect(body.added_at).not.toBeNull();
  });

  it('404 user_not_found for an unknown email', async () => {
    const res = makeRes();
    await addEditor(req(user, { id: '3' }, { email: 'nobody@x.cz' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'user_not_found' });
    expect(calls('INSERT')).toHaveLength(0);
  });

  it('400 invalid_email without a usable email', async () => {
    const res = makeRes();
    await addEditor(req(user, { id: '3' }, {}), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_email' });
  });
});

describe('removeEditor', () => {
  it('removes a co-editor', async () => {
    const res = makeRes();
    await removeEditor(req(user, { id: '3', userId: '8' }), res);
    expect(calls('DELETE FROM project_editors')[0][1]).toEqual([3, 8]);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('400 cannot_remove_creator', async () => {
    const res = makeRes();
    await removeEditor(req(master, { id: '3', userId: '7' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'cannot_remove_creator' });
    expect(calls('DELETE')).toHaveLength(0);
  });

  it('400 last_editor when only one editor is left', async () => {
    db.editors = [{ user_id: 8 }];
    const res = makeRes();
    await removeEditor(req(master, { id: '3', userId: '8' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'last_editor' });
  });

  it('404 for a user who is not an editor', async () => {
    const res = makeRes();
    await removeEditor(req(user, { id: '3', userId: '55' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('403 for a non-editor', async () => {
    canEditProject.mockResolvedValue(false);
    const res = makeRes();
    await removeEditor(req(user, { id: '3', userId: '8' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(calls('DELETE')).toHaveLength(0);
  });
});

describe('runs-at', () => {
  it('editor who sees the clinic toggles it on and off', async () => {
    const on = makeRes();
    await putRunsAt(req(user, { id: '3', siteId: '5' }), on);
    expect(calls('INSERT IGNORE INTO site_projects')[0][1]).toEqual([5, 3]);
    expect(on.json).toHaveBeenCalledWith({ success: true, runs_at: true });

    const off = makeRes();
    await deleteRunsAt(req(user, { id: '3', siteId: '5' }), off);
    expect(calls('DELETE FROM site_projects')[0][1]).toEqual([5, 3]);
    expect(off.json).toHaveBeenCalledWith({ success: true, runs_at: false });
    // Both directions bump the clinic's config version, so its computers refresh.
    expect(calls('UPDATE sites SET updated_at')).toHaveLength(2);
    expect(calls('UPDATE sites SET updated_at')[0][1]).toEqual([5]);
  });

  it('403 for a non-editor, nothing written', async () => {
    canEditProject.mockResolvedValue(false);
    const res = makeRes();
    await putRunsAt(req(user, { id: '3', siteId: '5' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(calls('site_projects')).toHaveLength(0);
  });

  it('404 for an editor who does not see the clinic', async () => {
    getVisibleSiteIds.mockResolvedValue([6]);
    const res = makeRes();
    await putRunsAt(req(user, { id: '3', siteId: '5' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(calls('site_projects')).toHaveLength(0);

    const del = makeRes();
    await deleteRunsAt(req(user, { id: '3', siteId: '5' }), del);
    expect(del.status).toHaveBeenCalledWith(404);
  });

  it('master needs only an existing clinic', async () => {
    const res = makeRes();
    await putRunsAt(req(master, { id: '3', siteId: '5' }), res);
    expect(getVisibleSiteIds).not.toHaveBeenCalled();
    expect(calls('INSERT IGNORE INTO site_projects')).toHaveLength(1);

    db.sites = [];
    const missing = makeRes();
    await putRunsAt(req(master, { id: '3', siteId: '5' }), missing);
    expect(missing.status).toHaveBeenCalledWith(404);
  });
});
