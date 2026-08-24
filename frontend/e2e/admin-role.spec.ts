import { test, expect, type Page } from '@playwright/test';

// Verifies requireRole('master') actually rejects a logged-in-but-non-master
// admin, not just requireAuth rejecting an anonymous request (that part is
// covered by admin-route-matrix.spec.ts). Credentials come from
// backend/scripts/seed/artificial_data.sql, seeded fresh before every E2E run.
const BACKEND_URL = 'http://localhost:3001';
const MASTER_EMAIL = 'master@test.com';
const MASTER_PASSWORD = '1234';
const NON_MASTER_EMAIL = 'admin@test.com';
const NON_MASTER_PASSWORD = '1234';

async function loginAndGetToken(page: Page, email: string, password: string): Promise<string | null> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);

  return page.evaluate(() => localStorage.getItem('adminToken'));
}

test('a non-master admin can log in and view the admin list', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  expect(token).toBeTruthy();

  const res = await request.get(`${BACKEND_URL}/users/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
});

test('a non-master admin is forbidden from master-only user-management actions', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const createRes = await request.post(`${BACKEND_URL}/users/create`, {
    headers,
    data: { email: `should-not-exist-${Date.now()}@test.com`, full_name: 'Nope' },
  });
  expect(createRes.status()).toBe(403);

  const toggleRes = await request.post(`${BACKEND_URL}/users/toggle-status`, {
    headers,
    data: { user_id: 1, is_active: 0 },
  });
  expect(toggleRes.status()).toBe(403);

  const updateRes = await request.put(`${BACKEND_URL}/users/update`, {
    headers,
    data: { user_id: 1, full_name: 'Hijacked' },
  });
  expect(updateRes.status()).toBe(403);
});

test('a master admin can reach the same master-only actions (positive control)', async ({ page, request }) => {
  const token = await loginAndGetToken(page, MASTER_EMAIL, MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const createRes = await request.post(`${BACKEND_URL}/users/create`, {
    headers,
    data: { email: `master-created-${Date.now()}@test.com`, full_name: 'Created By Master' },
  });
  expect(createRes.status()).toBe(201);
  const body = await createRes.json();
  expect(body.success).toBe(true);
});
