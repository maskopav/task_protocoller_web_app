import { test, expect } from '@playwright/test';

// The core newshare flow: an external desktop app fetches /site-config/:token
// and receives every protocol its site inherits through its projects.
// Fixtures come from backend/scripts/seed/e2e_seed.sql (site 'E2E Site' with a
// fixed token, assigned to project 1, which carries the 'E2E Test Protocol').
const BACKEND_URL = 'http://localhost:3001';
const SITE_TOKEN = 'e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2';

test('a valid site token returns the config with inherited protocols grouped by project', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/site-config/${SITE_TOKEN}`);
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body.site.name).toBe('E2E Site');
  expect(body.site.config_json).toEqual({ note: 'e2e' });

  expect(body.projects).toHaveLength(1);
  const project = body.projects[0];
  expect(project.name).toBe('Test Study 001');
  expect(project.protocols).toHaveLength(1);

  const protocol = project.protocols[0];
  expect(protocol.name).toBe('E2E Test Protocol');
  expect(protocol.tasks).toHaveLength(3);
  expect(protocol.tasks.map((t: { task_order: number }) => t.task_order)).toEqual([1, 2, 3]);
  expect(protocol.consent_text).toContain('E2E test consent');

  // The token is the site's credential — it must never appear in the response.
  expect(JSON.stringify(body)).not.toContain(SITE_TOKEN);
});

test('an unknown site token gets a 404', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/site-config/0000000000000000000000000000dead`);
  expect(res.status()).toBe(404);
});