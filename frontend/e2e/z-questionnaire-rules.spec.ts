import { test, expect, type Locator, type Page } from '@playwright/test';

// Questionnaire conditional rules (docs/questionnaire_rules/01_spec.md):
// a rule built in the questionnaire dialog survives save + reload and reaches
// the desktop app as `showIf` on /site-config. Edits the seeded protocol 1,
// whose task 3 is the "Quick Check" questionnaire (q1: single, Good/Bad).
// Named z-* so it runs last: saving bumps the protocol version, which the
// other specs (site-config, studies) don't expect. The DB is reseeded per run.
const BACKEND_URL = 'http://localhost:3001';
const SITE_TOKEN = 'e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2';
const QUESTIONNAIRE_TASK = 2;

const answer = (rule: Locator, label: string) =>
  rule.locator('.qm-condition-values label', { hasText: label }).locator('input');

async function loginAsMaster(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill('master@test.com');
  await page.locator('input[name="password"]').fill('1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/recordings$/);
}

test('a conditional question is saved, reloaded and emitted as showIf', async ({ page, request }) => {
  await loginAsMaster(page);
  await page.goto('/#/studies/1/protocols/1');
  await expect(page.locator('.protocol-item')).toHaveCount(3);

  await page.getByTestId(`task-edit-${QUESTIONNAIRE_TASK}`).click();
  const dialog = page.getByRole('dialog');
  await page.getByTestId('qm-add-question').click();
  const card = dialog.locator('.qm-question-card').last();
  await card.locator('input.question-text').fill('What felt bad?');

  // Locale-independent: the rule tick box is the first checkbox of the block;
  // answer checkboxes are labelled with the (untranslated) option text.
  const rule = card.getByTestId('qm-condition');
  await rule.locator('input[type="checkbox"]').first().check();
  await expect(rule.locator('select')).toContainText('Q1: How did that feel?');
  await expect(rule.locator('.qm-condition-hint')).toBeVisible();
  await answer(rule, 'Bad').check();
  await expect(rule.locator('.qm-condition-hint')).toHaveCount(0);
  await page.getByTestId('modal-save').click();

  await page.getByTestId('protocol-save').click();
  // The "update everyone" confirmation: its primary button.
  await page.locator('[role="dialog"] .ui-btn-primary').click();
  // Save is also disabled while the request is in flight; the new version is the real signal.
  await expect(page.getByTestId('protocol-version')).toHaveText('v2');
  await expect(page.getByTestId('protocol-save')).toBeDisabled();

  // Reload from the backend: the rule is still ticked with the same answer.
  await page.reload();
  await expect(page.locator('.protocol-item')).toHaveCount(3);
  await page.getByTestId(`task-edit-${QUESTIONNAIRE_TASK}`).click();
  const reloaded = page.getByRole('dialog').locator('.qm-question-card').last().getByTestId('qm-condition');
  await expect(reloaded.locator('input[type="checkbox"]').first()).toBeChecked();
  await expect(answer(reloaded, 'Bad')).toBeChecked();
  await expect(answer(reloaded, 'Good')).not.toBeChecked();
  await page.getByTestId('modal-cancel').click();

  const cfg = await (await request.get(`${BACKEND_URL}/site-config/${SITE_TOKEN}`)).json();
  const questionnaire = cfg.protocols[0].tasks.find((t: { type: string }) => t.type === 'QUESTIONNAIRE');
  const [first, added] = [questionnaire.questions[0], questionnaire.questions.at(-1)];
  expect(first).not.toHaveProperty('showIf');
  expect(added.showIf).toEqual({ questionKey: first.questionKey, optionKeys: [first.questionOptions[1]] });
  expect(cfg.strings.en[added.questionTextKey]).toBe('What felt bad?');
});
