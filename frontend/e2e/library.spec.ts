import { test, expect, type APIRequestContext } from '@playwright/test';
import { apiToken, bearer, uiLogin, BACKEND_URL, USERS } from './helpers/uploads';

// Protocol library (docs/ui_redesign/02_spec.md 6.10, criterion 16). Seeded entries are 4 (Speech battery) and
// 5 (Video sample), authored by the master. The spec makes its own study and its own entry so the seeded
// entries stay untouched for the other specs.
const STAMP = Date.now();
const ENTRY_NAME = `Lib spec ${STAMP}`;
const COPY_NAME = `Lib copy ${STAMP}`;
const hash = (path: string) => new RegExp(`#${path}$`);

async function api(request: APIRequestContext, token: string, method: 'get' | 'post', path: string, data?: unknown) {
  const res = await request[method](`${BACKEND_URL}${path}`, { headers: bearer(token), data });
  return res;
}

test.describe.serial('protocol library', () => {
  let master = '';
  let studyId = 0;
  let entryId = 0;
  let copyId = 0;

  test.beforeAll(async ({ request }) => {
    master = await apiToken(request, USERS.master);
    const study = await api(request, master, 'post', '/projects', { name: `Library spec study ${STAMP}` });
    expect(study.ok()).toBeTruthy();
    studyId = Number((await study.json()).id ?? (await study.json()).project_id);
    // A study protocol (a copy of entry 4), shared back into the library as our own entry.
    const copy = await api(request, master, 'post', '/library/4/copy', { project_id: studyId, name: ENTRY_NAME });
    expect(copy.ok()).toBeTruthy();
    const protocolId = (await copy.json()).protocol_id;
    const share = await api(request, master, 'post', `/protocols/${protocolId}/share`);
    expect(share.ok()).toBeTruthy();
    entryId = (await share.json()).protocol_id;
  });

  test('the list shows the seeded entries and search narrows it', async ({ page }) => {
    await uiLogin(page, USERS.master);
    await page.goto('/#/library');
    await expect(page.getByTestId('library-table')).toBeVisible();
    await expect(page.locator('.library-row-4')).toBeVisible();
    await expect(page.locator('.library-row-5')).toBeVisible();
    await expect(page.locator(`.library-row-${entryId}`)).toBeVisible();
    expect(await page.locator('.ui-btn-primary:visible').count()).toBe(0); // no primary action on the list
    await page.getByTestId('library-search').fill(String(STAMP));
    await expect(page.locator(`.library-row-${entryId}`)).toBeVisible();
    await expect(page.locator('.library-row-4')).toHaveCount(0);
    await page.getByTestId('library-search').fill('zzz-no-such-entry');
    await expect(page.getByTestId('library-empty')).toBeVisible();
  });

  test('add to study copies the entry and opens the copy', async ({ page }) => {
    await uiLogin(page, USERS.master);
    await page.goto(`/#/library/${entryId}`);
    await expect(page.getByRole('heading', { level: 1, name: ENTRY_NAME })).toBeVisible();
    await expect(page.getByTestId('library-entry-tasks')).toBeVisible();
    expect(await page.locator('.ui-btn-primary:visible').count()).toBe(1);
    await page.getByTestId('library-add').click();
    await page.getByTestId('library-add-study').selectOption(String(studyId));
    await page.getByTestId('library-add-name').fill(COPY_NAME);
    await page.getByTestId('library-add-submit').click();
    await expect(page).toHaveURL(new RegExp(`#/studies/${studyId}/protocols/(\\d+)$`));
    copyId = Number(page.url().match(/protocols\/(\d+)$/)![1]);
    await expect(page.getByTestId('protocol-editor')).toBeVisible();
  });

  test('editing the entry later does not change the copy', async ({ page, request }) => {
    const before = await (await api(request, master, 'get', `/protocols/${copyId}`)).json();
    const entry = await (await api(request, master, 'get', `/library/${entryId}`)).json();
    const save = await api(request, master, 'post', '/protocols', {
      protocol_group_id: entry.protocol_group_id,
      name: entry.name,
      language_id: [entry.language_id],
      description: 'changed in the library',
      version: entry.version + 1,
      tasks: entry.tasks.map((t: { task_id: number; task_order: number; params: unknown }) => ({ task_id: t.task_id, task_order: t.task_order, params: t.params })),
      project_id: null,
      editingMode: true,
      required_identifiers: entry.required_identifiers ?? [],
      recordings_file_name: entry.recordings_file_name,
    });
    expect(save.ok(), await save.text()).toBeTruthy();
    const after = await (await api(request, master, 'get', `/protocols/${copyId}`)).json();
    expect(after.description).toBe(before.description);
    expect(after.version).toBe(before.version);
    expect(after.project_id).toBe(studyId);

    // The editor opens the library entry in library mode: breadcrumb Library, no preview, no study bits.
    await uiLogin(page, USERS.master);
    await page.goto('/#/library');
    await page.locator('.ui-tbl-click', { hasText: ENTRY_NAME }).first().click();
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`#/library/\\d+/edit$`));
    await expect(page.getByTestId('protocol-editor')).toBeVisible();
    await expect(page.getByTestId('protocol-preview')).toHaveCount(0);
    await expect(page.getByTestId('protocol-settings')).toContainText('Saving creates a new library version');
    await expect(page.getByTestId('protocol-save')).toBeDisabled();
  });

  test('a user without library rights is refused', async ({ page, request }) => {
    const token = await apiToken(request, USERS.clinic);
    expect((await api(request, token, 'get', '/library')).status()).toBe(403);
    expect((await api(request, token, 'post', `/library/${entryId}/copy`, { project_id: studyId, name: 'x' })).status()).toBe(403);
    await uiLogin(page, USERS.clinic);
    await page.goto('/#/library');
    await expect(page.getByTestId('not-available-page')).toBeVisible();
  });

  test('another writer can add but not edit or withdraw', async ({ page, request }) => {
    const token = await apiToken(request, USERS.researcher);
    expect((await api(request, token, 'get', '/library')).ok()).toBeTruthy();
    expect((await api(request, token, 'post', `/library/${entryId}/withdraw`)).status()).toBe(403);
    await uiLogin(page, USERS.researcher);
    await page.goto(`/#/library/${entryId}`);
    await expect(page.getByTestId('library-add')).toBeVisible();
    await expect(page.getByRole('button', { name: 'More actions' })).toHaveCount(0);
    await page.goto(`/#/library/${entryId}/edit`);
    await expect(page.getByTestId('library-edit-blocked')).toBeVisible();
  });

  test('the sharer withdraws the entry; the copy stays', async ({ page, request }) => {
    await uiLogin(page, USERS.master);
    await page.goto('/#/library');
    await page.locator('.ui-tbl-click', { hasText: ENTRY_NAME }).first().click();
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Withdraw from library' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Withdraw' }).click();
    await expect(page).toHaveURL(hash('/library'));
    await expect(page.locator('.library-row-4')).toBeVisible();
    await expect(page.getByTestId('library-table')).not.toContainText(ENTRY_NAME);
    expect((await api(request, master, 'get', `/protocols/${copyId}`)).ok()).toBeTruthy();
  });
});
