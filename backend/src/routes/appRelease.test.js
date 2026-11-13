import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

vi.mock('../utils/logger.js', () => ({ logToFile: vi.fn(), logFrontendToFile: vi.fn() }));
// requireAuth is tested elsewhere; here req.admin is an input. canSeeTechnical
// is the per-request DB read of users.can_see_technical.
vi.mock('../utils/accessScope.js', () => ({ canSeeTechnical: vi.fn() }));

const { canSeeTechnical } = await import('../utils/accessScope.js');
const { createAppReleaseRouter } = await import('./appRelease.js');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

let root;
const appAs = (admin) => {
  const app = express();
  app.use((req, _res, next) => { req.admin = admin; next(); });
  app.use('/app-release', createAppReleaseRouter({ releasesPath: root }));
  return app;
};
const MASTER = { id: 1, role: 'master' };
const ADMIN = { id: 5, role: 'admin' };

const savedBase = process.env.PUBLIC_BASE_URL;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-release-'));
  canSeeTechnical.mockReset().mockResolvedValue(false);
  delete process.env.PUBLIC_BASE_URL;
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (savedBase === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = savedBase;
});

function publish(version) {
  const dir = path.join(root, version);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'app.zip'), 'app');
  fs.writeFileSync(path.join(dir, 'install-windows-x64.zip'), 'win-bundle');
  fs.writeFileSync(path.join(dir, 'install-windows-x64.zip.sha256'), `${sha('win-bundle')}  install-windows-x64.zip\n`);
  const when = new Date('2026-11-13T09:30:00Z');
  fs.utimesSync(dir, when, when);
}

describe('GET /app-release', () => {
  it('master gets 200 with the latest release and both link paths', async () => {
    publish('1.0.1'); publish('1.0.2');
    process.env.PUBLIC_BASE_URL = 'https://malenia.example/koubic';
    const res = await request(appAs(MASTER)).get('/app-release');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      release: {
        version: '1.0.2',
        publishedAt: '2026-11-13T09:30:00.000Z',
        bundles: [{
          name: 'install-windows-x64.zip', size: 10, sha256: sha('win-bundle'),
          latestPath: 'api/version/download/latest/install-windows-x64.zip',
          versionedPath: 'api/version/download/1.0.2/install-windows-x64.zip',
        }],
      },
      publicBaseUrl: 'https://malenia.example/koubic',
    });
    expect(canSeeTechnical).not.toHaveBeenCalled();
  });

  it('a user with can_see_technical gets 200 (checked fresh per request)', async () => {
    publish('1.0.2');
    canSeeTechnical.mockResolvedValue(true);
    const res = await request(appAs(ADMIN)).get('/app-release');
    expect(res.status).toBe(200);
    expect(res.body.release.version).toBe('1.0.2');
    expect(canSeeTechnical).toHaveBeenCalledWith(5);
  });

  it('a user without the flag gets 403', async () => {
    publish('1.0.2');
    const res = await request(appAs(ADMIN)).get('/app-release');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('no release published: release null; publicBaseUrl null when unset', async () => {
    const res = await request(appAs(MASTER)).get('/app-release');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ release: null, publicBaseUrl: null });
  });

  it('500 when the flag lookup fails', async () => {
    canSeeTechnical.mockRejectedValue(new Error('db down'));
    expect((await request(appAs(ADMIN)).get('/app-release')).status).toBe(500);
  });
});
