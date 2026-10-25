import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BACKEND_URL, F, USERS, apiToken, bearer, ensureSeeded, uiLogin, zipEntries } from './helpers/uploads';

// Downloads (spec §9): single ZIP, bundle through the Downloads page, and download tickets.
test.beforeAll(async ({ request }) => {
  await ensureSeeded(request);
});

test('the single ZIP download is named <sessionId>.zip', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto(`/#/admin/uploads/${F.s1.sessionId}`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download ZIP/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${F.s1.sessionId}.zip`);

  // The list's per-row button does the same.
  await page.goto('/#/admin/uploads');
  const [fromList] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('tr.clickable', { hasText: F.s2.sessionId.slice(0, 8) }).getByRole('button', { name: 'Download ZIP' }).click(),
  ]);
  expect(fromList.suggestedFilename()).toBe(`${F.s2.sessionId}.zip`);
});

test('the Downloads page bundles two selected sessions; select all skips the invalid one', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto('/#/recordings/downloads');

  await page.locator('label.ut-field.grow select').selectOption({ label: 'E2E Clinic A' });
  // Show the invalid session too: it must still not be picked by "select all".
  await page.getByLabel('Hide excluded & invalid').uncheck();
  const rows = page.locator('tbody tr.clickable');
  await expect(rows).toHaveCount(3);

  await page.getByLabel('Select all sessions shown').check();
  const boxes = rows.locator('input[type="checkbox"]');
  await expect(boxes.filter({ has: page.locator(':checked') })).toHaveCount(0); // sanity: filter by state below
  await expect(rows.locator('input[type="checkbox"]:checked')).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Invalid' }).locator('input[type="checkbox"]')).not.toBeChecked();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download 2' }).click(),
  ]);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-e2e-bundle-')), 'bundle.zip');
  await download.saveAs(file);

  const names = await zipEntries(file);
  expect(names).toContain('sessions.csv');
  expect(names).toContain(`${F.s1.sessionId}.zip`);
  expect(names).toContain(`${F.s2.sessionId}.zip`);
  expect(names).not.toContain(`${F.s3.sessionId}.zip`);
});

test.describe('download tickets', () => {
  async function ticket(request: import('@playwright/test').APIRequestContext) {
    const session = await apiToken(request, USERS.master);
    const res = await request.post(`${BACKEND_URL}/uploads/ticket`, { headers: bearer(session) });
    expect(res.status()).toBe(200);
    const { ticket } = await res.json();
    expect(ticket).toBeTruthy();
    return { session, ticket: ticket as string };
  }

  test('a ticket downloads a ZIP', async ({ request }) => {
    const { ticket: t } = await ticket(request);
    const res = await request.get(`${BACKEND_URL}/uploads/${F.s1.sessionId}/zip?ticket=${encodeURIComponent(t)}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toContain(`${F.s1.sessionId}.zip`);
  });

  test('a ticket is refused on non-download routes, as a Bearer token, and to mint tickets', async ({ request }) => {
    const { ticket: t } = await ticket(request);
    const list = await request.get(`${BACKEND_URL}/uploads?ticket=${encodeURIComponent(t)}`);
    expect([401, 403]).toContain(list.status());
    const detail = await request.get(`${BACKEND_URL}/uploads/${F.s1.sessionId}?ticket=${encodeURIComponent(t)}`);
    expect([401, 403]).toContain(detail.status());

    const asBearer = await request.get(`${BACKEND_URL}/uploads`, { headers: bearer(t) });
    expect([401, 403]).toContain(asBearer.status());
    const mint = await request.post(`${BACKEND_URL}/uploads/ticket`, { headers: bearer(t) });
    expect([401, 403]).toContain(mint.status());
  });

  test('a ticket does not widen scope: out-of-scope sessions are 404', async ({ request }) => {
    const session = await apiToken(request, USERS.editor); // sees Clinic B only
    const res = await request.post(`${BACKEND_URL}/uploads/ticket`, { headers: bearer(session) });
    const { ticket: t } = await res.json();
    const other = await request.get(`${BACKEND_URL}/uploads/${F.s1.sessionId}/zip?ticket=${encodeURIComponent(t)}`);
    expect(other.status()).toBe(404);
    const own = await request.get(`${BACKEND_URL}/uploads/${F.s4.sessionId}/zip?ticket=${encodeURIComponent(t)}`);
    expect(own.status()).toBe(200);
  });
});
