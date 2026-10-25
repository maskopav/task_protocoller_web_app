import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({ executeQuery: vi.fn(), executeTransaction: vi.fn() }));
vi.mock('../utils/emailService.js', () => ({ sendAdminWelcomeEmail: vi.fn().mockResolvedValue(undefined) }));

const { executeQuery, executeTransaction } = await import('../db/queryHelper.js');
const { sendAdminWelcomeEmail } = await import('../utils/emailService.js');
const { getAllUsers, getUserById, createAdmin, updateUser } = await import('./userController.js');
const { setUserSites } = await import('./userSiteController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};
process.env.FRONTEND_BASE_URL = 'https://example.org/app';
const admin = { id: 9, role: 'master' };

beforeEach(() => {
  executeQuery.mockReset();
  executeTransaction.mockReset();
});

describe('PATCH /users/:id (updateUser)', () => {
  const call = (body, id = '1') => {
    const res = makeRes();
    return updateUser({ params: { id }, body, admin }, res).then(() => res);
  };

  it('refuses to act on a master account', async () => {
    executeQuery.mockResolvedValueOnce([{ role: 'master' }]);
    const res = await call({ is_active: false });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeQuery).toHaveBeenCalledOnce();
  });

  it('404s for an unknown user', async () => {
    executeQuery.mockResolvedValueOnce([]);
    const res = await call({ is_active: false });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('updates only the fields that are present (flags, status, name, email)', async () => {
    executeQuery.mockResolvedValueOnce([{ role: 'admin' }]).mockResolvedValueOnce({});
    const res = await call({ is_active: false, can_create_sites: true, name: ' Ann ', email: 'ann@x.cz' });
    const [sql, params] = executeQuery.mock.calls[1];
    expect(sql).toBe('UPDATE users SET email = ?, full_name = ?, is_active = ?, can_create_sites = ? WHERE id = ?');
    expect(params).toEqual(['ann@x.cz', 'Ann', 0, 1, 1]);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('400 for bad input and for an empty patch', async () => {
    for (const [body, error] of [
      [{ email: 'nope' }, 'invalid_email'],
      [{ name: '' }, 'invalid_name'],
      [{ is_active: 'yes' }, 'invalid_is_active'],
      [{}, 'no_changes'],
    ]) {
      executeQuery.mockReset();
      executeQuery.mockResolvedValueOnce([{ role: 'admin' }]);
      const res = await call(body);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error });
      expect(executeQuery).toHaveBeenCalledOnce();
    }
  });

  it('400 email_taken on a duplicate email', async () => {
    executeQuery.mockResolvedValueOnce([{ role: 'admin' }]).mockRejectedValueOnce(Object.assign(new Error('d'), { code: 'ER_DUP_ENTRY' }));
    const res = await call({ email: 'dup@x.cz' });
    expect(res.json).toHaveBeenCalledWith({ error: 'email_taken' });
  });
});

describe('GET /users and /users/:id', () => {
  it('lists users with their clinics', async () => {
    executeQuery
      .mockResolvedValueOnce([
        { id: 1, email: 'm@x', full_name: 'Master', role: 'master', is_active: 1, can_create_projects: 0, can_create_sites: 0 },
        { id: 2, email: 'a@x', full_name: 'Ann', role: 'admin', is_active: 1, can_create_projects: 1, can_create_sites: 0 },
      ])
      .mockResolvedValueOnce([{ user_id: 2, id: 5, name: 'Paris' }]);
    const res = makeRes();
    await getAllUsers({ admin }, res);
    const users = res.json.mock.calls[0][0];
    expect(users[0]).toMatchObject({ id: 1, role: 'master', sites: [] });
    expect(users[1]).toMatchObject({ id: 2, name: 'Ann', can_create_projects: true, can_create_sites: false, sites: [{ id: 5, name: 'Paris' }] });
    expect(JSON.stringify(users)).not.toMatch(/password|token/i);
  });

  it('returns one user with the studies they edit; 404 when unknown', async () => {
    executeQuery
      .mockResolvedValueOnce([{ id: 2, email: 'a@x', full_name: 'Ann', role: 'admin', is_active: 1, can_create_projects: 0, can_create_sites: 0 }])
      .mockResolvedValueOnce([{ id: 5, name: 'Paris' }])
      .mockResolvedValueOnce([{ id: 3, name: 'Study' }]);
    const res = makeRes();
    await getUserById({ params: { id: '2' }, admin }, res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ id: 2, sites: [{ id: 5 }], studies: [{ id: 3, name: 'Study' }] });

    executeQuery.mockReset();
    executeQuery.mockResolvedValueOnce([]);
    const missing = makeRes();
    await getUserById({ params: { id: '99' }, admin }, missing);
    expect(missing.status).toHaveBeenCalledWith(404);
  });
});

describe('POST /users (createAdmin)', () => {
  const call = (body) => {
    const res = makeRes();
    return createAdmin({ body, admin }, res).then(() => res);
  };

  it('creates the user, assigns clinics and sends the welcome mail', async () => {
    executeQuery
      .mockResolvedValueOnce([]) // email free
      .mockResolvedValueOnce([{ id: 2 }]) // admin role
      .mockResolvedValueOnce({ insertId: 30 }) // insert user
      .mockResolvedValue({});
    const res = await call({ email: 'new@x.cz', name: 'New', site_ids: [5, 5, 6], can_create_projects: true });
    const inserts = executeQuery.mock.calls.filter(([sql]) => sql.includes('INTO user_sites')).map(([, p]) => p);
    expect(inserts).toEqual([[30, 5], [30, 6]]);
    expect(executeQuery.mock.calls[2][1].slice(0, 1)).toEqual(['new@x.cz']);
    expect(sendAdminWelcomeEmail).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, id: 30 });
  });

  it('400 for invalid email, missing name, bad site ids; nothing is written', async () => {
    for (const [body, error] of [
      [{ email: 'nope', name: 'N' }, 'invalid_email'],
      [{ email: 'a@x.cz' }, 'invalid_name'],
      [{ email: 'a@x.cz', name: 'N', site_ids: ['x'] }, 'invalid_site_ids'],
    ]) {
      const res = await call(body);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error });
    }
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('400 email_taken for an existing email', async () => {
    executeQuery.mockResolvedValueOnce([{ id: 1 }]);
    const res = await call({ email: 'a@x.cz', name: 'N' });
    expect(res.json).toHaveBeenCalledWith({ error: 'email_taken' });
  });
});

