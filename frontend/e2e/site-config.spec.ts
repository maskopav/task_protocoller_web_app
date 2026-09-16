import { test, expect, type APIRequestContext } from '@playwright/test';

// The core newshare flow: an external desktop app fetches /site-config/:token
// and receives every protocol its site inherits through its projects.
// Fixtures come from backend/scripts/seed/e2e_seed.sql (site 'E2E Site' with a
// fixed token, assigned to project 1, which carries the 'E2E Test Protocol').
const BACKEND_URL = 'http://localhost:3001';
const SITE_TOKEN = 'e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2';
const MASTER_EMAIL = 'master@test.com';
const MASTER_PASSWORD = '1234';

async function apiLogin(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${BACKEND_URL}/auth/admin/login`, {
    data: { email: MASTER_EMAIL, password: MASTER_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.token).toBeTruthy();
  return body.token;
}

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
  expect(protocol.global_contents.find((c: { type: string }) => c.type === 'consent').html).toContain('E2E test consent');

  // The token is the site's credential — it must never appear in the response.
  expect(JSON.stringify(body)).not.toContain(SITE_TOKEN);
});

test('an unknown site token gets a 404', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/site-config/0000000000000000000000000000dead`);
  expect(res.status()).toBe(404);
});

// Deactivating a project must drop it (and its protocols) out of every site's
// config, and reactivating must restore it — with no changes to site_projects
// (v_site_protocols filters on projects.is_active, so this is automatic).
// Wrapped in try/finally: playwright.config.ts runs fullyParallel:false,
// workers:1 with no DB reset between spec files, so leaving project 1
// deactivated would break every other spec that assumes it's active.
test('deactivating a project drops its protocols from site-config and reactivating restores them', async ({ request }) => {
  const authHeaders = { Authorization: `Bearer ${await apiLogin(request)}` };

  try {
    let cfg = await (await request.get(`${BACKEND_URL}/site-config/${SITE_TOKEN}`)).json();
    expect(cfg.projects).toHaveLength(1);

    const deactivate = await request.put(`${BACKEND_URL}/projects/update`, {
      headers: authHeaders,
      data: { id: 1, is_active: 0, updated_by: 1 },
    });
    expect(deactivate.ok()).toBeTruthy();

    cfg = await (await request.get(`${BACKEND_URL}/site-config/${SITE_TOKEN}`)).json();
    expect(cfg.projects).toHaveLength(0); // project (and its protocol) dropped entirely

    const sites = await (await request.get(`${BACKEND_URL}/sites`, { headers: authHeaders })).json();
    const site = sites.find((s: { id: number }) => s.id === 3);
    expect(site.project_count).toBe(0); // assignment row is untouched, but it's no longer counted as live
  } finally {
    const reactivate = await request.put(`${BACKEND_URL}/projects/update`, {
      headers: authHeaders,
      data: { id: 1, is_active: 1, updated_by: 1 },
    });
    expect(reactivate.ok()).toBeTruthy();
  }

  const cfg = await (await request.get(`${BACKEND_URL}/site-config/${SITE_TOKEN}`)).json();
  expect(cfg.projects).toHaveLength(1);
  expect(cfg.projects[0].protocols).toHaveLength(1);

  const sites = await (await request.get(`${BACKEND_URL}/sites`, { headers: authHeaders })).json();
  const site = sites.find((s: { id: number }) => s.id === 3);
  expect(site.project_count).toBe(1);
});