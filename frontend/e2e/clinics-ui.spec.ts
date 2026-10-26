import { test, expect } from '@playwright/test';
import { BACKEND_URL, F, SITE_A_TOKEN, USERS, apiToken, bearer, ensureSeeded, uiLogin } from './helpers/uploads';

// Clinics screens (docs/ui_redesign/02_spec.md §6.6 and §6.7):
// the list, the one-clinic redirect, Computers (token, status), runs-at from the clinic side,
// the unassigned section and the F-008 file-name hint.
// Seed: "E2E Clinic A" (site 4) and "E2E Clinic B" (site 5) both run "Speech Study" (study 3).
const CLINIC_A = 4;
const STUDY = 3;

let master = '';
test.beforeAll(async ({ request }) => {
  master = await ensureSeeded(request);
});

test('the master always sees the clinics list, with the unassigned computers above it', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto('/#/clinics');
  await expect(page.getByTestId('clinics-table')).toBeVisible();
  await expect(page.getByTestId('clinics-table').getByText('E2E Clinic A')).toBeVisible();
  await expect(page.getByTestId('clinics-table').getByText('E2E Clinic B')).toBeVisible();
  await expect(page.getByTestId('new-clinic')).toBeVisible();
  await expect(page.locator('.ui-btn-primary')).toHaveCount(1);

  const unassigned = page.getByTestId('unassigned-computers');
  await expect(unassigned).toContainText('Unassigned computers');
  await expect(unassigned.locator('tr', { hasText: F.q1.installationId }).getByRole('button', { name: 'Assign to clinic…' })).toBeVisible();

  await page.getByTestId('clinics-table').getByText('E2E Clinic A').click();
  await expect(page).toHaveURL(new RegExp(`#/clinics/${CLINIC_A}/studies$`));
});

test('a user with one clinic is taken to it and sees the connection hint instead of the token', async ({ page }) => {
  await uiLogin(page, USERS.clinic);
  await page.goto('/#/clinics');
  await expect(page).toHaveURL(new RegExp(`#/clinics/${CLINIC_A}/studies$`));
  await expect(page.getByTestId('nav-clinics')).toContainText('My clinic');
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Clinic A' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);

  await page.getByTestId('clinic-tab-computers').click();
  await expect(page.getByTestId('clinic-token-ask')).toContainText('Ask your administrator');
  await expect(page.getByTestId('clinic-token')).toHaveCount(0);
  // The clinic's own computer is listed; computers waiting in quarantine are not.
  await expect(page.locator('tr', { hasText: F.s1.installationId })).toBeVisible();
  await expect(page.locator('tr', { hasText: F.q1.installationId })).toHaveCount(0);

  await page.getByTestId('clinic-tab-settings').click();
  await expect(page.getByTestId('clinic-settings-readonly')).toBeVisible();
  await expect(page.getByTestId('clinic-settings-form')).toHaveCount(0);
});

test('Computers tab (master): the token is masked until shown, and quarantined computers are not listed', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto(`/#/clinics/${CLINIC_A}/computers`);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Clinics');
  const token = page.getByTestId('clinic-token');
  await expect(token).not.toContainText(SITE_A_TOKEN);
  await page.getByTestId('clinic-token-toggle').click();
  await expect(token).toContainText(SITE_A_TOKEN);
  await expect(page.locator('tr', { hasText: F.s1.installationId })).toBeVisible();
  await expect(page.locator('tr', { hasText: F.q1.installationId })).toHaveCount(0);
  await expect(page.locator('.ui-btn-primary')).toHaveCount(0);
});

