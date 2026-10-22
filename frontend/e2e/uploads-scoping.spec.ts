import { test, expect } from '@playwright/test';
import {
  BACKEND_URL, F, SITE_A_SESSIONS, SITE_B_SESSIONS, USERS, apiToken, bearer, ensureSeeded, uiLogin, visibleIds,
} from './helpers/uploads';

// Spec §7: what each persona sees, 404 for everything out of scope, read-only means 403 on writes.
test.beforeAll(async ({ request }) => {
  await ensureSeeded(request);
});

const sorted = (a: string[]) => [...a].sort();
const ALL_VISIBLE_TO_PROJECT = [...SITE_A_SESSIONS, ...SITE_B_SESSIONS];

const EXPECTED: Record<string, string[]> = {
  clinic: SITE_A_SESSIONS, // site grant: its clinic only
  editor: SITE_B_SESSIONS, // project grant narrowed to Clinic B
  reviewer: ALL_VISIBLE_TO_PROJECT, // project grant over all of its clinics
  nogrant: [],
};

for (const persona of ['clinic', 'editor', 'reviewer', 'nogrant'] as const) {
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

test('a read-only reviewer sees the detail but no download, review or edit controls', async ({ page, request }) => {
  const token = await apiToken(request, USERS.reviewer);

  // Write endpoints refuse with 403 (the session is visible, so no 404 disguise).
  const qc = await request.put(`${BACKEND_URL}/uploads/${F.s1.sessionId}/qc`, { headers: bearer(token), data: { qc: 'ok' } });
  expect(qc.status()).toBe(403);
  const zip = await request.get(`${BACKEND_URL}/uploads/${F.s1.sessionId}/zip`, { headers: bearer(token) });
  expect(zip.status()).toBe(403);

  await uiLogin(page, USERS.reviewer);
  await page.goto(`/#/admin/uploads/${F.s1.sessionId}`);
  await expect(page.getByText('View only').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show values' })).toHaveCount(0);
  await expect(page.getByLabel('Add a comment for the site team')).toHaveCount(0);
  for (const name of ['Unreviewed', 'OK', 'Needs review', 'Excluded']) {
    await expect(page.getByRole('button', { name })).toBeDisabled();
  }
  // Masked participant values stay masked.
  await expect(page.getByTestId('masked-sex')).toBeVisible();

  // And the list offers no per-row download.
  await page.goto('/#/admin/uploads');
  await expect(page.getByRole('button', { name: 'Download ZIP' })).toHaveCount(0);
});

test('a site-only clinic admin can edit sessions of its clinic', async ({ request }) => {
  const token = await apiToken(request, USERS.clinic);
  const detail = await (await request.get(`${BACKEND_URL}/uploads/${F.s1.sessionId}`, { headers: bearer(token) })).json();
  expect(detail.canEdit).toBe(true);
});
