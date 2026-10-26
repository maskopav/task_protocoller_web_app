import { test, expect, type Page } from '@playwright/test';
import { apiToken, bearer, uiLogin, BACKEND_URL, USERS } from './helpers/uploads';

// Studies screens (docs/ui_redesign/02_spec.md 6.3 to 6.5), checked in a browser:
//  - master: create a study and a blank protocol; the editor ends on the REAL new id (F-058);
//  - master: add a protocol from the library, and the creator / last editor cannot be removed;
//  - clinic@test.com: a received study is read-only everywhere (lock);
//  - researcher@ / editor@: "runs at" from the study side, and editors add / remove.
// Study 3 ("Speech Study", clinics 4 and 5) and the users come from e2e_seed.sql; library entries are 4 and 5.
const SEEDED_STUDY = 3;
const SEEDED_PROTOCOL = 2;
const CLINIC_B = 5;

const hash = (path: string) => new RegExp(`#${path}$`);
const NEW_STUDY = `E2E Studies ${Date.now()}`;

async function primaryButtons(page: Page) {
  return page.locator('.ui-btn-primary:visible').count();
}

test.describe.serial('master creates a study and protocols', () => {
  let studyId = 0;

  test('the studies list has one group and one primary action', async ({ page }) => {
    await uiLogin(page, USERS.master);
    await page.goto('/#/studies');
    await expect(page.getByTestId('studies-group-all')).toBeVisible();
    await expect(page.getByTestId('studies-new')).toBeVisible();
    expect(await primaryButtons(page)).toBe(1);
    await expect(page.getByTestId('studies-group-yours')).toHaveCount(0);
  });

  test('New study opens Study > Protocols with an empty state', async ({ page }) => {
    await uiLogin(page, USERS.master);
    await page.goto('/#/studies');
    await page.getByTestId('studies-new').click();
    const modal = page.getByTestId('new-study-modal');
    await modal.getByLabel('Name').fill(NEW_STUDY);
    await modal.getByLabel('Description').fill('Created by the studies e2e spec');
    await page.getByTestId('new-study-submit').click();
    await expect(page).toHaveURL(/#\/studies\/(\d+)\/protocols$/);
    studyId = Number(page.url().match(/studies\/(\d+)\//)![1]);
    await expect(page.getByRole('heading', { level: 1, name: NEW_STUDY })).toBeVisible();
    await expect(page.getByTestId('protocols-empty')).toBeVisible();
    await expect(page.getByTestId('protocols-create-first')).toBeVisible();
    expect(await primaryButtons(page)).toBe(1); // "New protocol" only
  });

  test('a blank protocol is saved and the editor moves to its real id (F-058)', async ({ page }) => {
    await uiLogin(page, USERS.master);
    await page.goto(`/#/studies/${studyId}/protocols`);
    await page.getByTestId('study-new-protocol').click();
    await page.getByTestId('new-protocol-name').fill('Blank e2e protocol');
    await page.getByTestId('new-protocol-language').selectOption('en');
    await page.getByTestId('new-protocol-create').click();

    // The draft is not saved yet: no id, but never "undefined".
    await expect(page).toHaveURL(hash(`/studies/${studyId}/protocols/new`));
    await expect(page.getByTestId('protocol-editor')).toBeVisible();
    await expect(page.getByTestId('protocol-save')).toBeDisabled();
    // F-006: the new protocol starts with the patient code identifier and a file-name template that uses it.
    await expect(page.getByTestId('protocol-settings')).toContainText('Participant code');
    await expect(page.getByTestId('protocol-settings')).toContainText('${field.patient_code}');

    await page.locator('.pe-option .ui-icon-btn').first().click();
    await page.getByTestId('modal-save').click();
    await expect(page.locator('.protocol-item')).toHaveCount(1);
    await expect(page.getByTestId('protocol-save')).toBeEnabled();
    await page.getByTestId('protocol-save').click();

    await expect(page).toHaveURL(new RegExp(`#/studies/${studyId}/protocols/\\d+$`));
    expect(page.url()).not.toContain('undefined');
    await expect(page.getByTestId('protocol-version')).toHaveText('v1');
    await expect(page.getByTestId('protocol-save')).toBeDisabled(); // clean again

    await page.goto(`/#/studies/${studyId}/protocols`);
    await expect(page.getByTestId('study-protocols-table')).toContainText('Blank e2e protocol');
  });

  test('a library entry is added as a copy and the tab stays', async ({ page }) => {
    await uiLogin(page, USERS.master);
    await page.goto(`/#/studies/${studyId}/protocols`);
    await page.getByTestId('study-new-protocol').click();
    await page.getByTestId('new-protocol-library-tab').click();
    await expect(page.getByTestId('library-entry-5')).toBeVisible();
    await page.getByTestId('library-entry-5').click();
    await expect(page.getByTestId('new-protocol-lib-name')).toHaveValue('Video sample');
    await page.getByTestId('new-protocol-add').click();
    await expect(page).toHaveURL(hash(`/studies/${studyId}/protocols`));
    await expect(page.getByTestId('study-protocols-table')).toContainText('Video sample');
    await expect(page.getByTestId('study-protocols-table')).toContainText('From library: Video sample v1');
  });

  test('a name already used in the study is rejected inline', async ({ page }) => {
    await uiLogin(page, USERS.master);
    await page.goto(`/#/studies/${studyId}/protocols`);
    await page.getByTestId('study-new-protocol').click();
    await page.getByTestId('new-protocol-name').fill('blank E2E protocol');
    await expect(page.getByTestId('new-protocol-modal')).toContainText('already has a protocol with this name');
    await expect(page.getByTestId('new-protocol-create')).toBeDisabled();
  });

  test('the creator is the only editor and cannot be removed', async ({ page }) => {
    await uiLogin(page, USERS.master);
    await page.goto(`/#/studies/${studyId}/editors`);
    const table = page.getByTestId('study-editors-table');
    await expect(table).toContainText('Creator');
    await expect(table.getByRole('button', { name: 'Remove' })).toHaveCount(0);
  });

  test('archive and restore the study from the menu', async ({ page }) => {
    await uiLogin(page, USERS.master);
    await page.goto(`/#/studies/${studyId}/protocols`);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Archive study' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive study' }).click();
    await expect(page.getByTestId('study-status')).toHaveText('Archived');
    await expect(page.getByTestId('study-new-protocol')).toHaveCount(0);

    await page.goto('/#/studies');
    await expect(page.getByTestId('studies-group-all')).not.toContainText(NEW_STUDY);
    await page.getByTestId('studies-show-archived').check();
    await expect(page.getByTestId('studies-group-all')).toContainText(NEW_STUDY);

    await page.goto(`/#/studies/${studyId}/protocols`);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Restore study' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restore study' }).click();
    await expect(page.getByTestId('study-status')).toHaveText('Active');
  });
});