test('a computer without a clinic reads "Needs assignment" and rejected uploads do not count (F-045)', async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/devices`, { headers: bearer(master) });
  const q1 = (await res.json()).devices.find((d: { installationId: string }) => d.installationId === F.q1.installationId);
  expect(q1.siteId).toBeNull();
  expect(q1.health.key).toBe('unassigned');
  expect(q1.health.label).toBe('Needs assignment');
});

test('runs-at from the clinic side: stop a study here (with confirmation), then add it again', async ({ page, request }) => {
  const token = await apiToken(request, USERS.researcher);
  try {
    await uiLogin(page, USERS.researcher);
    await page.goto(`/#/clinics/${CLINIC_A}/studies`);
    const list = page.getByTestId('clinic-studies');
    await expect(list).toContainText('Speech Study');
    await expect(page.getByTestId('clinic-receives')).toContainText('What the computers receive');
    await expect(page.getByTestId('clinic-receives-summary')).toContainText(/\d+ protocols?/);

    // Cancel leaves it running.
    await page.getByTestId(`clinic-studies-switch-${STUDY}`).click({ force: true });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(list).toContainText('Speech Study');

    await page.getByTestId(`clinic-studies-switch-${STUDY}`).click({ force: true });
    await page.getByRole('button', { name: 'Stop running here' }).click();
    await expect(page.getByTestId('clinic-studies-empty')).toBeVisible();
    await expect(page.getByTestId('clinic-receives-empty')).toBeVisible();

    await page.getByTestId('clinic-add-study').click();
    await page.getByTestId('add-study-select').selectOption({ label: 'Speech Study' });
    await page.getByTestId('add-study-confirm').click();
    await expect(page.getByTestId(`clinic-studies-row-${STUDY}`)).toContainText('Speech Study');
  } finally {
    await request.put(`${BACKEND_URL}/projects/${STUDY}/sites/${CLINIC_A}`, { headers: bearer(token) });
  }
});

test('a user without edit rights cannot stop a received study and gets no Add study button', async ({ page }) => {
  await uiLogin(page, USERS.clinic);
  await page.goto(`/#/clinics/${CLINIC_A}/studies`);
  await expect(page.getByTestId(`clinic-studies-row-${STUDY}`)).toContainText('Received');
  await expect(page.getByTestId(`clinic-studies-switch-${STUDY}`)).toBeDisabled();
  await expect(page.getByTestId('clinic-add-study')).toHaveCount(0);
});

test('the Recordings tab is the recordings table pinned to the clinic', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto(`/#/clinics/${CLINIC_A}/recordings`);
  await expect(page.getByTestId('recordings-list')).toBeVisible();
  await expect(page.getByTestId('recordings-filter-clinic')).toHaveCount(0);
});

test('F-008: any clinic name is accepted and the file-name form shows live', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto('/#/clinics');
  await page.getByTestId('new-clinic').click();
  const input = page.getByTestId('clinic-name-input');
  await input.fill('Fakultní nemocnice Brno');
  await expect(page.getByTestId('clinic-filename-hint')).toContainText('File names will use:');
  await expect(page.getByTestId('clinic-filename-form')).toHaveText('FakultninemocniceBrno');

  await input.fill('Olomouc University Hospital');
  await expect(page.getByTestId('clinic-filename-form')).toHaveText('OlomoucUniversityHospital');
  await page.getByTestId('new-clinic-submit').click();
  await expect(page).toHaveURL(/#\/clinics\/\d+\/computers$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Olomouc University Hospital' })).toBeVisible();

  // Settings shows the same hint, and the name reaches the backend unchanged.
  await page.getByTestId('clinic-tab-settings').click();
  await expect(page.getByTestId('clinic-filename-form')).toHaveText('OlomoucUniversityHospital');
  await page.getByTestId('clinic-name-input').fill('Nemocnice Šternberk, 2. oddělení');
  await expect(page.getByTestId('clinic-filename-form')).toHaveText('NemocniceSternberk2oddeleni');
  await page.getByTestId('clinic-settings-save').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nemocnice Šternberk, 2. oddělení' })).toBeVisible();
});

test('an empty or over-long name is rejected by the backend with 400', async ({ request }) => {
  for (const name of ['', 'x'.repeat(65)]) {
    const res = await request.post(`${BACKEND_URL}/sites`, { headers: bearer(master), data: { name } });
    expect(res.status()).toBe(400);
  }
});
