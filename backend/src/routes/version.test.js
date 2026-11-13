import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

vi.mock('../utils/logger.js', () => ({
  logToFile: vi.fn(),
  logFrontendToFile: vi.fn(),
}));

const { createVersionRouter } = await import('./version.js');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const APP = Buffer.from('0123456789abcdefghij'); // 20 bytes

let root;
const appFor = (releasesPath = root) => {
  const app = express();
  app.use('/version', createVersionRouter({ releasesPath }));
  return app;
};

function publish(version) {
  const dir = path.join(root, version);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest-windows-x86_64.json'), JSON.stringify({
    version: 1, release: version, platform: 'windows-x86_64',
    components: [{ id: 'app', target: 'app', artifact: 'app.zip' }],
  }));
  fs.writeFileSync(path.join(dir, 'app.zip'), APP);
  fs.writeFileSync(path.join(dir, 'app.zip.sha256'), `${sha(APP)}  app.zip\n`);
  fs.writeFileSync(path.join(dir, 'install-linux-x64.tar.gz'), 'gzdata');
  fs.writeFileSync(path.join(dir, 'private.txt'), 'nope');
  return dir;
}

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'version-route-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('GET /version/latest', () => {
  it('404 when nothing is published, or the root does not exist', async () => {
    const res = await request(appFor()).get('/version/latest?platform=windows-x86_64');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'no release published' });
    expect((await request(appFor(path.join(root, 'missing'))).get('/version/latest')).status).toBe(404);
  });

  it('400 for an invalid platform (after the no-release check)', async () => {
    expect((await request(appFor()).get('/version/latest?platform=../x')).status).toBe(404);
    publish('1.0.0');
    for (const bad of ['..%2Fx', 'UPPER', '-lead', 'a'.repeat(33)]) {
      const res = await request(appFor()).get(`/version/latest?platform=${bad}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid platform' });
    }
  });

  it('serves the latest release with relative urls and no-store', async () => {
    publish('1.0.9'); publish('1.0.10'); publish('1.0.2');
    fs.mkdirSync(path.join(root, '.incoming-1.1.0'));
    fs.mkdirSync(path.join(root, 'v2.0.0'));
    const res = await request(appFor()).get('/version/latest?platform=windows-x86_64');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      release: '1.0.10',
      components: [{ id: 'app', target: 'app', url: 'download/1.0.10/app.zip', checksum: sha(APP) }],
    });
  });

  it('components [] for an unknown or absent platform', async () => {
    publish('1.0.0');
    expect((await request(appFor()).get('/version/latest?platform=macos-arm64')).body).toEqual({ release: '1.0.0', components: [] });
    expect((await request(appFor()).get('/version/latest')).body).toEqual({ release: '1.0.0', components: [] });
  });

  it('sees a release published after the app started', async () => {
    const app = appFor();
    expect((await request(app).get('/version/latest')).status).toBe(404);
    publish('1.0.0');
    expect((await request(app).get('/version/latest')).body.release).toBe('1.0.0');
  });
});

describe('GET /version/download/:version/:name', () => {
  beforeEach(() => { publish('1.0.0'); });

  it('streams an allowlisted artifact with headers', async () => {
    const res = await request(appFor()).get('/version/download/1.0.0/app.zip').buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.body.equals(APP)).toBe(true);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-length']).toBe('20');
    expect(res.headers['content-disposition']).toBe('attachment; filename="app.zip"');
  });

  it('content types for gz, json and sha256', async () => {
    const a = appFor();
    expect((await request(a).get('/version/download/1.0.0/install-linux-x64.tar.gz')).headers['content-type']).toBe('application/gzip');
    expect((await request(a).get('/version/download/1.0.0/manifest-windows-x86_64.json')).headers['content-type']).toMatch(/^application\/json/);
    expect((await request(a).get('/version/download/1.0.0/app.zip.sha256')).headers['content-type']).toMatch(/^text\/plain/);
  });

  it('answers a Range request with 206', async () => {
    const res = await request(appFor()).get('/version/download/1.0.0/app.zip').set('Range', 'bytes=5-9').buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 5-9/20');
    expect(res.headers['content-length']).toBe('5');
    expect(res.body.toString()).toBe('56789');
  });

  it('416 for an unsatisfiable range', async () => {
    const res = await request(appFor()).get('/version/download/1.0.0/app.zip').set('Range', 'bytes=50-');
    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe('bytes */20');
  });

  it('HEAD returns headers and no body', async () => {
    const res = await request(appFor()).head('/version/download/1.0.0/app.zip');
    expect(res.status).toBe(200);
    expect(res.headers['content-length']).toBe('20');
    expect(res.text ?? '').toBe('');
  });

  it('404 for non-allowlisted names, traversal and bad versions', async () => {
    fs.writeFileSync(path.join(root, 'outside.zip'), 'x');
    const a = appFor();
    for (const url of [
      '/version/download/1.0.0/private.txt',
      '/version/download/1.0.0/..%2Foutside.zip',
      '/version/download/1.0.0/..%2F..%2Fetc%2Fpasswd',
      '/version/download/1.0.0/nothere.zip',
      '/version/download/..%2F1.0.0/app.zip',
      '/version/download/1.0/app.zip',
      '/version/download/v1.0.0/app.zip',
      '/version/download/9.9.9/app.zip',
    ]) {
      const res = await request(a).get(url);
      expect(res.status, url).toBe(404);
      expect(res.body, url).toEqual({ error: 'no such release artifact' });
    }
  });
});
