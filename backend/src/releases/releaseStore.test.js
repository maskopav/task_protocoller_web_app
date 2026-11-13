import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

vi.mock('../utils/logger.js', () => ({
  logToFile: vi.fn(),
  logFrontendToFile: vi.fn(),
}));

const { logToFile } = await import('../utils/logger.js');
const { createReleaseStore } = await import('./releaseStore.js');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'releases-')); vi.clearAllMocks(); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

// Writes <root>/<version>/ with a windows manifest; returns the dir.
function publish(version, { components, sidecars = true, skipFiles = [] } = {}) {
  const dir = path.join(root, version);
  fs.mkdirSync(dir, { recursive: true });
  const comps = components ?? [
    { id: 'app', target: 'app', artifact: 'app.zip' },
    { id: 'runtime', target: 'runtime', artifact: 'runtime-windows-x86_64.zip' },
  ];
  fs.writeFileSync(path.join(dir, 'manifest-windows-x86_64.json'),
    JSON.stringify({ version: 1, release: version, platform: 'windows-x86_64', components: comps }));
  for (const c of comps) {
    if (skipFiles.includes(c.artifact)) continue;
    const body = Buffer.from(`${version}:${c.artifact}`);
    fs.writeFileSync(path.join(dir, c.artifact), body);
    if (sidecars) fs.writeFileSync(path.join(dir, `${c.artifact}.sha256`), `${sha(body).toUpperCase()}  ${c.artifact}\n`);
  }
  return dir;
}

describe('latestRelease', () => {
  it('is null when the root is missing or empty', () => {
    expect(createReleaseStore(path.join(root, 'nope')).latestRelease()).toBeNull();
    expect(createReleaseStore(root).latestRelease()).toBeNull();
  });

  it('picks 1.0.10 over 1.0.9 and ignores non-semver directories', () => {
    for (const v of ['1.0.9', '1.0.10', '.incoming-1.1.0', 'v2.0.0', '2.0', '1.0.9-rc1']) fs.mkdirSync(path.join(root, v));
    fs.writeFileSync(path.join(root, '3.0.0'), 'a file, not a dir');
    expect(createReleaseStore(root).latestRelease()).toBe('1.0.10');
  });
});

describe('componentsFor', () => {
  it('returns relative urls and lowercased sidecar checksums', () => {
    publish('1.0.0');
    const out = createReleaseStore(root).componentsFor('1.0.0', 'windows-x86_64');
    expect(out).toEqual([
      { id: 'app', target: 'app', url: 'download/1.0.0/app.zip', checksum: sha(Buffer.from('1.0.0:app.zip')) },
      { id: 'runtime', target: 'runtime', url: 'download/1.0.0/runtime-windows-x86_64.zip', checksum: sha(Buffer.from('1.0.0:runtime-windows-x86_64.zip')) },
    ]);
  });

  it('url-encodes the artifact name', () => {
    publish('1.0.0', { components: [{ id: 'x', target: 't', artifact: 'a b.zip' }] });
    expect(createReleaseStore(root).componentsFor('1.0.0', 'windows-x86_64')[0].url).toBe('download/1.0.0/a%20b.zip');
  });

  it('hashes the file when the sidecar is missing', () => {
    publish('1.0.0', { sidecars: false });
    const out = createReleaseStore(root).componentsFor('1.0.0', 'windows-x86_64');
    expect(out[0].checksum).toBe(sha(Buffer.from('1.0.0:app.zip')));
  });

  it('drops a component whose artifact is missing, and logs it', () => {
    publish('1.0.0', { skipFiles: ['runtime-windows-x86_64.zip'] });
    const out = createReleaseStore(root).componentsFor('1.0.0', 'windows-x86_64');
    expect(out.map((c) => c.id)).toEqual(['app']);
    expect(logToFile).toHaveBeenCalledWith('WARN', expect.any(String), expect.anything());
  });

  it('returns [] for unknown platform, missing platform, and a bad manifest', () => {
    const dir = publish('1.0.0');
    fs.writeFileSync(path.join(dir, 'manifest-linux-x64.json'), '{not json');
    const store = createReleaseStore(root);
    expect(store.componentsFor('1.0.0', 'macos-arm64')).toEqual([]);
    expect(store.componentsFor('1.0.0', undefined)).toEqual([]);
    expect(store.componentsFor('1.0.0', 'linux-x64')).toEqual([]);
  });
});

