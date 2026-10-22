import { test, expect } from '@playwright/test';
import { BACKEND_URL, F, USERS, apiToken, bearer, ensureSeeded, uiLogin, uploadFixture } from './helpers/uploads';

// Devices (spec §6): quarantined device visible to master, assignment releases and re-validates its
// sessions, and only a master may rename or assign.
// The "z" in the file name makes this spec run last: assigning devices moves sessions between
// sites, which would change the per-persona lists the other uploads-* specs assert.
test.describe.configure({ mode: 'serial' });

let master = '';
test.beforeAll(async ({ request }) => {
  master = await ensureSeeded(request);
});

async function deviceByInstallation(request: import('@playwright/test').APIRequestContext, token: string, installationId: string) {
  const res = await request.get(`${BACKEND_URL}/devices`, { headers: bearer(token) });
  expect(res.status()).toBe(200);
  return (await res.json()).devices.find((d: { installationId: string }) => d.installationId === installationId);
}

test('a non-master cannot rename or assign a device', async ({ request }) => {
  const dev = await deviceByInstallation(request, master, F.q2.installationId);
  expect(dev).toBeTruthy();
  const token = await apiToken(request, USERS.clinic);
  const rename = await request.put(`${BACKEND_URL}/devices/${dev.id}`, { headers: bearer(token), data: { label: 'hijack' } });
  expect(rename.status()).toBe(403);
  const assign = await request.put(`${BACKEND_URL}/devices/${dev.id}/site`, { headers: bearer(token), data: { siteId: 5 } });
  expect(assign.status()).toBe(403);
  // ...and the device of another site is not even in the clinic's list.
  expect(await deviceByInstallation(request, token, F.q2.installationId)).toBeUndefined();
});

test('master renames a device in the UI; non-masters get no rename or assign controls', async ({ page, browser }) => {
  await uiLogin(page, USERS.master);
  await page.goto('/#/admin/uploads/devices');
  const row = page.locator('tr', { hasText: F.s4.installationId });
  await row.getByRole('button', { name: 'Rename device' }).click();
  await page.getByLabel('Device name').fill('Clinic B laptop');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Device saved.')).toBeVisible();
  await expect(page.locator('tr', { hasText: F.s4.installationId }).getByText('Clinic B laptop')).toBeVisible();

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const other = await ctx.newPage();
  await uiLogin(other, USERS.clinic);
  await other.goto('/#/admin/uploads/devices');
  await expect(other.locator('tr', { hasText: F.s1.installationId })).toBeVisible();
  await expect(other.getByRole('button', { name: 'Rename device' })).toHaveCount(0);
  await expect(other.getByRole('button', { name: 'Assign to site' })).toHaveCount(0);
  await ctx.close();
});

test('assigning the quarantined device to a site moves its session and re-validates it', async ({ page, request }) => {
  const dev = await deviceByInstallation(request, master, F.q2.installationId);
  expect(dev.siteId).toBeNull();
  const before = await (await request.get(`${BACKEND_URL}/uploads/${F.q2.sessionId}`, { headers: bearer(master) })).json();
  expect(before.status).toBe('invalid');
  expect(before.invalidReason).toBe('unknown_device');
  expect(before.siteId ?? null).toBeNull();

  await uiLogin(page, USERS.master);
  await page.goto('/#/admin/uploads/devices');
  const row = page.locator('tr', { hasText: F.q2.installationId });
  await expect(row.getByText('No site (quarantine)')).toBeVisible();
  await row.getByRole('button', { name: 'Assign to site' }).click();
  await page.locator('.ut-inline-edit select').selectOption({ label: 'E2E Clinic A' });
  await page.locator('.ut-inline-edit').getByRole('button', { name: 'Assign to site' }).click();
  await page.getByRole('button', { name: 'Yes, assign' }).click();
  await expect(page.getByText('Device assigned. 1 quarantined session(s) released for checking.')).toBeVisible();

  // The API reports {moved: 1} for a further identical call's shape; verify the effect instead.
  await expect
    .poll(async () => {
      const s = await (await request.get(`${BACKEND_URL}/uploads/${F.q2.sessionId}`, { headers: bearer(master) })).json();
      return `${s.site}|${s.status}`;
    }, { timeout: 30_000 })
    .toBe('E2E Clinic A|valid');
  expect((await deviceByInstallation(request, master, F.q2.installationId)).siteName).toBe('E2E Clinic A');
});

test('the assign endpoint answers {moved: 1} for a quarantined device', async ({ request }) => {
  // A fresh quarantined device (q5), so the sessions other specs rely on stay put.
  expect((await uploadFixture(request, F.q5, { siteToken: null })).status()).toBe(404);
  const dev = await deviceByInstallation(request, master, F.q5.installationId);
  const res = await request.put(`${BACKEND_URL}/devices/${dev.id}/site`, { headers: bearer(master), data: { siteId: 5 } });
  expect(res.status()).toBe(200);
  expect((await res.json()).moved).toBe(1);
  await expect
    .poll(async () => (await (await request.get(`${BACKEND_URL}/uploads/${F.q5.sessionId}`, { headers: bearer(master) })).json()).status, { timeout: 30_000 })
    .toBe('valid');
});
