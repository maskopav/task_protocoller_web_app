import { test, expect } from '@playwright/test';

// Proves the rate-limit middleware (backend/src/middleware/rateLimiter.js) is
// actually wired up on a real /auth/* route, not just correct in isolation
// (that's covered by backend/src/middleware/rateLimiter.test.js).
//
// Uses /auth/admin/forgot-password specifically because no other e2e spec
// calls it — every other spec logs in via /auth/admin/login, which shares
// the same loginLimiter budget across the whole suite run (one backend
// process = one shared in-memory counter for its ~40s lifetime). Exhausting
// that here would make unrelated specs start failing with 429 depending on
// run order. authLimiter (30/15min) on this untouched route sidesteps that
// entirely, and forgotPassword for a nonexistent email returns immediately
// without side effects, so hammering it is fast and safe.
const BACKEND_URL = 'http://localhost:3001';

test('authLimiter is enforced on a real /auth/* route after the configured number of requests', async ({ request }) => {
  const email = 'rate-limit-probe@test.com';

  for (let i = 0; i < 30; i++) {
    const res = await request.post(`${BACKEND_URL}/auth/admin/forgot-password`, {
      data: { email },
    });
    expect(res.status(), `request #${i + 1} should not be rate-limited yet`).toBe(200);
  }

  const blocked = await request.post(`${BACKEND_URL}/auth/admin/forgot-password`, {
    data: { email },
  });
  expect(blocked.status()).toBe(429);
});
