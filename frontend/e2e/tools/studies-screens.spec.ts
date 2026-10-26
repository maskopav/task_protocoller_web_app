import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uiLogin, USERS } from '../helpers/uploads';

// Screenshots of the Studies screens for the visual check against docs/ui_redesign/mockups.
// Run: npx playwright test -c playwright.capture.config.ts e2e/tools/studies-screens.spec.ts
// Output: SHOTS_DIR (default docs/ui_redesign/screens/studies).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOTS_DIR || path.resolve(__dirname, '../../../docs/ui_redesign/screens/studies');

test.describe.configure({ mode: 'serial' });

test('studies screens', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const shot = async (name: string) => {
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  };
  const go = async (hash: string) => {
    await page.goto(`/#${hash}`);
    await page.waitForLoadState('networkidle').catch(() => {});
  };

  await uiLogin(page, USERS.master);
  await go('/studies');
  await shot('01-studies-master');
  await go('/studies/3/protocols');
  await shot('02-study-protocols');
  await page.getByRole('button', { name: /Actions for Speech battery/ }).click();
  await shot('03-protocol-row-menu');
  await page.keyboard.press('Escape');
  await page.getByTestId('study-new-protocol').click();
  await shot('04-new-protocol-blank');
  await page.getByTestId('new-protocol-library-tab').click();
  await page.getByTestId('library-entry-5').click();
  await shot('05-new-protocol-library');
  await page.keyboard.press('Escape');
  await go('/studies/3/clinics');
  await shot('06-study-clinics');
  await go('/studies/3/editors');
  await shot('07-study-editors');
  await go('/studies/3/settings');
  await shot('08-study-settings');
  await go('/studies/3/protocols/2');
  await page.waitForSelector('[data-testid="protocol-editor"]');
  await shot('09-protocol-editor');
  await go('/studies/1/protocols/1');
  await page.waitForSelector('[data-testid="protocol-editor"]');
  await shot('10-protocol-editor-tasks');

  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await uiLogin(page, USERS.clinic);
  await go('/studies');
  await shot('11-studies-clinic');
  await go('/studies/3/protocols');
  await shot('12-study-received');
  await go('/studies/3/protocols/2');
  await page.waitForSelector('[data-testid="protocol-editor"]');
  await shot('13-protocol-editor-readonly');
});