describe('PUT /users/:id/sites (setUserSites)', () => {
  const call = (id, body) => {
    const res = makeRes();
    return setUserSites({ params: { id }, body, admin }, res).then(() => res);
  };
  let conn;
  beforeEach(() => {
    conn = { query: vi.fn().mockResolvedValue([{}]) };
    executeTransaction.mockImplementation(async (fn) => fn(conn));
  });

  it('replaces the set in one transaction', async () => {
    executeQuery.mockResolvedValueOnce([{ role: 'admin' }]).mockResolvedValueOnce([{ id: 5 }, { id: 6 }]);
    const res = await call('2', { site_ids: [5, 6, 5] });
    expect(conn.query.mock.calls.map(([sql, p]) => [sql.split(' ').slice(0, 3).join(' '), p])).toEqual([
      ['DELETE FROM user_sites', [2]],
      ['INSERT INTO user_sites', [2, 5]],
      ['INSERT INTO user_sites', [2, 6]],
    ]);
    expect(res.json).toHaveBeenCalledWith({ success: true, site_ids: [5, 6] });
  });

  it('an empty list removes every clinic', async () => {
    executeQuery.mockResolvedValueOnce([{ role: 'admin' }]);
    await call('2', { site_ids: [] });
    expect(conn.query).toHaveBeenCalledTimes(1);
  });

  it('400 for a non-array, 400 unknown_site for a missing clinic', async () => {
    const bad = await call('2', { site_ids: 'x' });
    expect(bad.json).toHaveBeenCalledWith({ error: 'invalid_site_ids' });

    executeQuery.mockResolvedValueOnce([{ role: 'admin' }]).mockResolvedValueOnce([{ id: 5 }]);
    const unknown = await call('2', { site_ids: [5, 77] });
    expect(unknown.json).toHaveBeenCalledWith({ error: 'unknown_site' });
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('403 for a master target, 404 for an unknown user', async () => {
    executeQuery.mockResolvedValueOnce([{ role: 'master' }]);
    expect((await call('1', { site_ids: [5] })).status).toHaveBeenCalledWith(403);
    executeQuery.mockResolvedValueOnce([]);
    expect((await call('99', { site_ids: [5] })).status).toHaveBeenCalledWith(404);
  });
});
