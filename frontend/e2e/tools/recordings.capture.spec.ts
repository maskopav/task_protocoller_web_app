import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { USERS, PASSWORD, F, ensureSeeded } from '../helpers/uploads';

// Checkpoint screenshots of the recordings list and detail (increment 6). Not
// part of the normal e2e run. Run: npx playwright test -c playwright.capture.config.ts recordings
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/ui_redesign/screens/increment6');

const SHOTS: { persona: keyof typeof USERS; name: string; route: string; ready: string }[] = [
  { persona: 'master', name: 'master-recordings', route: '/recordings', ready: 'table' },
  { persona: 'master', name: 'master-recording', route: `/recordings/${F.s1.sessionId}`, ready: 'h1' },
  { persona: 'master', name: 'master-recording-quarantined', route: `/recordings/${F.q1.sessionId}`, ready: '[data-testid="recording-quarantine"]' },
  { persona: 'clinic', name: 'clinic-recordings', route: '/recordings', ready: 'table' },
  { persona: 'clinic', name: 'clinic-recording', route: `/recordings/${F.s1.sessionId}`, ready: 'h1' },
];

for (const persona of [...new Set(SHOTS.map((s) => s.persona))]) {
  test(`recordings ${persona}`, async ({ page, request }) => {
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
      await page.locator(s.ready).first().waitFor();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `${s.name}.png`), fullPage: true });
    }
  });
}
