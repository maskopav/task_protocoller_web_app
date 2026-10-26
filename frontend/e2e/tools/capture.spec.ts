import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { USERS, PASSWORD, BACKEND_URL, bearer, ensureSeeded } from '../helpers/uploads';

// UI/UX "after" screenshots, the counterpart of screens/before (same personas, 1440 px,
// full page, English, seeded E2E data). The "before" set was taken by the previous
// version of this file (git 6a08360) on the old /admin routes. Modals are opened but
// never submitted, so the run creates no data. Not part of the normal e2e run:
//   npx playwright test -c playwright.capture.config.ts capture.spec
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/ui_redesign/screens/after');
const PERSONAS = ['master', 'clinic', 'editor', 'reviewer'] as const;

type Entry = { persona: string; file: string; route: string };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  await ensureSeeded(request);
});

for (const persona of PERSONAS) {
  test(`capture ${persona}`, async ({ page, request }) => {
    const dir = path.join(OUT, persona);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const manifest: Entry[] = [];
    let n = 0;

    const shot = async (name: string) => {
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(600);
      n += 1;
      const file = `${String(n).padStart(2, '0')}-${name}.png`;
      await page.screenshot({ path: path.join(dir, file), fullPage: true });
      const u = new URL(page.url());
      manifest.push({ persona, file, route: u.hash || u.pathname });
    };
    const go = async (route: string) => {
      await page.goto(`/#${route}`);
      await page.waitForLoadState('networkidle').catch(() => {});
    };
    const step = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        console.log(`[${persona}] FAILED ${label}: ${String(e).split('\n')[0]}`);
      }
    };
    const closeModal = async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    };
    // Opens a modal from a button (if this persona has it), shoots it and closes it again.
    const modal = async (testId: string, name: string) => {
      const btn = page.getByTestId(testId).first();
      if (!(await btn.isVisible().catch(() => false))) {
        console.log(`[${persona}] no ${testId}`);
        return;
      }
      await btn.click();
      await page.getByRole('dialog').first().waitFor({ timeout: 4000 });
      await shot(name);
      await closeModal();
    };

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem('appLanguage', 'en'));

    await page.goto('/login');
    await shot('login');
    await page.locator('input[name="email"]').fill(USERS[persona]);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/recordings$/);
    const token = (await page.evaluate(() => localStorage.getItem('adminToken'))) as string;
    const api = async (p: string) => {
      const r = await request.get(`${BACKEND_URL}${p}`, { headers: bearer(token) });
      return r.ok() ? await r.json() : null;
    };
    await shot('recordings-home');

    await step('recording detail', async () => {
      const row = page.locator('tbody tr.clickable').first();
      if (await row.isVisible().catch(() => false)) {
        await row.click();
        await page.waitForURL(/recordings\/[0-9a-f]{32}/);
        await shot('recording-detail');
      } else console.log(`[${persona}] no recording rows`);
    });

    await step('users', async () => {
      await go('/users');
      await shot('users');
      if (await page.getByTestId('users-table').isVisible().catch(() => false)) {
        await modal('new-user', 'users-modal-invite');
        await page.getByTestId('users-table').locator('tbody tr').first().click();
        await page.waitForURL(/users\/\d+/);
        await shot('user-detail');
      }
    });

    const sites: any[] = (await api('/sites')) ?? [];
    const projects: any[] = (await api('/projects')) ?? [];
    const siteId = (sites.find((s) => s.name === (persona === 'editor' ? 'E2E Clinic B' : 'E2E Clinic A')) ?? sites[0])?.id;
    // master edits the seeded protocol with tasks (study 1), the others see Speech Study, as in "before"
    const proj = persona === 'master' ? projects.find((p) => p.project_id === 1) : projects.find((p) => p.name === 'Speech Study');
    const projectId = (proj ?? projects[0])?.project_id;
    console.log(`[${persona}] sites=${sites.map((s) => s.id)} projects=${projects.map((p) => p.project_id)} -> site ${siteId}, study ${projectId}`);

    await step('studies', async () => {
      await go('/studies');
      await shot('studies');
      await modal('studies-new', 'studies-modal-new');
    });

    await step('study', async () => {
      await go(`/studies/${projectId}/protocols`);
      await shot('study-protocols');
      await modal('study-new-protocol', 'study-modal-new-protocol');
      await go(`/studies/${projectId}/clinics`);
      await shot('study-clinics');
      await go(`/studies/${projectId}/editors`);
      await shot('study-editors');
    });

    await step('protocol editor', async () => {
      const protocols: any[] = (await api(`/projects/${projectId}/protocols`)) ?? [];
      const protocolId = protocols[0]?.languages?.[0]?.protocol_id ?? protocols[0]?.id;
      if (!protocolId) return console.log(`[${persona}] no protocol in study ${projectId}`);
      await go(`/studies/${projectId}/protocols/${protocolId}`);
      await page.getByTestId('protocol-editor').waitFor({ timeout: 8000 });
      await shot('protocol-editor');
      const preview = page.getByTestId('protocol-preview');
      if (await preview.isEnabled({ timeout: 1500 }).catch(() => false)) {
        await preview.click();
        await page.waitForURL(/\/preview/).catch(() => {});
        await shot('participant-preview');
      } else console.log(`[${persona}] preview disabled (no tasks)`);
    });

    await step('clinics', async () => {
      await go('/clinics');
      await shot('clinics');
      await modal('new-clinic', 'clinics-modal-new');
      for (const tab of ['studies', 'computers', 'recordings', 'settings']) {
        await go(`/clinics/${siteId}/${tab}`);
        await shot(`clinic-${tab}`);
      }
    });

    await step('library', async () => {
      await go('/library');
      await shot('library');
    });

    await go('/does-not-exist');
    await shot('404');

    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  });
}
