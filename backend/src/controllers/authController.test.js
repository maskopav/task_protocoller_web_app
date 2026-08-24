import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRES_IN = '8h';
});

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

const { executeQuery } = await import('../db/queryHelper.js');
const bcrypt = (await import('bcrypt')).default;
const { adminLogin } = await import('./authController.js');
const { verifyAdminToken } = await import('../utils/jwt.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const dbUser = {
  id: 3,
  email: 'master@test.com',
  password_hash: 'hashed',
  full_name: 'Master User',
  role_id: 1,
  role: 'master',
  is_active: 1,
  must_change_password: 0,
};

describe('adminLogin', () => {
  beforeEach(() => {
    executeQuery.mockReset();
    bcrypt.compare.mockReset();
  });

  it('returns a user object and a token that verifies as that user on success', async () => {
    executeQuery.mockResolvedValueOnce([dbUser]);
    bcrypt.compare.mockResolvedValueOnce(true);

    const req = { body: { email: dbUser.email, password: 'correct-password' } };
    const res = makeRes();

    await adminLogin(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledOnce();

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.user).toMatchObject({ id: dbUser.id, email: dbUser.email, role: 'master' });
    expect(typeof payload.token).toBe('string');

    const decoded = verifyAdminToken(payload.token);
    expect(decoded).toMatchObject({ id: dbUser.id, email: dbUser.email, role: 'master', role_id: 1 });
  });

  it('returns 401 and no token for a wrong password', async () => {
    executeQuery.mockResolvedValueOnce([dbUser]);
    bcrypt.compare.mockResolvedValueOnce(false);

    const req = { body: { email: dbUser.email, password: 'wrong-password' } };
    const res = makeRes();

    await adminLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    const payload = res.json.mock.calls[0][0];
    expect(payload.token).toBeUndefined();
  });

  it('returns 401 and no token when the email does not exist', async () => {
    executeQuery.mockResolvedValueOnce([]);

    const req = { body: { email: 'nobody@test.com', password: 'whatever' } };
    const res = makeRes();

    await adminLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(bcrypt.compare).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.token).toBeUndefined();
  });

  it('returns 403 and no token for a deactivated account, without checking the password', async () => {
    executeQuery.mockResolvedValueOnce([{ ...dbUser, is_active: 0 }]);

    const req = { body: { email: dbUser.email, password: 'correct-password' } };
    const res = makeRes();

    await adminLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(bcrypt.compare).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.token).toBeUndefined();
  });
});
