import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

// Regression guard for the admin-auth work: every admin-only route must reject
// a request that carries no Bearer token, and the routes that are deliberately
// public (the site config endpoint, gated by its own per-site token instead)
// must keep working without one. If a future change adds a new admin route and
// forgets requireAuth, or over-gates a public one, this is what catches it.
//
// Fixed site access token from backend/scripts/seed/e2e_seed.sql.
const BACKEND_URL = 'http://localhost:3001';
const SITE_TOKEN = 'e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2';

type RouteCheck = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  data?: Record<string, unknown>;
};

const GATED_ROUTES: RouteCheck[] = [
  // /protocols — requireAuth applied at the router mount in server.js
  { method: 'GET', path: '/protocols' },
  { method: 'GET', path: '/protocols/1' },
  { method: 'POST', path: '/protocols/save', data: {} },

  // /users — requireAuth at the mount, requireRole('master') added per-route for the mutating ones
  { method: 'GET', path: '/users/users' },
  { method: 'POST', path: '/users/toggle-status', data: {} },
  { method: 'POST', path: '/users/create', data: {} },
  { method: 'PUT', path: '/users/update', data: {} },

  // /projects — requireAuth at the router mount
  { method: 'GET', path: '/projects/projects-list' },
  { method: 'POST', path: '/projects/create', data: {} },
  { method: 'PUT', path: '/projects/update', data: {} },

  // /user-projects — requireAuth at the router mount
  { method: 'GET', path: '/user-projects/user-projects' },
  { method: 'POST', path: '/user-projects/assign-project', data: {} },
  { method: 'DELETE', path: '/user-projects/remove-assignment/1' },

  // /user-sites — requireAuth at the router mount
  { method: 'GET', path: '/user-sites/user-sites' },
  { method: 'POST', path: '/user-sites/assign-site', data: {} },
  { method: 'DELETE', path: '/user-sites/remove-assignment/1' },

  // /sites — requireAuth at the mount, requireRole('master') per-route for the mutating ones
  { method: 'GET', path: '/sites' },
  { method: 'GET', path: '/sites/1' },
  { method: 'POST', path: '/sites/create', data: {} },
  { method: 'PUT', path: '/sites/1', data: {} },
  { method: 'POST', path: '/sites/1/projects', data: {} },
  { method: 'DELETE', path: '/sites/1/projects/1' },
];

const PUBLIC_ROUTES: RouteCheck[] = [
  { method: 'GET', path: '/mappings?tables=languages' },
  { method: 'GET', path: `/site-config/${SITE_TOKEN}` },
];

function call(request: APIRequestContext, route: RouteCheck): Promise<APIResponse> {
  const url = `${BACKEND_URL}${route.path}`;
  switch (route.method) {
    case 'GET':
      return request.get(url);
    case 'POST':
      return request.post(url, { data: route.data ?? {} });
    case 'PUT':
      return request.put(url, { data: route.data ?? {} });
    case 'DELETE':
      return request.delete(url);
    case 'PATCH':
      return request.patch(url, { data: route.data ?? {} });
    default:
      throw new Error(`Unhandled method: ${route.method}`);
  }
}

for (const route of GATED_ROUTES) {
  test(`${route.method} ${route.path} rejects a request with no admin token`, async ({ request }) => {
    const res = await call(request, route);
    expect(res.status(), `expected 401 from ${route.method} ${route.path}, got ${res.status()}`).toBe(401);
  });
}

for (const route of PUBLIC_ROUTES) {
  test(`${route.method} ${route.path} stays reachable without an admin token`, async ({ request }) => {
    const res = await call(request, route);
    expect(res.status(), `expected a non-401 from ${route.method} ${route.path}, got ${res.status()}`).not.toBe(401);
  });
}
