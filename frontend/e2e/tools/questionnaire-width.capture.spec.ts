import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Checkpoint screenshots + measurements for docs/questionnaire_width/spec.md.
// Not part of the normal e2e run. Run: npx playwright test -c playwright.capture.config.ts questionnaire-width
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/questionnaire_width/screens');
const QUESTIONNAIRE_TASK = 2;
const LONG_Q = 'I sometimes have very vivid dreams that I remember clearly after waking up';

async function loginAsMaster(page: Page, lang: string) {
  await page.addInitScript((l) => localStorage.setItem('appLanguage', l), lang);
  await page.goto('/login');
  await page.locator('input[name="email"]').fill('master@test.com');
  await page.locator('input[name="password"]').fill('1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/recordings$/);
}

const measure = (page: Page) => page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]') as HTMLElement;
  const r = dlg.getBoundingClientRect();
  const card = dlg.querySelectorAll('.qm-question-card');
  const last = card[card.length - 1];
  const body = last?.querySelector('.qm-card-body') as HTMLElement | null;
  const [text, type, opt] = body ? [...body.children].map((c) => (c as HTMLElement).getBoundingClientRect()) : [];
  const sel = last?.querySelector('select.type-select') as HTMLSelectElement | null;
  // Select clipping: selected label width (canvas, computed font) vs. the select's text box minus the arrow
  const ctx = document.createElement('canvas').getContext('2d')!;
  const clippedSelects = [...dlg.querySelectorAll('select.type-select')].flatMap((el) => {
    const s = el as HTMLSelectElement;
    const cs = getComputedStyle(s);
    ctx.font = cs.font;
    const textW = ctx.measureText(s.options[s.selectedIndex]?.text || '').width;
    const avail = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 20;
    return textW > avail ? [`${s.options[s.selectedIndex]?.text} (${Math.round(textW)} > ${Math.round(avail)})`] : [];
  });
  const writeIn = [...dlg.querySelectorAll('.qm-option-row .qm-inline-label')].map((l) => (l as HTMLElement).getBoundingClientRect().height);
  return {
    vw: window.innerWidth,
    dialogWidth: Math.round(r.width),
    leftGap: Math.round(r.left),
    rightGap: Math.round(window.innerWidth - r.right),
    pageHScroll: document.documentElement.scrollWidth > window.innerWidth,
    dialogHScroll: dlg.scrollWidth > dlg.clientWidth,
    typeSelectWidth: sel ? Math.round(sel.getBoundingClientRect().width) : null,
    stacked: text && type ? type.top > text.bottom - 1 : null,
    optionalSameRowAsType: type && opt ? Math.abs(type.top - opt.top) < 20 : null,
    writeInLabelHeights: writeIn.map(Math.round),
    clippedSelects,
  };
});

for (const lang of ['en', 'cs', 'de']) test(`questionnaire dialog width at 4 viewports (${lang})`, async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await loginAsMaster(page, lang);
  await page.goto('/#/studies/1/protocols/1');
  await expect(page.locator('.protocol-item')).toHaveCount(3);

  // Task-settings dialog must stay at 640px (criterion 6)
  await page.getByTestId('task-edit-0').click();
  const taskWidth = await page.getByRole('dialog').evaluate((d) => Math.round(d.getBoundingClientRect().width));
  await page.getByTestId('modal-cancel').click();

  await page.getByTestId(`task-edit-${QUESTIONNAIRE_TASK}`).click();
  const dialog = page.getByRole('dialog');
  // A long unbroken answer on Q1, so the conditional-rule answer labels below are stressed too
  const first = dialog.locator('.qm-question-card').first();
  await first.locator('.qm-btn-add-option').click();
  await first.locator('.qm-option-row input.qm-input').last().fill('x'.repeat(160));
  await page.getByTestId('qm-add-question').click();
  const card = dialog.locator('.qm-question-card').last();
  await card.locator('input.question-text').fill(LONG_Q);
  await card.locator('select.type-select').selectOption('multiple'); // the longest type label in every language
  await card.locator('.qm-btn-add-option').click();
  await card.locator('.qm-btn-add-option').click();
  const opts = card.locator('.qm-option-row input.qm-input');
  await opts.nth(0).fill('Yes');
  await opts.nth(1).fill('No');
  const rule = card.getByTestId('qm-condition');
  await rule.locator('input[type="checkbox"]').first().check();
  await rule.locator('select').selectOption({ index: 0 });

  const results: Record<string, unknown> = { taskSettingsDialogWidth: taskWidth };
  for (const w of [1920, 1280, 1024, 800]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(150);
    results[w] = await measure(page);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, `questionnaire-${lang}-${w}.png`) });
  }
  fs.writeFileSync(path.join(OUT, `measurements-${lang}.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
});
