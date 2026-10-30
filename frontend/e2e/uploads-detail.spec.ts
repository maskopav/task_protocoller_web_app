import { test, expect } from '@playwright/test';
import { BACKEND_URL, F, USERS, apiToken, bearer, ensureSeeded, uiLogin } from './helpers/uploads';

// Recording detail (spec §6.2): masked participant data, audited edit, review and comments,
// the Activity section (F-044) and the quarantined state (F-043).
// Works on session s4, which no other spec asserts on.
test.describe.configure({ mode: 'serial' });

const id = F.s4.sessionId;

test.beforeAll(async ({ request }) => {
  await ensureSeeded(request);
});

test('participant values are masked until "Show values"', async ({ page, request }) => {
  // The API itself never sends them.
  const token = await apiToken(request, USERS.master);
  const detail = await (await request.get(`${BACKEND_URL}/uploads/${id}`, { headers: bearer(token) })).json();
  expect(detail.participant.fields.sex).toBeNull();
  expect(detail.participant.fields.year_of_birth).toBeNull();
  expect(detail.participant.maskedKeys).toEqual(expect.arrayContaining(['sex', 'year_of_birth']));

  await uiLogin(page, USERS.master);
  await page.goto(`/#/recordings/${id}`);
  await expect(page.getByTestId('masked-sex')).toBeVisible();
  await expect(page.getByTestId('masked-year_of_birth')).toBeVisible();
  await expect(page.getByText('female', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Show values' }).click();
  await expect(page.getByText('female', { exact: true })).toBeVisible();
  await expect(page.getByText('1950', { exact: true })).toBeVisible();
  await expect(page.getByTestId('masked-sex')).toHaveCount(0);

  await page.getByRole('button', { name: 'Hide values' }).click();
  await expect(page.getByTestId('masked-sex')).toBeVisible();
});

test('editing works and blanking the patient code is refused', async ({ page, request }) => {
  await uiLogin(page, USERS.master);
  await page.goto(`/#/recordings/${id}`);
  await page.getByRole('button', { name: 'Edit', exact: false }).first().click();

  const code = page.getByLabel('Participant code', { exact: true });
  await expect(code).toHaveValue('testx');
  await code.fill('');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Patient code and visit cannot be empty.' })).toBeVisible();

  // The server refuses it too.
  const token = await apiToken(request, USERS.master);
  const refused = await request.patch(`${BACKEND_URL}/uploads/${id}/participant`, {
    headers: bearer(token), data: { fields: { patient_code: '' } },
  });
  expect(refused.status()).toBe(400);

  await page.getByLabel('Year of birth', { exact: true }).fill('1951');
  await code.fill('testx');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByLabel('Year of birth', { exact: true })).toHaveCount(0); // left edit mode
  await expect(page.locator('.recd-thread').getByText('edited participant fields: year_of_birth')).toBeVisible();
  await page.getByRole('button', { name: 'Show values' }).click();
  await expect(page.getByText('1951', { exact: true })).toBeVisible();
});

test('a review change and a comment appear in the thread', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto(`/#/recordings/${id}`);

  const review = page.getByRole('button', { name: /Needs review/ });
  await review.click();
  await expect(review).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/set review to/i).first()).toBeVisible();

  const text = `e2e comment ${Date.now()}`;
  await page.getByLabel('Add a comment for the clinic team').fill(text);
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.getByText(text)).toBeVisible();

  // Survives a reload: it is stored, not just local state.
  await page.reload();
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByRole('button', { name: /Needs review/ })).toHaveAttribute('aria-pressed', 'true');
});

test('revealing a hidden field shows up in the collapsed Activity section (F-044)', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto(`/#/recordings/${id}`);

  const activity = page.getByTestId('recording-activity');
  await expect(activity).toBeVisible();
  await expect(activity.locator('summary')).not.toContainText('revealed participant fields');
  expect(await activity.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);

  await page.getByRole('button', { name: 'Show values' }).click();
  await expect(page.getByText('female', { exact: true })).toBeVisible();

  await activity.locator('summary').click();
  await expect(activity.getByTestId('activity-entry').filter({ hasText: 'revealed participant fields' }).first()).toBeVisible();
});

test('a quarantined recording shows the amber strip and "Assign computer…" as its one primary action (F-043)', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto(`/#/recordings/${F.q1.sessionId}`);

  await expect(page.getByTestId('recording-quarantine')).toContainText("Quarantined: this computer isn't assigned to a clinic");
  await expect(page.locator('.ui-btn-primary')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Assign computer…' })).toHaveClass(/ui-btn-primary/);
  await expect(page.getByRole('button', { name: 'Download ZIP' })).toHaveCount(0);

  // Download moves into the "⋯" menu.
  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Download ZIP' })).toBeVisible();
  await page.keyboard.press('Escape');

  // The dialog lists the clinics; nothing is assigned here (the devices spec owns that).
  await page.getByRole('button', { name: 'Assign computer…' }).click();
  await expect(page.getByRole('dialog')).toContainText('Assign computer to a clinic');
  await expect(page.getByTestId('assign-confirm')).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('a normal recording has Download ZIP as its one primary action', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto(`/#/recordings/${F.s4.sessionId}`);
  await expect(page.locator('.ui-btn-primary')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toHaveClass(/ui-btn-primary/);
  await expect(page.getByTestId('recording-quarantine')).toHaveCount(0);
});