test.describe('a received study is locked', () => {
  test('clinic@test.com sees it under Received, with no edit controls', async ({ page }) => {
    await uiLogin(page, USERS.clinic);
    await page.goto('/#/studies');
    await expect(page.getByTestId('studies-group-received')).toContainText('Speech Study');
    await expect(page.getByTestId('studies-group-yours')).toHaveCount(0);
    await expect(page.getByTestId('studies-new')).toHaveCount(0);

    await page.getByTestId('studies-group-received').getByRole('link', { name: 'Speech Study' }).click();
    await expect(page).toHaveURL(hash(`/studies/${SEEDED_STUDY}/protocols`));
    await expect(page.getByTestId('study-received-badge')).toBeVisible();
    await expect(page.getByTestId('study-received-banner')).toContainText('Managed by');
    await expect(page.getByTestId('study-new-protocol')).toHaveCount(0);
    expect(await primaryButtons(page)).toBe(0);
    await expect(page.getByTestId('study-tab-clinics')).toHaveCount(0);
    await expect(page.getByTestId('study-tab-editors')).toHaveCount(0);
    await expect(page.getByTestId('study-tab-recordings')).toBeVisible();

    // The row menu offers Preview only.
    await page.getByRole('button', { name: /Actions for Speech battery/ }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Preview']);
    await page.keyboard.press('Escape');

    // A tab the user may not have falls back to Protocols.
    await page.goto(`/#/studies/${SEEDED_STUDY}/editors`);
    await expect(page).toHaveURL(hash(`/studies/${SEEDED_STUDY}/protocols`));
  });

  test('its recordings tab is pinned to the study, and the editor opens in view mode', async ({ page }) => {
    await uiLogin(page, USERS.reviewer);
    await page.goto(`/#/studies/${SEEDED_STUDY}/recordings`);
    await expect(page.getByTestId('study-recordings')).toBeVisible();

    await page.goto(`/#/studies/${SEEDED_STUDY}/protocols/${SEEDED_PROTOCOL}`);
    await expect(page.getByTestId('protocol-readonly-banner')).toContainText('Read-only: managed by');
    await expect(page.getByTestId('protocol-save')).toHaveCount(0);
    await expect(page.getByTestId('task-catalogue')).toHaveCount(0);
    await expect(page.getByTestId('protocol-preview')).toBeVisible();
  });

  test('the server refuses the change as well', async ({ request }) => {
    const token = await apiToken(request, USERS.clinic);
    const res = await request.post(`${BACKEND_URL}/projects/${SEEDED_STUDY}/editors`, { headers: bearer(token), data: { email: USERS.nogrant } });
    expect(res.status()).toBe(403);
  });
});

test.describe.serial('runs at, from the study side', () => {
  test('an editor only toggles the clinics they see', async ({ page }) => {
    await uiLogin(page, USERS.editor); // edits study 3, assigned to clinic B only
    await page.goto(`/#/studies/${SEEDED_STUDY}/clinics`);
    await expect(page.getByTestId('study-runs-at-row-5')).toBeVisible();
    await expect(page.getByTestId('study-runs-at-row-4')).toHaveCount(0);
    await expect(page.getByTestId('study-runs-at-switch-5')).toBeChecked();
  });

  test('turning a clinic off asks first, and turning it on again restores it', async ({ page, request }) => {
    const token = await apiToken(request, USERS.researcher);
    const runsAt = async () => (await (await request.get(`${BACKEND_URL}/projects/${SEEDED_STUDY}`, { headers: bearer(token) })).json()).site_count;
    expect(await runsAt()).toBe(2);
    try {
      await uiLogin(page, USERS.researcher);
      await page.goto(`/#/studies/${SEEDED_STUDY}/clinics`);
      const sw = page.getByTestId(`study-runs-at-switch-${CLINIC_B}`);
      await expect(sw).toBeChecked();

      // Cancel keeps it on.
      await sw.click();
      await expect(page.getByRole('dialog')).toContainText('will stop receiving this study');
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
      await expect(sw).toBeChecked();
      expect(await runsAt()).toBe(2);

      // Confirm turns it off.
      await sw.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Stop running here' }).click();
      await expect(sw).not.toBeChecked();
      await expect.poll(runsAt).toBe(1);

      await sw.click();
      await expect(sw).toBeChecked();
      await expect.poll(runsAt).toBe(2);
    } finally {
      await request.put(`${BACKEND_URL}/projects/${SEEDED_STUDY}/sites/${CLINIC_B}`, { headers: bearer(token) });
    }
  });
});

test.describe.serial('editors', () => {
  test('an unknown email is explained, a known one is added and removed', async ({ page, request }) => {
    const token = await apiToken(request, USERS.researcher);
    try {
      await uiLogin(page, USERS.researcher);
      await page.goto(`/#/studies/${SEEDED_STUDY}/editors`);
      const table = page.getByTestId('study-editors-table');
      await expect(table).toContainText(USERS.researcher);

      await page.getByTestId('study-add-editor').click();
      await page.getByTestId('add-editor-email').fill('nobody@test.com');
      await page.getByTestId('add-editor-submit').click();
      await expect(page.getByTestId('add-editor-modal')).toContainText('No user with this email.');

      await page.getByTestId('add-editor-email').fill(USERS.nogrant);
      await page.getByTestId('add-editor-submit').click();
      await expect(page.getByTestId('add-editor-modal')).toHaveCount(0);
      await expect(table).toContainText(USERS.nogrant);

      const list = await (await request.get(`${BACKEND_URL}/projects/${SEEDED_STUDY}/editors`, { headers: bearer(token) })).json();
      const added = list.find((e: { email: string }) => e.email === USERS.nogrant);
      await page.getByTestId(`editor-remove-${added.user_id}`).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
      await expect(table).not.toContainText(USERS.nogrant);
    } finally {
      const list = await (await request.get(`${BACKEND_URL}/projects/${SEEDED_STUDY}/editors`, { headers: bearer(token) })).json();
      const left = list.find((e: { email: string }) => e.email === USERS.nogrant);
      if (left) await request.delete(`${BACKEND_URL}/projects/${SEEDED_STUDY}/editors/${left.user_id}`, { headers: bearer(token) });
    }
  });
});
