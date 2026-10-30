import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// Proves that deactivating an admin takes effect immediately, not just after
// their JWT's natural ~8h expiry. requireAuth now re-checks users.is_active
// against the DB on every request (backend/src/middleware/authMiddleware.js)
// instead of only trusting the token's signature/expiry.
// Credentials come from backend/scripts/seed/artificial_data.sql.
const BACKEND_URL = 'http://localhost:3001';
const MASTER_EMAIL = 'master@test.com';
const MASTER_PASSWORD = '1234';
const TARGET_EMAIL = 'admin@test.com';
const TARGET_PASSWORD = '1234';

async function loginAndGetToken(page: Page, email: string, password: string): Promise<string> {
  // F-078: /login no longer signs out, so a second user starts from a cleared session.
  await page.goto('/#/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // a logged-in visit to / now opens the app, so address the login route itself
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/recordings$/);

  const token = await page.evaluate(() => localStorage.getItem('adminToken'));
  if (!token) throw new Error('Login did not yield an adminToken');
  return token;
}

async function findUserId(request: APIRequestContext, masterToken: string, email: string): Promise<number> {
  const res = await request.get(`${BACKEND_URL}/users`, {
    headers: { Authorization: `Bearer ${masterToken}` },
  });
  const admins = await res.json();
  const match = admins.find((u: { email: string }) => u.email === email);
  if (!match) throw new Error(`No admin row found for ${email}`);
  return match.id;
}

async function setActive(request: APIRequestContext, masterToken: string, userId: number, isActive: 0 | 1) {
  const res = await request.patch(`${BACKEND_URL}/users/${userId}`, {
    headers: { Authorization: `Bearer ${masterToken}` },
    data: { is_active: isActive === 1 },
  });
  expect(res.ok()).toBeTruthy();
}

test('deactivating an admin immediately invalidates their existing token, without waiting for expiry', async ({ page, request }) => {
  // 1. The target admin logs in and gets a token that is valid right now.
  const targetToken = await loginAndGetToken(page, TARGET_EMAIL, TARGET_PASSWORD);
  // Probe with an endpoint any admin may call (GET /users is master-only).
  const before = await request.get(`${BACKEND_URL}/projects`, {
    headers: { Authorization: `Bearer ${targetToken}` },
  });
  expect(before.ok()).toBeTruthy();

  // 2. A master deactivates that same admin — no new login, no re-issued token involved.
  const masterToken = await loginAndGetToken(page, MASTER_EMAIL, MASTER_PASSWORD);
  const targetUserId = await findUserId(request, masterToken, TARGET_EMAIL);

  try {
    await setActive(request, masterToken, targetUserId, 0);

    // 3. The SAME still-unexpired token the admin already had must now be rejected.
    const after = await request.get(`${BACKEND_URL}/projects`, {
      headers: { Authorization: `Bearer ${targetToken}` },
    });
    expect(after.status()).toBe(401);
  } finally {
    // Leave the seed account active for any other spec that logs in as it.
    await setActive(request, masterToken, targetUserId, 1);
  }
});
