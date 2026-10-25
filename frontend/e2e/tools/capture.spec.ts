import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { USERS, PASSWORD, BACKEND_URL, bearer, ensureSeeded } from '../helpers/uploads';

// UI/UX audit "before" screenshots. Not part of the normal e2e run. Run with:
//   npx playwright test -c playwright.capture.config.ts
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../../docs/ui_redesign/screens/before');
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
      await page.waitForTimeout(500);
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
      const x = page.getByRole('button', { name: /^(×|✖|✕|x|close|cancel)$/i }).first();
      if (await x.isVisible().catch(() => false)) await x.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
      // last resort: click the dimmed backdrop
      await page.mouse.click(4, 450).catch(() => {});
      await page.waitForTimeout(300);
    };
    const visible = (sel: string) => page.locator(sel).first().isVisible().catch(() => false);
    const enabled = (sel: string) => page.locator(sel).first().isEnabled({ timeout: 1500 }).catch(() => false);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem('appLanguage', 'en'));

    await page.goto('/login');
    await shot('login');
    await page.locator('input[name="email"]').fill(USERS[persona]);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/admin$/);
    const token = (await page.evaluate(() => localStorage.getItem('adminToken'))) as string;
    const api = async (p: string) => {
      const r = await request.get(`${BACKEND_URL}${p}`, { headers: bearer(token) });
      return r.ok() ? await r.json() : null;
    };
    await shot('dashboard-home');

    await step('users', async () => {
      await go('/admin/admin-management');
      await shot('user-management');
      if (page.url().includes('admin-management')) {
        await page.locator('.btn-add').first().click();
        await shot('user-management-modal-create');
        await closeModal();
        await page.locator('.btn-mgmt-icon.btn-edit').first().click();
        await shot('user-management-modal-edit');
        await closeModal();
        await page.locator('.btn-mgmt-icon[title]').nth(1).click();
        await shot('user-management-modal-assign-project');
        await closeModal();
        await page.locator('.btn-mgmt-icon[title]').nth(2).click();
        await shot('user-management-modal-assign-site');
        await closeModal();
      }
    });
    await step('project-mgmt', async () => {
      await go('/admin/project-management');
      await shot('project-management');
      if (page.url().includes('project-management')) {
        await page.locator('.btn-add').first().click();
        await shot('project-management-modal-create');
        await closeModal();
        await page.locator('.btn-mgmt-icon.btn-edit').first().click();
        await shot('project-management-modal-edit');
        await closeModal();
      }
    });
    await step('site-mgmt', async () => {
      await go('/admin/site-management');
      await shot('site-management');
      if (page.url().includes('site-management')) {
        await page.locator('.btn-add').first().click();
        await shot('site-management-modal-create');
        await closeModal();
        await page.locator('.btn-mgmt-icon.btn-edit').first().click();
        await shot('site-management-modal-edit');
        await closeModal();
      }
    });

    const sites: any[] = (await api('/sites')) ?? [];
    const projects: any[] = (await api('/projects/projects-list')) ?? [];
    const siteId = (sites.find((s) => s.name === 'E2E Clinic A') ?? sites[0])?.id;
    const proj = projects.find((p) => p.name === 'Speech Study') ?? projects[0];
    const projectId = proj?.project_id ?? proj?.id;
    console.log(`[${persona}] sites=${sites.map((s) => s.id)} projects=${projects.map((p) => p.project_id)}`);

    await step('site detail', async () => {
      await go(`/admin/sites/${siteId}`);
      await shot('site-detail');
      if (await enabled('.btn-edit-project, .btn-mgmt-icon.btn-edit')) {
        await page.locator('.btn-edit-project, .btn-mgmt-icon.btn-edit').first().click();
        await shot('site-detail-modal-edit');
        await closeModal();
      } else console.log(`[${persona}] site edit button missing/disabled`);
      const manage = page.getByRole('button', { name: /manage|projects/i }).first();
      if (await manage.isVisible().catch(() => false)) {
        await manage.click();
        await shot('site-detail-modal-manage-projects');
        await closeModal();
      } else console.log(`[${persona}] manage-projects button missing`);
    });

    await step('project detail', async () => {
      await go(`/admin/projects/${projectId}`);
      await shot('project-detail');
      if (await enabled('.btn-edit-project')) {
        await page.locator('.btn-edit-project').first().click();
        await shot('project-detail-modal-edit');
        await closeModal();
      } else console.log(`[${persona}] project edit button missing/disabled`);
    });

    const goProtocols = async () => {
      await go(`/admin/projects/${projectId}/protocols`);
      await page.locator('.btn-view').first().waitFor({ timeout: 8000 }).catch(() => {});
    };
    await step('protocols', async () => {
      await goProtocols();
      await shot('protocol-list');
      const nameInput = '.create-inputs-row input';
      if (await enabled(nameInput)) {
        await page.locator(nameInput).first().fill('Capture draft');
        await shot('protocol-create-form-filled');
        await page.locator('.btn-create').click();
        await page.waitForURL(/protocols\/[^/]+$/).catch(() => {});
        await shot('protocol-create-editor-new');
        await goProtocols();
      } else console.log(`[${persona}] create-protocol form disabled`);
      if (await enabled('.btn-edit')) {
        await page.locator('.btn-edit').first().click();
        await page.waitForURL(/protocols\/\d+/);
        await shot('protocol-editor-existing');
        const show = page.getByRole('button', { name: /show|preview|test|participant/i }).first();
        if (await show.isEnabled({ timeout: 1500 }).catch(() => false)) {
          await show.click();
          await page.waitForURL(/participant\/test/).catch(() => {});
          await shot('participant-preview-from-editor');
        }
      } else console.log(`[${persona}] edit-protocol disabled/missing`);
      await goProtocols();
      if (await visible('.btn-view')) {
        await page.locator('.btn-view').first().click();
        await page.waitForURL(/participant\/test/).catch(() => {});
        await shot('participant-preview');
      }
    });

    await step('uploads', async () => {
      await go('/admin/uploads');
      await shot('uploads-list');
      const row = page.locator('a.um-icon-btn').first();
      if (await row.isVisible().catch(() => false)) {
        await row.click();
        await page.waitForURL(/uploads\/[0-9a-f]{32}/);
        await shot('upload-session-detail');
      } else console.log(`[${persona}] no upload rows`);
    });
    await step('devices', async () => {
      await go('/admin/uploads/devices');
      await shot('devices');
    });
    await step('downloads', async () => {
      await go('/admin/uploads/downloads');
      await shot('downloads');
    });

    await go('/admin/does-not-exist');
    await shot('404');

    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  });
}
