// src/backup/DirectoryBackupTarget.js — BackupTarget on a (mounted) directory.
//
// put() writes <name>.part, fsyncs, then renames, so a crash or a failing
// source never leaves a half-written object under its real name. Works as-is
// for NFS/SMB mounts.
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { assertBackupName } from "./BackupTarget.js";

const PART = ".part";

export class DirectoryBackupTarget {
  constructor(root) {
    this.root = path.resolve(root);
  }

  #file(name) {
    assertBackupName(name);
    return path.join(this.root, ...name.split("/"));
  }

  async put(name, data) {
    const final = this.#file(name);
    const part = final + PART;
    // A file stream can fail (ENOENT) while we await mkdir below, before the
    // pipeline listens: without a listener that is an uncaught exception.
    data.on("error", () => {});
    await fsp.mkdir(path.dirname(final), { recursive: true });
    if (data.errored) throw data.errored;
    let bytes = 0;
    try {
      data.on("data", (c) => { bytes += c.length; });
      await pipeline(data, fs.createWriteStream(part));
      const fh = await fsp.open(part, "r+");
      try { await fh.sync(); } finally { await fh.close(); }
      await fsp.rename(part, final);
    } catch (err) {
      await fsp.rm(part, { force: true });
      throw err;
    }
    return { bytes };
  }

  async list(prefix = "") {
    const result = [];
    const walk = async (dir, rel) => {
      let entries;
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
      catch (e) { if (e.code === "ENOENT") return; throw e; }
      for (const e of entries) {
        const name = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(path.join(dir, e.name), name);
        else if (e.isFile() && !e.name.endsWith(PART) && name.startsWith(prefix)) {
          const s = await fsp.stat(path.join(dir, e.name));
          result.push({ name, bytes: s.size, modifiedAt: s.mtime });
        }
      }
    };
    await walk(this.root, "");
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  async remove(name) {
    await fsp.rm(this.#file(name), { force: true });
  }

  describe() {
    return `dir:${this.root}`;
  }
}
