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
  await expect(page).toHaveURL(/\/recordings$/);

  return page.evaluate(() => localStorage.getItem('adminToken'));
}

test('a non-master admin cannot list the other admins', async ({ page, request }) => {
  // The list (emails + permission flags of every admin) only feeds the
  // master-only AdminManagementPage, so it is master-only on the server too.
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  expect(token).toBeTruthy();

  const res = await request.get(`${BACKEND_URL}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(403);
});

test('a non-master admin is forbidden from master-only user-management actions', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const createRes = await request.post(`${BACKEND_URL}/users`, {
    headers,
    data: { email: `should-not-exist-${Date.now()}@test.com`, name: 'Nope' },
  });
  expect(createRes.status()).toBe(403);

  const deactivateRes = await request.patch(`${BACKEND_URL}/users/1`, {
    headers,
    data: { is_active: false },
  });
  expect(deactivateRes.status()).toBe(403);

  const renameRes = await request.patch(`${BACKEND_URL}/users/1`, {
    headers,
    data: { name: 'Hijacked' },
  });
  expect(renameRes.status()).toBe(403);
});

test('a master admin can reach the same master-only actions (positive control)', async ({ page, request }) => {
  const token = await loginAndGetToken(page, MASTER_EMAIL, MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const createRes = await request.post(`${BACKEND_URL}/users`, {
    headers,
    data: { email: `master-created-${Date.now()}@test.com`, name: 'Created By Master' },
  });
  expect(createRes.status()).toBe(201);
  const body = await createRes.json();
  expect(body.success).toBe(true);
});

test('a non-master admin is forbidden from handing out clinic access and study editing', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  // Without these gates the per-user scoping below is decorative: an admin
  // could simply assign themselves onto any clinic, or make themselves an
  // editor of a study they only receive through a clinic (admin@test.com
  // sees studies 1 and 2 through Paris and edits none of them).
  const cases = [
    { method: 'get' as const, path: '/users/2' },
    { method: 'put' as const, path: '/users/2/sites', data: { site_ids: [1, 2] } },
    { method: 'get' as const, path: '/projects/1/editors' },
    { method: 'post' as const, path: '/projects/1/editors', data: { email: NON_MASTER_EMAIL } },
    { method: 'delete' as const, path: '/projects/1/editors/1' },
    { method: 'put' as const, path: '/projects/1/sites/2' },
    { method: 'delete' as const, path: '/projects/1/sites/1' },
  ];

  for (const c of cases) {
    const url = `${BACKEND_URL}${c.path}`;
    const res =
      c.method === 'get' ? await request.get(url, { headers })
      : c.method === 'delete' ? await request.delete(url, { headers })
      : c.method === 'put' ? await request.put(url, { headers, data: c.data })
      : await request.post(url, { headers, data: c.data });
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
  const projectsRes = await request.get(`${BACKEND_URL}/projects`, { headers });
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

test('GET /projects scoping comes from the token, not from a spoofable query param', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const scoped = await request.get(`${BACKEND_URL}/projects`, { headers });
  const spoofed = await request.get(`${BACKEND_URL}/projects?userId=1&role=master`, { headers });

  expect(await spoofed.json()).toEqual(await scoped.json());
});

// Variant A: a project reached only through a clinic is readable but not
// writable. artificial_data.sql gives admin@test.com site 1 and no project_editors
// row, so every project it sees is inherited.
test('an admin with only inherited project access cannot save a protocol', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const listRes = await request.get(`${BACKEND_URL}/projects`, { headers });
  const projects = await listRes.json();
  expect(projects.length).toBeGreaterThan(0);
  for (const p of projects) {
    expect(p.can_edit).toBe(false);
  }

  // Reading protocols of that project stays allowed.
  const protoRes = await request.get(`${BACKEND_URL}/projects/${projects[0].project_id}/protocols`, { headers });
  expect(protoRes.ok()).toBeTruthy();

  // Writing one into it does not.
  const saveRes = await request.post(`${BACKEND_URL}/protocols`, {
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

  const projects = await (await request.get(`${BACKEND_URL}/projects`, { headers })).json();
  const visible = new Set(projects.map((p: Record<string, unknown>) => p.project_id));
  expect(visible.has(3)).toBe(false); // "Speech Study" runs at clinics 4 and 5 only

  // Listings are per study and scoped server-side: a visible study lists its
  // own protocols, a study outside the scope is a 404 (never a 403).
  for (const projectId of visible) {
    const res = await request.get(`${BACKEND_URL}/projects/${projectId}/protocols`, { headers });
    expect(res.ok()).toBeTruthy();
    for (const proto of await res.json()) {
      expect(proto.project_id).toBe(projectId);
    }
  }
  const outside = await request.get(`${BACKEND_URL}/projects/3/protocols`, { headers });
  expect(outside.status()).toBe(404);
  const outsideProtocol = await request.get(`${BACKEND_URL}/protocols/2`, { headers });
  expect(outsideProtocol.status()).toBe(404);
});

test('a non-master cannot create a project', async ({ page, request }) => {
  const token = await loginAndGetToken(page, NON_MASTER_EMAIL, NON_MASTER_PASSWORD);
  const res = await request.post(`${BACKEND_URL}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `nope-${Date.now()}` },
  });
  expect(res.status()).toBe(403);
});

// Co-editors replace the old per-user project grants. Study 3 ("Speech Study",
// e2e_seed.sql) is edited by researcher@ and editor@, and only received by reviewer@.
test('study editors: an editor adds and removes a co-editor by email, a receiver cannot', async ({ request }) => {
  const login = async (email: string) => {
    const res = await request.post(`${BACKEND_URL}/auth/admin/login`, { data: { email, password: '1234' } });
    expect(res.ok()).toBeTruthy();
    return { Authorization: `Bearer ${(await res.json()).token}` };
  };
  const researcher = await login('researcher@test.com');
  const reviewer = await login('reviewer@test.com');

  const add = await request.post(`${BACKEND_URL}/projects/3/editors`, { headers: researcher, data: { email: 'nogrant@test.com' } });
  expect(add.status()).toBe(201);
  const added = await add.json();
  try {
    const list = await (await request.get(`${BACKEND_URL}/projects/3/editors`, { headers: researcher })).json();
    expect(list.map((e: { email: string }) => e.email)).toContain('nogrant@test.com');
  } finally {
    const del = await request.delete(`${BACKEND_URL}/projects/3/editors/${added.user_id}`, { headers: researcher });
    expect(del.ok()).toBeTruthy();
  }

  const unknown = await request.post(`${BACKEND_URL}/projects/3/editors`, { headers: researcher, data: { email: 'nobody@test.com' } });
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).error).toBe('user_not_found');

  // The reviewer sees study 3 through its clinics but may not manage its editors.
  const denied = await request.post(`${BACKEND_URL}/projects/3/editors`, { headers: reviewer, data: { email: 'nogrant@test.com' } });
  expect(denied.status()).toBe(403);
});
