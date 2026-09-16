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

test('a non-master admin is forbidden from handing out project and site access', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  // Without these gates the per-user scoping below is decorative: an admin
  // could simply assign themselves onto any project or site.
  const cases = [
    { method: 'get' as const, path: '/user-sites/user-sites' },
    { method: 'post' as const, path: '/user-sites/assign-site', data: { user_id: 2, site_id: 1 } },
    { method: 'delete' as const, path: '/user-sites/remove-assignment/1' },
    { method: 'get' as const, path: '/user-projects/user-projects' },
    { method: 'post' as const, path: '/user-projects/assign-project', data: { user_id: 2, project_id: 1 } },
    { method: 'delete' as const, path: '/user-projects/remove-assignment/1' },
  ];

  for (const c of cases) {
    const res =
      c.method === 'get' ? await request.get(`${BACKEND_URL}${c.path}`, { headers })
      : c.method === 'delete' ? await request.delete(`${BACKEND_URL}${c.path}`, { headers })
      : await request.post(`${BACKEND_URL}${c.path}`, { headers, data: c.data });
    expect(res.status(), `expected 403 from ${c.method.toUpperCase()} ${c.path}`).toBe(403);
  }
});

test('GET /sites never hands a site access token to a non-master', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const res = await request.get(`${BACKEND_URL}/sites`, { headers });
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
  for (const site of body) {
    expect(site).not.toHaveProperty('access_token');
  }
  expect(JSON.stringify(body)).not.toContain('e2e2e2e2');
});

test('GET /sites scoping comes from the token, not from a spoofable query param', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const scoped = await request.get(`${BACKEND_URL}/sites`, { headers });
  // Claiming to be the master in the query string must change nothing.
  const spoofed = await request.get(`${BACKEND_URL}/sites?userId=1&role=master`, { headers });

  expect(spoofed.status()).toBe(scoped.status());
  expect(await spoofed.json()).toEqual(await scoped.json());
  expect(JSON.stringify(await spoofed.json())).not.toContain('access_token');
});

test('a master still sees every site, with tokens (positive control)', async ({ page, request }) => {
  const token = await loginAndGetToken(page, MASTER_EMAIL, MASTER_PASSWORD);
  const res = await request.get(`${BACKEND_URL}/sites`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  expect(body.length).toBeGreaterThan(0);
  expect(body.some((s: Record<string, unknown>) => typeof s.access_token === 'string')).toBe(true);
});

// artificial_data.sql grants admin@test.com site 1 (Paris) and no project rows,
// so the project axis is unspecified and must be derived from that clinic.
test('an admin granted only a clinic still sees that clinic projects', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const sitesRes = await request.get(`${BACKEND_URL}/sites`, { headers });
  const sites = await sitesRes.json();
  expect(sites.length).toBeGreaterThan(0);

  // The derived project axis must not be empty, and must match what the site
  // detail reports for the same clinic.
  const projectsRes = await request.get(`${BACKEND_URL}/projects/projects-list`, { headers });
  const projects = await projectsRes.json();
  expect(projects.length).toBeGreaterThan(0);

  const detailRes = await request.get(`${BACKEND_URL}/sites/${sites[0].id}`, { headers });
  expect(detailRes.ok()).toBeTruthy();
  const detail = await detailRes.json();
  expect(detail).not.toHaveProperty('access_token');

  const visibleIds = new Set(projects.map((p: Record<string, unknown>) => p.project_id));
  for (const p of detail.projects) {
    expect(visibleIds.has(p.id)).toBe(true);
  }
});

test('GET /projects-list scoping comes from the token, not from a spoofable query param', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const scoped = await request.get(`${BACKEND_URL}/projects/projects-list`, { headers });
  const spoofed = await request.get(`${BACKEND_URL}/projects/projects-list?userId=1&role=master`, { headers });

  expect(await spoofed.json()).toEqual(await scoped.json());
});

// Variant A: a project reached only through a clinic is readable but not
// writable. artificial_data.sql gives admin@test.com site 1 and no user_projects
// row, so every project it sees is inherited.
test('an admin with only inherited project access cannot save a protocol', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const listRes = await request.get(`${BACKEND_URL}/projects/projects-list`, { headers });
  const projects = await listRes.json();
  expect(projects.length).toBeGreaterThan(0);
  for (const p of projects) {
    expect(p.can_edit).toBe(false);
  }

  // Reading protocols of that project stays allowed.
  const protoRes = await request.get(`${BACKEND_URL}/protocols`, { headers });
  expect(protoRes.ok()).toBeTruthy();

  // Writing one into it does not.
  const saveRes = await request.post(`${BACKEND_URL}/protocols/save`, {
    headers,
    data: {
      name: `should-not-save-${Date.now()}`,
      language_id: [1],
      project_id: projects[0].project_id,
      tasks: [{ task_id: 1, task_order: 1, params: {} }],
    },
  });
  expect(saveRes.status()).toBe(403);
});

test('protocol listings never include a project outside the caller scope', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const projects = await (await request.get(`${BACKEND_URL}/projects/projects-list`, { headers })).json();
  const visible = new Set(projects.map((p: Record<string, unknown>) => p.project_id));

  // Protocols.jsx deliberately fetches with no project_id and filters in the
  // browser, so this listing must already be scoped server-side.
  const protocols = await (await request.get(`${BACKEND_URL}/protocols`, { headers })).json();
  for (const proto of protocols) {
    expect(visible.has(proto.project_id)).toBe(true);
  }
});

test('a non-master cannot create a project', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const res = await request.post(`${BACKEND_URL}/projects/create`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `nope-${Date.now()}` },
  });
  expect(res.status()).toBe(403);
});
