import { test, expect } from '@playwright/test';
import { BACKEND_URL, F, USERS, apiToken, bearer, ensureSeeded, uiLogin } from './helpers/uploads';

// Users screens (docs/ui_redesign/02_spec.md section 6.8): master-only list and user page.
// The test invites its own user, so no seeded account changes (the invitation email fails silently here).
const CLINIC_A = 4;

test.beforeAll(async ({ request }) => {
  await ensureSeeded(request);
});

test('the master invites a user, then edits their clinics and permissions', async ({ page, request }) => {
  const email = `invited-${Date.now()}@example.org`;
  await uiLogin(page, USERS.master);
  await page.goto('/#/users');
  await expect(page.getByTestId('users-table')).toBeVisible();
  await expect(page.locator('.ui-btn-primary')).toHaveCount(1);

  await page.getByTestId('new-user').click();
  await page.getByTestId('invite-user-name').fill('Invited Person');
  await page.getByTestId('invite-user-email').fill(email);
  await page.getByTestId('invite-user-submit').click();
  await expect(page).toHaveURL(/#\/users\/\d+$/);
  const id = Number(page.url().split('/').pop());
  await expect(page.getByRole('heading', { level: 1, name: 'Invited Person' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Users');

  const clinic = page.getByTestId(`user-clinic-${CLINIC_A}`);
  await clinic.click();
  await expect(clinic).toBeChecked();
  await page.getByTestId('user-flag-studies').click();
  await expect(page.getByTestId('user-flag-studies')).toBeChecked();
  await page.getByTestId('user-flag-clinics').click();
  await expect(page.getByTestId('user-flag-clinics')).toBeChecked();

  const master = await apiToken(request, USERS.master);
  await expect.poll(async () => {
    const res = await request.get(`${BACKEND_URL}/users/${id}`, { headers: bearer(master) });
    const u = await res.json();
    return [u.sites.map((s: { id: number }) => s.id), u.can_create_projects, u.can_create_sites];
  }).toEqual([[CLINIC_A], true, true]);

  await page.getByTestId('user-field-name').fill('Renamed Person');
  await page.getByTestId('user-save').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Renamed Person' })).toBeVisible();

  await page.goto('/#/users');
  await expect(page.locator(`.user-row-${id}`)).toContainText('Renamed Person');
  await expect(page.locator(`.user-row-${id}`)).toContainText('Create studies, Create clinics');
});

test('a user who is not a master gets the not-available page at users', async ({ page }) => {
  await uiLogin(page, USERS.nogrant);
  await page.goto('/#/users');
  await expect(page.getByTestId('not-available-page')).toBeVisible();
  await expect(page.getByTestId('users-table')).toHaveCount(0);
});

// docs/technical_details/spec.md: server checks, the IDs row and upload history show only to users the master picks.
// The flag is read per request, so the clinician sees the change on reload, without logging in again.
test('the technical-details switch shows and hides diagnostics on a clinician recording', async ({ page, browser, request }) => {
  const master = await apiToken(request, USERS.master);
  const users = await (await request.get(`${BACKEND_URL}/users`, { headers: bearer(master) })).json();
  const clinician = users.find((u: { email: string }) => u.email === USERS.clinic);
  const setFlag = (v: boolean) => request.patch(`${BACKEND_URL}/users/${clinician.id}`, { headers: bearer(master), data: { can_see_technical: v } });
  await setFlag(false);

  try {
    await uiLogin(page, USERS.clinic);
    await page.goto(`/#/recordings/${F.s1.sessionId}`);
    await expect(page.getByRole('heading', { name: 'Session' })).toBeVisible();
    for (const text of ['Server checks', 'Session ID', 'Upload history']) await expect(page.getByText(text, { exact: true })).toHaveCount(0);

    // The master flips the switch on the user page.
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const admin = await ctx.newPage();
    await uiLogin(admin, USERS.master);
    await admin.goto(`/#/users/${clinician.id}`);
    const sw = admin.getByTestId('user-flag-technical');
    await expect(sw).not.toBeChecked();
    await sw.click();
    await expect(sw).toBeChecked();
    await admin.goto('/#/users');
    await expect(admin.locator(`.user-row-${clinician.id}`)).toContainText('Technical details');
    await ctx.close();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Server checks' })).toBeVisible();
    await expect(page.getByText('Session ID', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Upload history' })).toBeVisible();
  } finally {
    await setFlag(false);
  }
});
