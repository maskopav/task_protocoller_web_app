// src/backup/MariaDbDumper.js — DatabaseDumper over the mariadb-dump binary.
//
// Credentials never touch argv (visible in `ps`) or the environment. They go
// through an option file, passed as --defaults-extra-file:
//
//  - plain `mariadb-dump`: a temp file, mode 600, deleted when the dump ends.
//  - wrapped command (BACKUP_DUMP_CMD="docker exec -i tp-mariadb mariadb-dump"):
//    a host file would not exist inside the container, so the same option
//    text is written to the child's stdin and read via /dev/stdin. This works
//    for any wrapper that forwards stdin (docker exec -i, ssh host ...) on a
//    Linux target. Wrappers that don't forward stdin are unsupported.
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawn as nodeSpawn } from "child_process";
import { PassThrough } from "stream";

// Option-file values are double-quoted; backslash and quote must be escaped.
const q = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export class MariaDbDumper {
  /**
   * @param {object} o
   * @param {string} [o.cmd="mariadb-dump"]  command, optionally with prefix args
   * @param {string} o.database
   * @param {string} o.user
   * @param {string} o.password
   * @param {string} [o.host]
   * @param {string|number} [o.port]
   * @param {Function} [o.spawn]   injectable for tests
   * @param {string} [o.tmpDir]
   */
  constructor({ cmd = "mariadb-dump", database, user, password, host, port, spawn = nodeSpawn, tmpDir = os.tmpdir() }) {
    const parts = String(cmd).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) throw new Error("dump command is empty");
    if (!database) throw new Error("MariaDbDumper needs a database name");
    [this.bin, ...this.prefixArgs] = parts;
    Object.assign(this, { database, user, password, host, port, spawn, tmpDir });
  }

  #optionText() {
    const lines = ["[client]"];
    if (this.user) lines.push(`user=${q(this.user)}`);
    if (this.password) lines.push(`password=${q(this.password)}`);
    if (this.host) lines.push(`host=${q(this.host)}`);
    if (this.port) lines.push(`port=${Number(this.port)}`);
    return lines.join("\n") + "\n";
  }

  dump() {
    const out = new PassThrough();
    const viaStdin = this.prefixArgs.length > 0;
    let optFile = null;
    const cleanup = () => { if (optFile) { fs.rmSync(optFile, { force: true }); optFile = null; } };
    const fail = (err) => { cleanup(); out.destroy(err); };

    let credArg;
    try {
      if (viaStdin) credArg = "--defaults-extra-file=/dev/stdin";
      else {
        optFile = path.join(this.tmpDir, `tp-dump-${crypto.randomUUID()}.cnf`);
        fs.writeFileSync(optFile, this.#optionText(), { mode: 0o600, flag: "wx" });
        credArg = `--defaults-extra-file=${optFile}`;
      }
      // --defaults-extra-file must be the first option.
      const args = [...this.prefixArgs, credArg, "--single-transaction", "--routines", "--triggers", this.database];
      const child = this.spawn(this.bin, args, { stdio: ["pipe", "pipe", "pipe"] });

      let stderr = "";
      child.stderr?.on("data", (c) => { if (stderr.length < 2000) stderr += c; });
      child.on("error", (e) => fail(new Error(`could not run ${this.bin}: ${e.message}`)));
      child.stdout.pipe(out, { end: false });
      child.on("close", (code, signal) => {
        cleanup();
        if (code === 0) return out.end();
        // stderr from mariadb-dump never echoes the password, but scrub anyway.
        const msg = this.password ? stderr.split(this.password).join("***") : stderr;
        out.destroy(new Error(`mariadb-dump failed (${signal ?? `exit ${code}`}): ${msg.trim().slice(0, 500)}`));
      });
      if (viaStdin) child.stdin.on("error", () => {}).end(this.#optionText());
      else child.stdin?.end();
    } catch (e) {
      fail(e);
    }
    return out;
  }
}
