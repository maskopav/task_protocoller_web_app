import { test, expect } from '@playwright/test';

// server.js now restricts which browser Origins may talk to the API
// (CORS_ORIGIN in backend/.env.test = https://localhost:5183, matching the
// e2e frontend's fixed port in playwright.config.ts). This proves that
// restriction is actually wired up, not just present in the config.
const BACKEND_URL = 'http://localhost:3001';
const ALLOWED_ORIGIN = 'https://localhost:5183';
const DISALLOWED_ORIGIN = 'https://evil.example.com';

test('rejects a request carrying a disallowed Origin header', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/mappings?tables=languages`, {
    headers: { Origin: DISALLOWED_ORIGIN },
  });
  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(body.error).toBe('Not allowed by CORS');
});

test('allows a request carrying the configured frontend Origin', async ({ request }) => {
  // /test rather than /mappings: this spec is about CORS, and /mappings now
  // needs an admin JWT (a 401 would mask the CORS result being asserted).
  const res = await request.get(`${BACKEND_URL}/test`, {
    headers: { Origin: ALLOWED_ORIGIN },
  });
  expect(res.ok()).toBeTruthy();
});

test('allows a request with no Origin header at all (non-browser client)', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/test`);
  expect(res.ok()).toBeTruthy();
});

test('site-config stays reachable without an Origin header (the desktop-app path)', async ({ request }) => {
  // The external desktop app is a non-browser client — it sends no Origin, so
  // it must never be blocked by the CORS restriction. Unknown token → 404 (not 403).
  const res = await request.get(`${BACKEND_URL}/site-config/definitely-not-a-real-token`);
  expect(res.status()).toBe(404);
});
