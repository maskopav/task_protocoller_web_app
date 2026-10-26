import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uiLogin, USERS, ensureSeeded } from '../helpers/uploads';

// Checkpoint screenshots of Studies and Clinics (increment 7) for 4 personas.
// Not part of the normal e2e run. Run: npx playwright test -c playwright.capture.config.ts increment7
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/ui_redesign/screens/increment7');

const ROUTES: Record<string, string[]> = {
  master: ['/studies', '/studies/3/protocols', '/studies/3/clinics', '/studies/3/editors',
    '/studies/1/protocols/1', '/clinics', '/clinics/4/studies', '/clinics/4/computers', '/clinics/4/settings'],
  researcher: ['/studies', '/studies/3/clinics', '/clinics', '/clinics/5/studies'],
  reviewer: ['/studies', '/studies/3/protocols', '/clinics'],
  clinic: ['/studies', '/studies/3/protocols', '/clinics', '/clinics/4/computers'],
};

for (const [persona, routes] of Object.entries(ROUTES)) {
  test(`increment 7 ${persona}`, async ({ page, request }) => {
    await ensureSeeded(request);
    fs.mkdirSync(OUT, { recursive: true });
    await page.addInitScript(() => localStorage.setItem('appLanguage', 'en'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await uiLogin(page, USERS[persona as keyof typeof USERS]);
    for (const r of routes) {
      await page.goto(`/#${r}`);
      await page.getByTestId('app-shell').waitFor();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(700);
      const name = `${persona}${r.replace(/\//g, '-')}`;
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
    }
  });
}
