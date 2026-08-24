import { describe, it, expect, vi, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRES_IN = '8h';
});

const { signAdminToken } = await import('../utils/jwt.js');
const { requireAuth, requireRole } = await import('./authMiddleware.js');

const makeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('requireAuth', () => {
  it('calls next() and attaches req.admin for a valid Bearer token', () => {
    const token = signAdminToken({ id: 1, email: 'master@test.com', role: 'master', role_id: 1 });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.admin).toMatchObject({ id: 1, email: 'master@test.com', role: 'master', role_id: 1 });
  });

  it('rejects with 401 when the Authorization header is missing', () => {
    const req = { headers: {} };
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('rejects with 401 when the scheme is not Bearer', () => {
    const req = { headers: { authorization: 'Basic somecreds' } };
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 for a garbage/invalid token', () => {
    const req = { headers: { authorization: 'Bearer not-a-real-token' } };
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 for an expired token', () => {
    const expiredToken = signAdminTokenWithExpiry({ id: 1, role: 'master' }, '-1h');
    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('requireRole', () => {
  it('calls next() when req.admin.role is in the allowed list', () => {
    const req = { admin: { role: 'master' } };
    const res = makeRes();
    const next = vi.fn();

    requireRole('master', 'admin')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects with 403 when req.admin.role is not in the allowed list', () => {
    const req = { admin: { role: 'admin' } };
    const res = makeRes();
    const next = vi.fn();

    requireRole('master')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('rejects with 401 when called without req.admin (requireAuth not run first)', () => {
    const req = {};
    const res = makeRes();
    const next = vi.fn();

    requireRole('master')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// Local helper: sign a token with a custom (possibly negative) expiry to exercise the expired-token path.
function signAdminTokenWithExpiry(payload, expiresIn) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}
