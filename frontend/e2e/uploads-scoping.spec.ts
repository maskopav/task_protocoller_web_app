import { test, expect } from '@playwright/test';
import {
  BACKEND_URL, F, SITE_A_SESSIONS, SITE_B_SESSIONS, USERS, apiToken, bearer, ensureSeeded, uiLogin, visibleIds,
} from './helpers/uploads';

// Recordings are scoped by assigned clinics only: editing a study widens nothing, and whoever sees a
// session may review it. Everything out of scope is a 404.
test.beforeAll(async ({ request }) => {
  await ensureSeeded(request);
});

const sorted = (a: string[]) => [...a].sort();
const ALL_VISIBLE_TO_PROJECT = [...SITE_A_SESSIONS, ...SITE_B_SESSIONS];

const EXPECTED: Record<string, string[]> = {
  clinic: SITE_A_SESSIONS, // assigned to Clinic A only
  editor: SITE_B_SESSIONS, // edits the study, but is assigned to Clinic B only
  reviewer: ALL_VISIBLE_TO_PROJECT, // assigned to both clinics
  researcher: ALL_VISIBLE_TO_PROJECT, // edits the study, assigned to both clinics
  nogrant: [],
};

for (const persona of ['clinic', 'editor', 'reviewer', 'researcher', 'nogrant'] as const) {
  test(`${persona}: the list holds exactly the sessions in scope, and out-of-scope ids are not found`, async ({ page, request }) => {
    const token = await apiToken(request, USERS[persona]);
    const expected = EXPECTED[persona];
    expect(sorted(await visibleIds(request, token))).toEqual(sorted(expected));

    const outOfScope = [F.s1, F.s2, F.s3, F.s4, F.q1].map((f) => f.sessionId).filter((id) => !expected.includes(id));
    for (const id of outOfScope) {
      const res = await request.get(`${BACKEND_URL}/uploads/${id}`, { headers: bearer(token) });
      expect(res.status(), id).toBe(404);
    }

    await uiLogin(page, USERS[persona]);
    await page.goto('/#/admin/uploads');
    await expect(page.getByText(`of ${expected.length} sessions`)).toBeVisible();
    await expect(page.locator('tr.clickable')).toHaveCount(expected.length);

    await page.goto(`/#/admin/uploads/${outOfScope[0]}`);
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  });
}

test('the master sees every fixture session, including the quarantined ones', async ({ request }) => {
  const ids = await visibleIds(request, await apiToken(request, USERS.master));
  for (const f of [F.s1, F.s2, F.s3, F.s4, F.q1, F.q2]) expect(ids).toContain(f.sessionId);
});

test('a user who sees a session can review it; editing the study does not reach other clinics', async ({ page, request }) => {
  // The reviewer only receives the study, but it is assigned to Clinic A, so it reviews Clinic A's recordings.
  const reviewer = await apiToken(request, USERS.reviewer);
  const detail = await (await request.get(`${BACKEND_URL}/uploads/${F.s1.sessionId}`, { headers: bearer(reviewer) })).json();
  expect(detail.canEdit).toBe(true);

  // The editor edits the same study but is not assigned to Clinic A: strict scope, 404 everywhere (never 403).
  const editor = await apiToken(request, USERS.editor);
  const qc = await request.put(`${BACKEND_URL}/uploads/${F.s1.sessionId}/qc`, { headers: bearer(editor), data: { qc: 'ok' } });
  expect(qc.status()).toBe(404);
  const zip = await request.get(`${BACKEND_URL}/uploads/${F.s1.sessionId}/zip`, { headers: bearer(editor) });
  expect(zip.status()).toBe(404);
  const own = await (await request.get(`${BACKEND_URL}/uploads/${F.s4.sessionId}`, { headers: bearer(editor) })).json();
  expect(own.canEdit).toBe(true);

  await uiLogin(page, USERS.reviewer);
  await page.goto(`/#/admin/uploads/${F.s1.sessionId}`);
  await expect(page.getByText('View only')).toHaveCount(0);
  for (const name of ['Unreviewed', 'OK', 'Needs review', 'Excluded']) {
    await expect(page.getByRole('button', { name })).toBeEnabled();
  }
  // Participant values stay masked until "Show values" is used.
  await expect(page.getByTestId('masked-sex')).toBeVisible();
});

test('a site-only clinic admin can edit sessions of its clinic', async ({ request }) => {
  const token = await apiToken(request, USERS.clinic);
  const detail = await (await request.get(`${BACKEND_URL}/uploads/${F.s1.sessionId}`, { headers: bearer(token) })).json();
  expect(detail.canEdit).toBe(true);
});
