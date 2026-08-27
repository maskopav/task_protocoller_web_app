import { test, expect } from '@playwright/test';

// backend/src/routes/mappings.js used to interpolate the `tables` query param
// straight into `SELECT * FROM ${table}` on a pool with multipleStatements
// enabled — unauthenticated SQL injection, and even without injection it let
// anyone dump arbitrary tables (e.g. `users`, exposing password_hash). Now
// restricted to a fixed allowlist. This is the regression proof for that fix.
const BACKEND_URL = 'http://localhost:3001';

test('rejects a request for a table outside the allowlist (e.g. users)', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/mappings?tables=users`);
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('users');
});

test('rejects a stacked-query injection attempt disguised as a table name', async ({ request }) => {
  const payload = 'languages;DROP TABLE projects;--';
  const res = await request.get(`${BACKEND_URL}/mappings?tables=${encodeURIComponent(payload)}`);
  expect(res.status()).toBe(400);
});

test('legitimate multi-table requests still work after the fix', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/mappings?tables=languages,protocols`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('languages');
  expect(body).toHaveProperty('protocols');
  expect(Array.isArray(body.languages)).toBe(true);
});

test('the injection attempt did not actually drop anything — projects table still intact', async ({ request }) => {
  // Sent right after the injection-attempt test above; if the DROP TABLE had
  // executed, this legitimate query would now fail server-side (500), not 400.
  const res = await request.get(`${BACKEND_URL}/mappings?tables=projects`);
  expect(res.ok()).toBeTruthy();
});
