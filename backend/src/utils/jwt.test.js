import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRES_IN = '8h';
});

const { signAdminToken, verifyAdminToken } = await import('./jwt.js');

const sampleUser = { id: 7, email: 'master@test.com', role: 'master', role_id: 1 };

describe('signAdminToken / verifyAdminToken', () => {
  it('signs a token that verifies back to the same identity claims', () => {
    const token = signAdminToken(sampleUser);
    const decoded = verifyAdminToken(token);

    expect(decoded.id).toBe(sampleUser.id);
    expect(decoded.email).toBe(sampleUser.email);
    expect(decoded.role).toBe(sampleUser.role);
    expect(decoded.role_id).toBe(sampleUser.role_id);
  });

  it('does not embed display-only fields like full_name or must_change_password', () => {
    const token = signAdminToken({ ...sampleUser, full_name: 'Master User', must_change_password: 1 });
    const decoded = verifyAdminToken(token);

    expect(decoded.full_name).toBeUndefined();
    expect(decoded.must_change_password).toBeUndefined();
  });

  it('sets an expiry consistent with JWT_EXPIRES_IN', () => {
    const token = signAdminToken(sampleUser);
    const decoded = verifyAdminToken(token);
    const lifetimeSeconds = decoded.exp - decoded.iat;

    expect(lifetimeSeconds).toBe(8 * 60 * 60);
  });

  it('rejects a token signed with a different secret', () => {
    const foreignToken = jwt.sign(sampleUser, 'someone-elses-secret');
    expect(() => verifyAdminToken(foreignToken)).toThrow();
  });

  it('rejects a garbage token', () => {
    expect(() => verifyAdminToken('not-a-real-token')).toThrow();
  });
});
