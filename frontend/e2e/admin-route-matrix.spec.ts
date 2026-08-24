import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';

// Regression guard for the admin-auth work: every admin-only route must reject
// a request that carries no Bearer token, and the routes that are deliberately
// public (participant-facing, gated by their own per-participant token instead)
// must keep working without one. If a future change adds a new admin route and
// forgets requireAuth, or over-gates a public one, this is what catches it.
//
// Fixed participant access token from backend/scripts/seed/e2e_participant_seed.sql.
const BACKEND_URL = 'http://localhost:3001';
const PARTICIPANT_TOKEN = 'e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2';

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

  // /participants — requireAuth applied at the router mount
  { method: 'GET', path: '/participants' },
  { method: 'GET', path: '/participants/search?external_id=x' },
  { method: 'POST', path: '/participants/create', data: {} },
  { method: 'PUT', path: '/participants/1', data: {} },

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

  // /participant-protocols admin actions — gated per-route (the router itself is mounted public
  // because GET /:token and PATCH /:token/language must stay reachable by participants)
  { method: 'GET', path: '/participant-protocols' },
  { method: 'POST', path: '/participant-protocols/activate', data: {} },
  { method: 'POST', path: '/participant-protocols/deactivate', data: {} },
  { method: 'POST', path: '/participant-protocols/assign', data: {} },
  { method: 'POST', path: '/participant-protocols/send-manual-email', data: {} },
];

const PUBLIC_ROUTES: RouteCheck[] = [
  { method: 'GET', path: '/mappings?tables=languages' },
  { method: 'GET', path: `/participant-protocols/${PARTICIPANT_TOKEN}` },
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
