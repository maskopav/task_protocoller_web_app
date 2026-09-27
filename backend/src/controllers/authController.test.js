import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.FRONTEND_BASE_URL = 'https://app.example.org/tp/';
  process.env.JWT_EXPIRES_IN = '8h';
});

vi.mock('../db/queryHelper.js', () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

vi.mock('../utils/emailService.js', () => ({
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

const { executeQuery } = await import('../db/queryHelper.js');
const bcrypt = (await import('bcrypt')).default;
const { sendPasswordResetEmail } = await import('../utils/emailService.js');
const { adminLogin, adminForgotPassword, adminResetPassword, setupAdminProfile } =
  await import('./authController.js');
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

  it('returns 401 and no token when the email does not exist, still running bcrypt (no timing oracle)', async () => {
    executeQuery.mockResolvedValueOnce([]);
    bcrypt.compare.mockResolvedValueOnce(false);

    const req = { body: { email: 'nobody@test.com', password: 'whatever' } };
    const res = makeRes();

    await adminLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(bcrypt.compare).toHaveBeenCalledOnce();
    expect(bcrypt.compare.mock.calls[0][1]).toMatch(/^\$2b\$10\$/);
    const payload = res.json.mock.calls[0][0];
    expect(payload.token).toBeUndefined();
  });

  it('returns 403 and no token for a deactivated account with the correct password', async () => {
    executeQuery.mockResolvedValueOnce([{ ...dbUser, is_active: 0 }]);
    bcrypt.compare.mockResolvedValueOnce(true);

    const req = { body: { email: dbUser.email, password: 'correct-password' } };
    const res = makeRes();

    await adminLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    const payload = res.json.mock.calls[0][0];
    expect(payload.token).toBeUndefined();
  });

  it('does not reveal deactivation to someone with the wrong password', async () => {
    executeQuery.mockResolvedValueOnce([{ ...dbUser, is_active: 0 }]);
    bcrypt.compare.mockResolvedValueOnce(false);

    const res = makeRes();
    await adminLogin({ body: { email: dbUser.email, password: 'wrong' } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('input type checks (mysql2 object binding)', () => {
  beforeEach(() => {
    executeQuery.mockReset();
    bcrypt.hash.mockReset();
  });

  it('rejects an object reset token before it reaches the database', async () => {
    // {"reset_password_token":1} used to expand to `reset_password_token` = 1,
    // matching every pending reset.
    const req = { body: { token: { reset_password_token: 1 }, password: 'longenough' } };
    const res = makeRes();

    await adminResetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('rejects a too-short password on reset', async () => {
    const res = makeRes();
    await adminResetPassword({ body: { token: 'abc', password: 'short' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('rejects an object email on login', async () => {
    const res = makeRes();
    await adminLogin({ body: { email: { email: 1 }, password: 'x' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('adminForgotPassword', () => {
  beforeEach(() => {
    executeQuery.mockReset();
    sendPasswordResetEmail.mockReset();
  });

  it('builds the reset link from FRONTEND_BASE_URL, ignoring Referer and Origin', async () => {
    executeQuery.mockResolvedValueOnce([{ id: 3 }]).mockResolvedValueOnce({});

    const req = {
      body: { email: 'victim@test.com' },
      headers: { referer: 'https://evil.example/', origin: 'https://evil.example' },
    };
    const res = makeRes();

    await adminForgotPassword(req, res);

    expect(sendPasswordResetEmail).toHaveBeenCalledOnce();
    const link = sendPasswordResetEmail.mock.calls[0][1];
    expect(link).toMatch(/^https:\/\/app\.example\.org\/tp\/#\/admin\/reset-password\/[0-9a-f]{64}$/);
    expect(link).not.toContain('evil');
  });

  it('does not crash when the request carries no Referer or Origin', async () => {
    executeQuery.mockResolvedValueOnce([{ id: 3 }]).mockResolvedValueOnce({});

    const res = makeRes();
    await adminForgotPassword({ body: { email: 'a@test.com' }, headers: {} }, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});

describe('setupAdminProfile', () => {
  beforeEach(() => {
    executeQuery.mockReset();
    bcrypt.hash.mockReset();
    bcrypt.hash.mockResolvedValue('new-hash');
  });

  it('updates the caller\'s own account, ignoring any userId in the body', async () => {
    executeQuery
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce([{ id: 7, email: 'a@test.com', role_id: 2, role: 'admin', token_version: 4 }]);

    const req = { admin: { id: 7, role: 'admin' }, body: { userId: 1, fullName: 'N', password: 'longenough' } };
    const res = makeRes();

    await setupAdminProfile(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const [sql, params] = executeQuery.mock.calls[0];
    expect(sql).toContain('must_change_password = 1');
    expect(params[params.length - 1]).toBe(7);
    expect(sql).toContain('token_version = token_version + 1');
  });

  it('returns a fresh token carrying the bumped token_version', async () => {
    executeQuery
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce([{ id: 7, email: 'a@test.com', role_id: 2, role: 'admin', token_version: 4 }]);

    const res = makeRes();
    await setupAdminProfile({ admin: { id: 7 }, body: { password: 'longenough' } }, res);

    const { token } = res.json.mock.calls[0][0];
    expect(verifyAdminToken(token)).toMatchObject({ id: 7, tv: 4 });
  });

  it('refuses once the temporary password has already been replaced', async () => {
    executeQuery.mockResolvedValueOnce({ affectedRows: 0 });

    const res = makeRes();
    await setupAdminProfile({ admin: { id: 7 }, body: { password: 'longenough' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('401s without an authenticated caller', async () => {
    const res = makeRes();
    await setupAdminProfile({ body: { userId: 1, password: 'longenough' } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('password reset token storage and session invalidation', () => {
  beforeEach(() => {
    executeQuery.mockReset();
    bcrypt.hash.mockReset();
    bcrypt.hash.mockResolvedValue('new-hash');
    sendPasswordResetEmail.mockReset();
  });

  it('stores only the sha256 of the emailed token', async () => {
    executeQuery.mockResolvedValueOnce([{ id: 3 }]).mockResolvedValueOnce({});

    await adminForgotPassword({ body: { email: 'a@test.com' }, headers: {} }, makeRes());

    const emailed = sendPasswordResetEmail.mock.calls[0][1].split('/').pop();
    const stored = executeQuery.mock.calls[1][1][0];
    expect(stored).not.toBe(emailed);
    expect(stored).toBe(crypto.createHash('sha256').update(emailed).digest('hex'));
  });

  it('looks the reset up by hash and bumps token_version on success', async () => {
    executeQuery.mockResolvedValueOnce([{ id: 3 }]).mockResolvedValueOnce({});

    const res = makeRes();
    await adminResetPassword({ body: { token: 'abc', password: 'longenough' } }, res);

    expect(executeQuery.mock.calls[0][1][0]).toBe(crypto.createHash('sha256').update('abc').digest('hex'));
    expect(executeQuery.mock.calls[1][0]).toContain('token_version = token_version + 1');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('puts token_version in the login JWT but not in the returned user', async () => {
    executeQuery.mockResolvedValueOnce([{ ...dbUser, token_version: 2 }]);
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = makeRes();
    await adminLogin({ body: { email: dbUser.email, password: 'correct-password' } }, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.user.token_version).toBeUndefined();
    expect(verifyAdminToken(payload.token).tv).toBe(2);
  });
});
