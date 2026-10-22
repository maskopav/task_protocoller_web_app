import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LocalFileStore } from './fileStore.js';
import { ensureDataPath, loadUploadConfig, sweepTempFiles } from '../config/uploads.js';

const ID = '76a67cd8af73486da13a7c0e1509bd2f';
let root, store;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'filestore-'));
  ensureDataPath(root);
  store = new LocalFileStore(root);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const writeTemp = (content = 'zip-bytes') => {
  const p = store.tempPath();
  fs.writeFileSync(p, content);
  return p;
};

describe('LocalFileStore', () => {
  it('shards sessions by the first two hex chars', () => {
    expect(store.sessionKey(ID)).toBe(`sessions/76/${ID}.zip`);
  });

  it('refuses ids and keys it did not make (no path tricks)', () => {
    expect(() => store.sessionKey('../../etc/passwd')).toThrow();
    expect(() => store.resolve('sessions/76/../../x.zip')).toThrow();
    expect(() => store.resolve('tmp/whatever.part')).toThrow();
  });

  it('commits a temp file atomically and reads it back, also by range', async () => {
    const tmp = writeTemp('0123456789');
    const key = await store.commit(tmp, store.sessionKey(ID));
    expect(fs.existsSync(tmp)).toBe(false);
    expect((await store.stat(key)).size).toBe(10);
    const chunks = [];
    for await (const c of store.openRead(key, { start: 2, end: 4 })) chunks.push(c);
    expect(Buffer.concat(chunks).toString()).toBe('234');
  });

  it('never overwrites an accepted session', async () => {
    const key = store.sessionKey(ID);
    await store.commit(writeTemp('first'), key);
    const second = writeTemp('second');
    await expect(store.commit(second, key)).rejects.toThrow();
    expect(fs.readFileSync(store.resolve(key), 'utf8')).toBe('first');
  });

  it('only discards files inside tmp/', async () => {
    const tmp = writeTemp();
    await store.discardTemp(tmp);
    expect(fs.existsSync(tmp)).toBe(false);
    await store.discardTemp(tmp); // already gone: fine
    await expect(store.discardTemp(path.join(root, 'sessions', 'x.zip'))).rejects.toThrow();
  });
});

describe('loadUploadConfig', () => {
  it('requires DATA_PATH', () => {
    expect(() => loadUploadConfig({})).toThrow(/DATA_PATH/);
  });

  it('sweepTempFiles empties tmp/ and leaves sessions alone', async () => {
    fs.writeFileSync(store.tempPath(), 'leftover');
    const key = await store.commit(writeTemp('kept'), store.sessionKey(ID));
    expect(sweepTempFiles(root)).toBe(1);
    expect(fs.readdirSync(path.join(root, 'tmp'))).toEqual([]);
    expect(fs.readFileSync(store.resolve(key), 'utf8')).toBe('kept');
  });

  it('applies defaults', () => {
    const c = loadUploadConfig({ DATA_PATH: root });
    expect(c.maxBytes).toBe(4 * 1024 ** 3);
    expect(c.backup).toEqual({ target: null, dbKeep: 14, dumpCmd: 'mariadb-dump' });
    expect(c.limits).toEqual({ quarantineMaxBytes: 20 * 1024 ** 3, quarantineMaxPerDevice: 50, minFreeBytes: 5 * 1024 ** 3 });
  });
});
