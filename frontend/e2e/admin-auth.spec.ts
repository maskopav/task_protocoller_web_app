import { test, expect, type Page } from '@playwright/test';

// Credentials come from backend/scripts/seed/artificial_data.sql, seeded fresh
// into the disposable task_protocoller_test DB before every E2E run (see
// playwright.config.ts webServer -> "npm run db:test:reset").
const BACKEND_URL = 'http://localhost:3001';
const MASTER_EMAIL = 'master@test.com';
const MASTER_PASSWORD = '1234';

async function loginAndGetToken(page: Page): Promise<string | null> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(MASTER_EMAIL);
  await page.locator('input[name="password"]').fill(MASTER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/recordings$/);

  return page.evaluate(() => localStorage.getItem('adminToken'));
}

test('rejects an unauthenticated GET to a protected admin endpoint', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/users`);
  expect(res.status()).toBe(401);
});

test('rejects an unauthenticated attempt to create an admin, and no row is created', async ({ request, page }) => {
  const intruderEmail = `intruder-${Date.now()}@test.com`;

  const createRes = await request.post(`${BACKEND_URL}/users`, {
    data: { email: intruderEmail, name: 'Intruder', role_id: 1, password: 'whatever123' },
  });
  expect(createRes.status()).toBe(401);

  // Confirm via an authenticated session that no new admin was actually created.
  const token = await loginAndGetToken(page);
  const listRes = await request.get(`${BACKEND_URL}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(listRes.ok()).toBeTruthy();
  const admins = await listRes.json();
  expect(admins.some((u: { email: string }) => u.email === intruderEmail)).toBe(false);
});

test('rejects a request bearing a garbage/invalid token the same as no token', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/users`, {
    headers: { Authorization: 'Bearer not-a-real-token' },
  });
  expect(res.status()).toBe(401);
});

test('a valid admin token reaches the protected endpoint after logging in', async ({ page, request }) => {
  const token = await loginAndGetToken(page);
  expect(token).toBeTruthy();

  const res = await request.get(`${BACKEND_URL}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();

  // Just confirm we got a real, well-formed response instead of a 401/403.
  const admins = await res.json();
  expect(Array.isArray(admins)).toBe(true);
});
