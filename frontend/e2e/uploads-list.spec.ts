import { test, expect } from '@playwright/test';
import { F, SITE_A_SESSIONS, USERS, ensureSeeded, uiLogin } from './helpers/uploads';

// The Recordings list (#/recordings, spec §6.1): one primary action, the Clinic filter and column
// for people with a choice of clinics, the master-only quarantine banner, KPI filters and the
// filter context that the detail page uses for Previous/Next.
test.beforeAll(async ({ request }) => {
  await ensureSeeded(request);
});

test('master: one primary button, the Clinic filter and column, and the quarantine banner', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto('/#/recordings');
  await expect(page.getByRole('heading', { name: 'Recordings', level: 1 })).toBeVisible();
  await expect(page.locator('tbody tr.clickable').first()).toBeVisible();

  await expect(page.locator('.ui-btn-primary')).toHaveCount(1);
  await expect(page.getByTestId('recordings-download')).toHaveClass(/ui-btn-primary/);
  await expect(page.getByTestId('recordings-filter-clinic')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Clinic' })).toBeVisible();

  const banner = page.getByTestId('recordings-unassigned-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/not assigned to a clinic/);
  await banner.getByRole('link').click();
  await expect(page).toHaveURL(/#\/clinics(#unassigned-computers)?$/);
});

test('master: Export CSV sits in the "more actions" menu', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto('/#/recordings');
  await page.getByRole('button', { name: 'More actions' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test('a one-clinic user sees no Clinic filter, no Clinic column and no banner', async ({ page }) => {
  await uiLogin(page, USERS.clinic);
  await page.goto('/#/recordings');
  await expect(page.locator('tbody tr.clickable')).toHaveCount(SITE_A_SESSIONS.length);

  await expect(page.locator('.ui-btn-primary')).toHaveCount(1);
  await expect(page.getByTestId('recordings-filter-clinic')).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Clinic' })).toHaveCount(0);
  await expect(page.getByTestId('recordings-unassigned-banner')).toHaveCount(0);
  // The other filters stay.
  await expect(page.getByTestId('recordings-filter-study')).toBeVisible();
  await expect(page.getByTestId('recordings-filter-review')).toBeVisible();
});

test('?clinic= narrows the list, and a KPI card applies and clears its filter', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto('/#/recordings?clinic=4');
  await expect(page.locator('tbody tr.clickable')).toHaveCount(SITE_A_SESSIONS.length);
  await expect(page.getByTestId('recordings-filter-clinic')).toHaveValue('4');

  const card = page.getByTestId('recordings-kpi-invalid');
  await card.click();
  await expect(page).toHaveURL(/status=invalid/);
  await expect(page.locator('tbody tr.clickable')).toHaveCount(1);
  await expect(page.locator('tbody tr.clickable', { hasText: F.s3.sessionId.slice(0, 8) })).toBeVisible();
  await card.click();
  await expect(page).not.toHaveURL(/status=invalid/);
  await expect(page.locator('tbody tr.clickable')).toHaveCount(SITE_A_SESSIONS.length);
});

test('a row opens the recording with the list filter as ctx', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto('/#/recordings?clinic=4');
  await page.locator('tbody tr.clickable', { hasText: F.s1.sessionId.slice(0, 8) }).click();
  await expect(page).toHaveURL(new RegExp(`#/recordings/${F.s1.sessionId}\\?ctx=site%3D4`));
});

test('a filter with no match shows the empty state with a way back', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto('/#/recordings');
  await page.getByTestId('recordings-search').fill('no-such-patient-code');
  await expect(page.getByTestId('recordings-empty')).toContainText('No recordings match these filters');
  await page.getByTestId('recordings-clear-filters').click();
  await expect(page.locator('tbody tr.clickable').first()).toBeVisible();
});
