import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uiLogin, USERS, ensureSeeded } from '../helpers/uploads';

// Checkpoint screenshots of Users, auth and Library (increment 8) for 4 personas.
// Not part of the normal e2e run. Run: npx playwright test -c playwright.capture.config.ts increment8
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/ui_redesign/screens/increment8');

const ROUTES: Record<string, string[]> = {
  master: ['/users', '/users/3', '/library', '/library/4', '/library/4/edit'],
  researcher: ['/library', '/library/5'],
};

for (const [persona, routes] of Object.entries(ROUTES)) {
  test(`increment 8 ${persona}`, async ({ page, request }) => {
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
