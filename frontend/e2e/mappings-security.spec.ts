import { test, expect, type APIRequestContext } from '@playwright/test';

// backend/src/routes/mappings.js used to interpolate the `tables` query param
// straight into `SELECT * FROM ${table}` on a pool with multipleStatements
// enabled — unauthenticated SQL injection, and even without injection it let
// anyone dump arbitrary tables (e.g. `users`, exposing password_hash). It is now
// behind requireAuth AND restricted to a fixed allowlist. This is the regression
// proof for both: the allowlist must hold even for a logged-in master.
const BACKEND_URL = 'http://localhost:3001';
const MASTER_EMAIL = 'master@test.com';
const MASTER_PASSWORD = '1234';

let authHeaders: Record<string, string>;

async function apiLogin(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${BACKEND_URL}/auth/admin/login`, {
    data: { email: MASTER_EMAIL, password: MASTER_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.token).toBeTruthy();
  return body.token;
}

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  authHeaders = { Authorization: `Bearer ${await apiLogin(request)}` };
  await request.dispose();
});

test('rejects an unauthenticated request outright', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/mappings?tables=languages`);
  expect(res.status()).toBe(401);
});

test('rejects a request for a table outside the allowlist (e.g. users)', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/mappings?tables=users`, { headers: authHeaders });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('users');
});

test('rejects a stacked-query injection attempt disguised as a table name', async ({ request }) => {
  const payload = 'languages;DROP TABLE projects;--';
  const res = await request.get(`${BACKEND_URL}/mappings?tables=${encodeURIComponent(payload)}`, {
    headers: authHeaders,
  });
  expect(res.status()).toBe(400);
});

test('legitimate multi-table requests still work after the fix', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/mappings?tables=languages,protocols`, {
    headers: authHeaders,
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('languages');
  expect(body).toHaveProperty('protocols');
  expect(Array.isArray(body.languages)).toBe(true);
});

test('the injection attempt did not actually drop anything — projects table still intact', async ({ request }) => {
  // Sent right after the injection-attempt test above; if the DROP TABLE had
  // executed, this legitimate query would now fail server-side (500), not 400.
  const res = await request.get(`${BACKEND_URL}/mappings?tables=projects`, { headers: authHeaders });
  expect(res.ok()).toBeTruthy();
});
