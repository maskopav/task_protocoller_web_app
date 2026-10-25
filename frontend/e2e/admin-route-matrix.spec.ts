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
  // /mappings — was public until the project contact fields landed; nothing
  // pre-login reads it, so it is gated at the mount like every other admin route
  { method: 'GET', path: '/mappings?tables=languages' },
  // /protocols — requireAuth applied at the router mount in server.js
  { method: 'GET', path: '/protocols/1' },
  { method: 'POST', path: '/protocols', data: {} },
  { method: 'POST', path: '/protocols/1/archive', data: {} },
  { method: 'POST', path: '/protocols/1/share', data: {} },

  // /library — requireAuth at the mount
  { method: 'GET', path: '/library' },
  { method: 'GET', path: '/library/4' },
  { method: 'POST', path: '/library/4/copy', data: {} },
  { method: 'POST', path: '/library/4/withdraw', data: {} },

  // /users — requireAuth at the mount, requireRole('master') on the router (the list included)
  { method: 'GET', path: '/users' },
  { method: 'POST', path: '/users', data: {} },
  { method: 'GET', path: '/users/1' },
  { method: 'PATCH', path: '/users/1', data: {} },
  { method: 'PUT', path: '/users/1/sites', data: { site_ids: [] } },

  // /projects — requireAuth at the router mount
  { method: 'GET', path: '/projects' },
  { method: 'POST', path: '/projects', data: {} },
  { method: 'GET', path: '/projects/1' },
  { method: 'PATCH', path: '/projects/1', data: {} },
  { method: 'POST', path: '/projects/1/archive', data: { archived: true } },
  { method: 'GET', path: '/projects/1/protocols' },
  { method: 'GET', path: '/projects/1/editors' },
  { method: 'POST', path: '/projects/1/editors', data: {} },
  { method: 'DELETE', path: '/projects/1/editors/1' },
  { method: 'PUT', path: '/projects/1/sites/1' },
  { method: 'DELETE', path: '/projects/1/sites/1' },

  // /sites — requireAuth at the mount, the controllers decide per record
  { method: 'GET', path: '/sites' },
  { method: 'GET', path: '/sites/1' },
  { method: 'POST', path: '/sites', data: {} },
  { method: 'PATCH', path: '/sites/1', data: {} },
];

const PUBLIC_ROUTES: RouteCheck[] = [
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