describe('allowedArtifacts / resolveArtifactPath', () => {
  it('allows manifests, declared artifacts, install bundles and their sidecars only', () => {
    const dir = publish('1.0.0');
    fs.writeFileSync(path.join(dir, 'install-windows-x86_64.zip'), 'z');
    fs.writeFileSync(path.join(dir, 'install-linux-x64.tar.gz'), 'g');
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'no');
    const names = createReleaseStore(root).allowedArtifacts('1.0.0');
    expect([...names].sort()).toEqual([
      'app.zip', 'app.zip.sha256', 'install-linux-x64.tar.gz', 'install-windows-x86_64.zip',
      'manifest-windows-x86_64.json', 'runtime-windows-x86_64.zip', 'runtime-windows-x86_64.zip.sha256',
    ]);
  });

  it('resolves allowed files and refuses traversal, unknown names and bad versions', () => {
    const dir = publish('1.0.0');
    fs.writeFileSync(path.join(root, 'outside.zip'), 'x');
    const store = createReleaseStore(root);
    expect(store.resolveArtifactPath('1.0.0', 'app.zip')).toBe(path.join(dir, 'app.zip'));
    expect(store.resolveArtifactPath('1.0.0', '../outside.zip')).toBeNull();
    expect(store.resolveArtifactPath('1.0.0', 'secret.txt')).toBeNull();
    expect(store.resolveArtifactPath('../1.0.0', 'app.zip')).toBeNull();
    expect(store.resolveArtifactPath('9.9.9', 'app.zip')).toBeNull();
  });

  it('ignores manifest artifacts that are not plain file names', () => {
    publish('1.0.0', { components: [
      { id: 'app', target: 'app', artifact: 'app.zip' },
      { id: 'evil', target: 'x', artifact: '../outside.zip' },
    ], skipFiles: ['../outside.zip'] });
    fs.writeFileSync(path.join(root, 'outside.zip'), 'x');
    const store = createReleaseStore(root);
    expect(store.allowedArtifacts('1.0.0').has('../outside.zip')).toBe(false);
    expect(store.resolveArtifactPath('1.0.0', '../outside.zip')).toBeNull();
    expect(store.componentsFor('1.0.0', 'windows-x86_64').map((c) => c.id)).toEqual(['app']);
  });

  it('does not resolve a declared artifact that is not on disk', () => {
    publish('1.0.0', { skipFiles: ['app.zip'] });
    expect(createReleaseStore(root).resolveArtifactPath('1.0.0', 'app.zip')).toBeNull();
  });
});

describe('latestInstallBundles / latestInstallBundle', () => {
  it('null when nothing is published', () => {
    const store = createReleaseStore(root);
    expect(store.latestInstallBundles()).toBeNull();
    expect(store.latestInstallBundle('windows')).toBeNull();
    expect(createReleaseStore(path.join(root, 'nope')).latestInstallBundles()).toBeNull();
  });

  it('lists the install bundles of the latest release with size, sha256 and the folder mtime', () => {
    publish('1.0.9');
    fs.writeFileSync(path.join(root, '1.0.9', 'install-windows-x64.zip'), 'old');
    const dir = publish('1.0.10');
    const win = Buffer.from('windows-bundle');
    const lin = Buffer.from('linux');
    fs.writeFileSync(path.join(dir, 'install-windows-x64.zip'), win);
    fs.writeFileSync(path.join(dir, 'install-windows-x64.zip.sha256'), `${sha(win).toUpperCase()}  install-windows-x64.zip\n`);
    fs.writeFileSync(path.join(dir, 'install-linux-x64.tar.gz'), lin); // no sidecar: hashed
    fs.writeFileSync(path.join(dir, 'install-notes.txt'), 'not a bundle');
    fs.mkdirSync(path.join(dir, 'install-dir.zip'));
    const when = new Date('2026-11-13T10:00:00Z');
    fs.utimesSync(dir, when, when);

    const store = createReleaseStore(root);
    expect(store.latestInstallBundles()).toEqual({
      version: '1.0.10',
      publishedAt: '2026-11-13T10:00:00.000Z',
      bundles: [
        { name: 'install-linux-x64.tar.gz', size: 5, sha256: sha(lin) },
        { name: 'install-windows-x64.zip', size: win.length, sha256: sha(win) },
      ],
    });
    expect(store.latestInstallBundle('windows')).toEqual({ version: '1.0.10', name: 'install-windows-x64.zip' });
    expect(store.latestInstallBundle('linux')).toEqual({ version: '1.0.10', name: 'install-linux-x64.tar.gz' });
    expect(store.latestInstallBundle('macos')).toBeNull();
    expect(store.latestInstallBundle('')).toBeNull();
  });

  it('a release without install bundles has an empty list', () => {
    publish('1.0.0');
    expect(createReleaseStore(root).latestInstallBundles()).toMatchObject({ version: '1.0.0', bundles: [] });
    expect(createReleaseStore(root).latestInstallBundle('windows')).toBeNull();
  });
});
