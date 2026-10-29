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
  await expect(page.getByTestId(`clinic-studies-switch-${STUDY}`)).toHaveCount(0);
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

// F-074: at 1024 px a long clinic name must not push the table past its card.
test('F-074: the clinics table stays inside its card at 1024 px with a long clinic name', async ({ page, request }) => {
  const original = 'E2E Clinic B';
  const longName = 'Fakultni nemocnice Ostrava - Klinika detske neurologie a neurochirurgie';
  const rename = (name: string) => request.patch(`${BACKEND_URL}/sites/5`, { headers: bearer(master), data: { name } });
  expect((await rename(longName.slice(0, 64))).ok()).toBe(true);
  try {
    await page.setViewportSize({ width: 1024, height: 768 });
    await uiLogin(page, USERS.master);
    await page.goto('/#/clinics');
    await expect(page.getByTestId('clinics-table').getByText(longName.slice(0, 64))).toBeVisible();
    const m = await page.evaluate(() => {
      const wrap = document.querySelector('[data-testid="clinics-table"]')!.closest('.ui-tbl-wrap') as HTMLElement;
      const card = wrap.parentElement as HTMLElement;
      return {
        wrapRight: wrap.getBoundingClientRect().right,
        cardRight: card.getBoundingClientRect().right,
        docScroll: document.documentElement.scrollWidth,
        docClient: document.documentElement.clientWidth,
        wrapScrolls: wrap.scrollWidth > wrap.clientWidth,
      };
    });
    expect(m.wrapRight).toBeLessThanOrEqual(m.cardRight + 0.5);
    expect(m.docScroll).toBeLessThanOrEqual(m.docClient);
  } finally {
    await rename(original);
  }
});

// Sticky headers: a table that is not wider than its card must not become a scroll container
// (that would pin the header inside the wrapper), so the header stays at the top of the viewport
// while the page scrolls.
test('the table header stays visible when the page scrolls and the table is not wide', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 260 });
  await uiLogin(page, USERS.master);
  await page.goto('/#/clinics');
  const table = page.getByTestId('clinics-table');
  await expect(table.getByText('E2E Clinic A')).toBeVisible();
  const state = await page.evaluate(() => {
    const wrap = document.querySelector('[data-testid="clinics-table"]')!.closest('.ui-tbl-wrap') as HTMLElement;
    return { overflowX: getComputedStyle(wrap).overflowX };
  });
  expect(state.overflowX).toBe('visible');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(0);
  const top = await table.locator('thead th').first().evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThanOrEqual(2);
});

// F-074 side effect: a scrolling table wrapper must not clip a row's action menu, even when the
// row sits at the bottom of a short viewport (the menu then opens upward and must stay open).
async function openRowMenuNearBottom(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1024, height: 420 });
  await uiLogin(page, USERS.master);
  await page.goto(`/#/clinics/${CLINIC_A}/computers`);
  const row = page.locator('tr', { hasText: F.s1.installationId.slice(0, 8) }).first();
  await row.scrollIntoViewIfNeeded();
  // Put the row at the bottom edge of the viewport, scrolling whichever ancestor can scroll.
  await row.evaluate((el) => {
    const want = window.innerHeight - 40;
    for (let n: HTMLElement | null = el as HTMLElement; n; n = n.parentElement) {
      const d = el.getBoundingClientRect().bottom - want; // negative: row is above the target
      if (d >= 0) break;
      n.scrollTop = Math.max(0, n.scrollTop + d);
    }
  });
  await row.getByRole('button', { name: /actions/i }).click();
  const item = page.getByRole('menuitem', { name: /Move to another clinic/ });
  await expect(item).toBeVisible();
  return { row, item };
}

test('F-074: a row action menu near the bottom of the viewport opens, is not clipped and stays open', async ({ page }) => {
  const { item } = await openRowMenuNearBottom(page);
  const r = await item.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { onTop: el === top || el.contains(top), inView: b.top >= 0 && b.bottom <= window.innerHeight };
  });
  expect(r).toEqual({ onTop: true, inView: true });
});

test('F-074: an open row menu follows its row on a small scroll instead of closing', async ({ page }) => {
  const { item } = await openRowMenuNearBottom(page);
  await page.mouse.move(10, 10);
  await page.mouse.wheel(0, 15);
  await page.waitForTimeout(200);
  await expect(item).toBeVisible();
  const gap = await page.evaluate(() => {
    const t = document.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')!.getBoundingClientRect();
    const m = document.querySelector('[role="menu"]')!.getBoundingClientRect();
    return Math.min(Math.abs(m.top - t.bottom), Math.abs(t.top - m.bottom));
  });
  expect(gap).toBeLessThan(12);
});

// F-087: the Computers table shows the config version each computer got.
test('F-087: the Computers table has a Config column', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto(`/#/clinics/${CLINIC_A}/computers`);
  const table = page.getByTestId('clinic-computers-table');
  await expect(table.getByRole('columnheader', { name: 'Config' })).toBeVisible();
  const row = table.locator('tr', { hasText: F.s1.installationId.slice(0, 8) });
  await expect(row.locator('[data-testid^="computer-config-"]')).toBeVisible();
});
