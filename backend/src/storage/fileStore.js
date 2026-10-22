// src/storage/fileStore.js
//
// The one place that knows where session ZIPs live on disk:
//
//   DATA_PATH/tmp/<uuid>.part                 in-flight uploads
//   DATA_PATH/sessions/<id[0:2]>/<id>.zip     accepted archives, immutable
//
// tmp/ and sessions/ sit on the same filesystem, so commit() is an atomic
// rename: a session file is either complete or absent, never half-written.
// Keys (storage_path in the DB) are relative to the root, so DATA_PATH can move
// without a data migration.
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

const SESSION_ID = /^[0-9a-f]{32}$/;
const KEY = /^sessions\/[0-9a-f]{2}\/[0-9a-f]{32}\.zip$/;

export class LocalFileStore {
  constructor(root) {
    this.root = path.resolve(root);
  }

  /** A fresh temp file path for one incoming upload. */
  tempPath() {
    return path.join(this.root, "tmp", `${crypto.randomUUID()}.part`);
  }

  /** Storage key for a session. Throws on anything but a 32-hex id. */
  sessionKey(sessionId) {
    if (!SESSION_ID.test(String(sessionId))) throw new Error("invalid sessionId");
    return `sessions/${sessionId.slice(0, 2)}/${sessionId}.zip`;
  }

  /** Absolute path of a key. Only keys this store produced are accepted. */
  resolve(key) {
    if (!KEY.test(String(key))) throw new Error("invalid storage key");
    return path.join(this.root, ...key.split("/"));
  }

  /** Atomically moves a finished temp file to its key. Refuses to overwrite. */
  async commit(tempFile, key) {
    const target = this.resolve(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    // link + unlink instead of rename: rename silently replaces an existing
    // file, and an accepted session must never be replaced.
    await fsp.link(tempFile, target);
    await fsp.unlink(tempFile);
    return key;
  }

  /**
   * Overwrites `key` with a temp file. Only for an orphan: a file left by a
   * crash between commit() and the DB commit, which no upload_sessions row
   * references. Call it only while holding that session's row lock (ingest).
   */
  async replaceOrphan(tempFile, key) {
    await fsp.rename(tempFile, this.resolve(key));
    return key;
  }

  /** Readable stream of a stored file, optionally a byte range (inclusive end). */
  openRead(key, range) {
    return fs.createReadStream(this.resolve(key), range);
  }

  async stat(key) {
    const s = await fsp.stat(this.resolve(key));
    return { size: s.size, modifiedAt: s.mtime };
  }

  /** Removes a temp file. Never removes a stored session. Missing is fine. */
  async discardTemp(tempFile) {
    const tmpDir = path.join(this.root, "tmp") + path.sep;
    if (!path.resolve(tempFile).startsWith(tmpDir)) throw new Error("not a temp file");
    await fsp.rm(tempFile, { force: true });
  }
}
