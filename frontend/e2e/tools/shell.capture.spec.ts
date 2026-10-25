import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { USERS, PASSWORD, ensureSeeded } from '../helpers/uploads';

// Checkpoint screenshots of the new app shell (increment 5). Not part of the
// normal e2e run. Run: npx playwright test -c playwright.capture.config.ts shell
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/ui_redesign/screens/increment5');

const SHOTS: { persona: keyof typeof USERS; name: string; route: string }[] = [
  { persona: 'master', name: 'master-recordings', route: '/recordings' },
  { persona: 'master', name: 'master-studies', route: '/studies' },
  { persona: 'master', name: 'master-library-placeholder', route: '/library' },
  { persona: 'clinic', name: 'clinic-my-clinic', route: '/clinics' },
  { persona: 'clinic', name: 'clinic-users-not-available', route: '/users' },
];

for (const persona of [...new Set(SHOTS.map((s) => s.persona))]) {
  test(`shell ${persona}`, async ({ page, request }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await ensureSeeded(request);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/login');
    await page.locator('input[name="email"]').fill(USERS[persona]);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/recordings/);
    for (const s of SHOTS.filter((x) => x.persona === persona)) {
      await page.goto(`/#${s.route}`);
      await page.getByTestId('app-shell').waitFor();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `${s.name}.png`) });
    }
  });
}
