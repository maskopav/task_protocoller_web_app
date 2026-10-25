import { test, expect, type Page } from '@playwright/test';

// UI redesign, acceptance criteria 1 and 2 (docs/ui_redesign/02_spec.md §10):
//  1. every route except auth and the preview renders the shell with its nav;
//  2. every old route redirects to its new home.
// Study 3, "E2E Clinic A" (site 4) and clinic@test.com come from e2e_seed.sql;
// protocol 1 belongs to study 1 (artificial_data.sql / e2e_seed.sql).
const PASSWORD = '1234';
const STUDY_ID = 3;
const CLINIC_ID = 4;
const PROTOCOL_ID = 1;
const SESSION_ID = 'e2e00100000000000000000000000000';

async function login(page: Page, email: string) {
  // The app defaults to Czech; the saved language wins once the shell mounts.
  await page.addInitScript(() => localStorage.setItem("appLanguage", "en"));
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/recordings$/);
}

const hashUrl = (path: string) => new RegExp(`#${path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`);

const REDIRECTS: Array<[string, string]> = [
  ['/admin', '/recordings'],
  ['/admin/uploads', '/recordings'],
  [`/admin/uploads/${SESSION_ID}`, `/recordings/${SESSION_ID}`],
  ['/admin/uploads/devices', '/clinics'],
  ['/admin/uploads/downloads', '/recordings'],
  [`/admin/projects/${STUDY_ID}`, `/studies/${STUDY_ID}`],
  [`/admin/projects/${STUDY_ID}/protocols`, `/studies/${STUDY_ID}/protocols`],
  [`/admin/projects/${STUDY_ID}/protocols/${PROTOCOL_ID}`, `/studies/${STUDY_ID}/protocols/${PROTOCOL_ID}`],
  [`/admin/sites/${CLINIC_ID}`, `/clinics/${CLINIC_ID}`],
  ['/admin/project-management', '/studies'],
  ['/admin/site-management', '/clinics'],
  ['/admin/admin-management', '/users'],
  ['/participant/test', '/recordings'],
];

test.describe('as master', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'master@test.com');
  });

  for (const [from, to] of REDIRECTS) {
    test(`old route ${from} redirects to ${to}`, async ({ page }) => {
      await page.goto(`/#${from}`);
      await expect(page).toHaveURL(hashUrl(to));
      await expect(page.getByTestId('app-shell')).toBeVisible();
    });
  }

  test('old query parameters ?site= and ?project= become ?clinic= and ?study=', async ({ page }) => {
    await page.goto(`/#/admin/uploads?site=${CLINIC_ID}&project=${STUDY_ID}`);
    await expect(page).toHaveURL(new RegExp(`#/recordings\\?clinic=${CLINIC_ID}&study=${STUDY_ID}$`));
  });

  const ROUTES = [
    '/recordings',
    `/recordings/${SESSION_ID}`,
    '/studies',
    `/studies/${STUDY_ID}`,
    `/studies/${STUDY_ID}/protocols`,
    `/studies/${STUDY_ID}/clinics`,
    `/studies/1/protocols/${PROTOCOL_ID}`,
    '/clinics',
    `/clinics/${CLINIC_ID}`,
    `/clinics/${CLINIC_ID}/computers`,
    '/library',
    `/library/${PROTOCOL_ID}`,
    `/library/${PROTOCOL_ID}/edit`,
    '/users',
    '/users/1',
    '/no/such/page',
  ];

  for (const route of ROUTES) {
    test(`${route} renders the shell with the master navigation`, async ({ page }) => {
      await page.goto(`/#${route}`);
      await expect(page.getByTestId('app-shell')).toBeVisible();
      for (const id of ['nav-recordings', 'nav-studies', 'nav-clinics', 'nav-library', 'nav-users']) {
        await expect(page.getByTestId(id)).toBeVisible();
      }
    });
  }

  test('the protocol editor runs in the collapsed shell', async ({ page }) => {
    await page.goto(`/#/studies/1/protocols/${PROTOCOL_ID}`);
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-collapsed', 'true');
    await page.goto('/#/recordings');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-collapsed', 'false');
  });

  test('an unknown route shows the 404 page with a link to Recordings', async ({ page }) => {
    await page.goto('/#/no/such/page');
    await expect(page.getByTestId('not-found-page')).toBeVisible();
    await page.getByTestId('not-found-home').click();
    await expect(page).toHaveURL(hashUrl('/recordings'));
  });

  test('the language select in the user menu switches the navigation labels', async ({ page }) => {
    await page.getByTestId('shell-language').selectOption('de');
    await expect(page.getByTestId('nav-recordings')).toContainText('Aufnahmen');
    await page.getByTestId('shell-language').selectOption('en');
    await expect(page.getByTestId('nav-recordings')).toContainText('Recordings');
  });
});

test.describe('as a one-clinic user', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'clinic@test.com');
  });

  test('#/clinics lands on the only clinic and the nav says "My clinic"', async ({ page }) => {
    await page.getByTestId('nav-recordings').waitFor();
    await page.goto('/#/clinics');
    await expect(page).toHaveURL(hashUrl(`/clinics/${CLINIC_ID}`));
    await expect(page.getByTestId('nav-clinics')).toContainText('My clinic');
    await expect(page.getByTestId('nav-users')).toHaveCount(0);
  });

  test('#/users shows the Not available page inside the shell', async ({ page }) => {
    await page.goto('/#/users');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expect(page.getByTestId('not-available-page')).toBeVisible();
    await expect(page).toHaveURL(hashUrl('/users'));
  });
});
