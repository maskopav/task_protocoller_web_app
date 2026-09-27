import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queryHelper.js', () => ({ executeQuery: vi.fn() }));
vi.mock('../utils/emailService.js', () => ({ sendAdminWelcomeEmail: vi.fn() }));

const { executeQuery } = await import('../db/queryHelper.js');
const { toggleUserStatus, updateUser } = await import('./userController.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => executeQuery.mockReset());

describe.each([
  ['toggleUserStatus', toggleUserStatus, { user_id: 1, is_active: 0 }],
  ['updateUser', updateUser, { user_id: 1, email: 'hijack@test.com' }],
])('%s', (_name, handler, body) => {
  it('refuses to act on a master account', async () => {
    executeQuery.mockResolvedValueOnce([{ role: 'master' }]);

    const res = makeRes();
    await handler({ body, admin: { id: 9, role: 'master' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(executeQuery).toHaveBeenCalledOnce();
  });

  it('404s for an unknown user', async () => {
    executeQuery.mockResolvedValueOnce([]);

    const res = makeRes();
    await handler({ body, admin: { id: 9, role: 'master' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('updates a regular admin', async () => {
    executeQuery.mockResolvedValueOnce([{ role: 'admin' }]).mockResolvedValueOnce({});

    const res = makeRes();
    await handler({ body, admin: { id: 9, role: 'master' } }, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(executeQuery).toHaveBeenCalledTimes(2);
  });
});
