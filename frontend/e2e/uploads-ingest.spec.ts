import { test, expect } from '@playwright/test';
import {
  BACKEND_URL, F, USERS, apiToken, bearer, ensureSeeded, uiLogin, uploadFixture, visibleIds, zipOf,
} from './helpers/uploads';

// Ingest through the real POST /upload path (spec §3), seen from the admin UI and API.
test.describe.configure({ mode: 'serial' });

let master = '';
test.beforeAll(async ({ request }) => {
  master = await ensureSeeded(request);
});

const row = (page: import('@playwright/test').Page, id: string) => page.locator('tr.clickable', { hasText: id.slice(0, 8) });

test('a valid upload shows as valid and a manifest hash mismatch as invalid with its reason', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto('/#/admin/uploads');

  const ok = row(page, F.s1.sessionId);
  await expect(ok).toBeVisible();
  await expect(ok.getByText('Valid', { exact: true })).toBeVisible();

  const bad = row(page, F.s3.sessionId);
  await expect(bad.getByText('Invalid', { exact: true })).toBeVisible();
  await expect(bad.getByText('Manifest hash mismatch')).toBeVisible();
});

test('a re-send gets the original receipt and the Re-sent flag', async ({ page, request }) => {
  const detail = await (await request.get(`${BACKEND_URL}/uploads/${F.s2.sessionId}`, { headers: bearer(master) })).json();

  const res = await uploadFixture(request, F.s2);
  expect(res.status()).toBe(200);
  const receipt = await res.json();
  expect(receipt).toMatchObject({
    status: 'ok',
    sessionId: F.s2.sessionId,
    sha256: zipOf(F.s2).sha256,
    bytes: detail.bytes,
    receivedAt: detail.receivedAt, // the original receipt, not a new timestamp
  });

  const after = await (await request.get(`${BACKEND_URL}/uploads/${F.s2.sessionId}`, { headers: bearer(master) })).json();
  expect(after.issues).toContain('duplicate');
  expect(after.receivedAt).toBe(detail.receivedAt);

  await uiLogin(page, USERS.master);
  await page.goto(`/#/admin/uploads/${F.s2.sessionId}`);
  await expect(page.getByText('Re-sent', { exact: true }).first()).toBeVisible();
});

test('an upload without a site token from a new device is quarantined and visible to master only', async ({ page, request }) => {
  const res = await uploadFixture(request, F.q3, { siteToken: null });
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: 'device_not_registered', quarantined: true });

  const q = F.q3.sessionId;
  expect(await visibleIds(request, master)).toContain(q);
  for (const who of [USERS.clinic, USERS.editor, USERS.reviewer, USERS.nogrant]) {
    const token = await apiToken(request, who);
    expect(await visibleIds(request, token), who).not.toContain(q);
    const one = await request.get(`${BACKEND_URL}/uploads/${q}`, { headers: bearer(token) });
    expect(one.status(), who).toBe(404);
  }

  await uiLogin(page, USERS.master);
  await page.goto('/#/admin/uploads');
  const r = row(page, q);
  await expect(r.getByText('Invalid', { exact: true })).toBeVisible();
  await expect(r.getByText('Device not registered')).toBeVisible();
});
