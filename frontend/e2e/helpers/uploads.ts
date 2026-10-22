import { expect, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
// The same fixture builder the backend tests use: archives exactly as the desktop app sends them.
// @ts-expect-error plain JS module without types
import { buildSessionZip } from '../../../backend/test/fixtures/buildSessionZip.js';

export const BACKEND_URL = 'http://localhost:3001';
export const PASSWORD = '1234';
export const SITE_A_TOKEN = 'e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4'; // "E2E Clinic A" (site 4)
export const SITE_B_TOKEN = 'e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5'; // "E2E Clinic B" (site 5)

export const USERS = {
  master: 'master@test.com',
  clinic: 'clinic@test.com', // site grant on E2E Clinic A only
  editor: 'editor@test.com', // project grant (can_edit) narrowed to E2E Clinic B
  reviewer: 'reviewer@test.com', // read-only project grant
  nogrant: 'nogrant@test.com', // no grants at all
} as const;

export interface Fixture {
  name: string;
  variant: string;
  sessionId: string;
  installationId: string;
  siteToken?: string;
}

const hex = (n: number) => n.toString(16).padEnd(32, '0');
const dev = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Fixed ids so every spec file addresses the same sessions.
export const F = {
  s1: { name: 's1', variant: 'valid', sessionId: hex(0xe2e001), installationId: dev(1), siteToken: SITE_A_TOKEN },
  s2: { name: 's2', variant: 'valid', sessionId: hex(0xe2e002), installationId: dev(1), siteToken: SITE_A_TOKEN },
  s3: { name: 's3', variant: 'manifestHashMismatch', sessionId: hex(0xe2e003), installationId: dev(1), siteToken: SITE_A_TOKEN },
  s4: { name: 's4', variant: 'valid', sessionId: hex(0xe2e004), installationId: dev(2), siteToken: SITE_B_TOKEN },
  q1: { name: 'q1', variant: 'valid', sessionId: hex(0xe2e0a1), installationId: dev(3) }, // no token, unknown device
  q2: { name: 'q2', variant: 'valid', sessionId: hex(0xe2e0a2), installationId: dev(4) }, // released by the devices spec
  q3: { name: 'q3', variant: 'valid', sessionId: hex(0xe2e0a3), installationId: dev(5) }, // uploaded by the ingest spec itself
  q5: { name: 'q5', variant: 'valid', sessionId: hex(0xe2e0a5), installationId: dev(6) }, // released by the devices spec (API test)
} satisfies Record<string, Fixture>;

export const SEEDED: Fixture[] = [F.s1, F.s2, F.s3, F.s4, F.q1, F.q2];
export const SITE_A_SESSIONS = [F.s1, F.s2, F.s3].map((f) => f.sessionId);
export const SITE_B_SESSIONS = [F.s4.sessionId];

// Built once per machine and reused: a re-send must carry the same bytes (hash) as the original.
const DIR = path.join(os.tmpdir(), 'tp-e2e-upload-fixtures');

export function zipOf(f: Fixture) {
  fs.mkdirSync(DIR, { recursive: true });
  const dir = path.join(DIR, f.name);
  const meta = path.join(dir, 'meta.json');
  if (!fs.existsSync(meta)) {
    fs.mkdirSync(dir, { recursive: true });
    const built = buildSessionZip({ variant: f.variant, sessionId: f.sessionId, installationId: f.installationId, dir });
    fs.writeFileSync(meta, JSON.stringify({ path: built.path, sha256: built.sha256 }));
  }
  return JSON.parse(fs.readFileSync(meta, 'utf8')) as { path: string; sha256: string };
}

/** POST /upload exactly like the desktop app (text parts first, zip last). */
export async function uploadFixture(request: APIRequestContext, f: Fixture, opts: { siteToken?: string | null } = {}) {
  const z = zipOf(f);
  const token = opts.siteToken === undefined ? f.siteToken : opts.siteToken;
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    installationId: f.installationId,
    sessionId: f.sessionId,
    zipSha256: z.sha256,
  };
  if (token) multipart.siteToken = token;
  multipart.zip = { name: path.basename(z.path), mimeType: 'application/zip', buffer: fs.readFileSync(z.path) };
  return request.post(`${BACKEND_URL}/upload`, { multipart });
}

export async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${BACKEND_URL}/auth/admin/login`, { data: { email, password: PASSWORD } });
  expect(res.ok(), `login ${email}`).toBeTruthy();
  return (await res.json()).token;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function uiLogin(page: Page, email: string): Promise<string> {
  await page.addInitScript(() => localStorage.setItem('appLanguage', 'en'));
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);
  return (await page.evaluate(() => localStorage.getItem('adminToken'))) as string;
}

/** Ids of every session the caller can see (all pages of GET /uploads). */
export async function visibleIds(request: APIRequestContext, token: string): Promise<string[]> {
  const res = await request.get(`${BACKEND_URL}/uploads?pageSize=100`, { headers: bearer(token) });
  expect(res.status()).toBe(200);
  return (await res.json()).rows.map((r: { id: string }) => r.id);
}

/**
 * Creates the shared fixture sessions through the real ingest path, once per DB: a session
 * already known to the server is left alone, so any spec file may call this.
 */
export async function ensureSeeded(request: APIRequestContext) {
  const master = await apiToken(request, USERS.master);
  for (const f of SEEDED) {
    const known = await request.get(`${BACKEND_URL}/uploads/${f.sessionId}`, { headers: bearer(master) });
    if (known.status() === 404) {
      const res = await uploadFixture(request, f);
      expect([200, 404]).toContain(res.status()); // 404 = quarantined, by design
    }
  }
  await expect
    .poll(
      async () => {
        const res = await request.get(`${BACKEND_URL}/uploads?pageSize=100`, { headers: bearer(master) });
        const rows = (await res.json()).rows as { id: string; status: string }[];
        const mine = rows.filter((r) => SEEDED.some((f) => f.sessionId === r.id));
        return mine.length === SEEDED.length && mine.every((r) => r.status !== 'validating');
      },
      { timeout: 30_000, message: 'fixture sessions leave "validating"' },
    )
    .toBe(true);
  return master;
}

/** File names inside a ZIP on disk (reads the central directory; no extraction). */
export async function zipEntries(file: string): Promise<string[]> {
  const requireFromBackend = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend/package.json'));
  const yauzl = requireFromBackend('yauzl');
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err: Error | null, zip: any) => {
      if (err) return reject(err);
      const names: string[] = [];
      zip.on('entry', (e: { fileName: string }) => { names.push(e.fileName); zip.readEntry(); });
      zip.on('end', () => resolve(names));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}
