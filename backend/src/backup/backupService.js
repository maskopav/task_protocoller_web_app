// src/backup/backupService.js
//
// Nightly backups: a gzip'd DB dump (with retention) and an incremental copy of
// the session ZIPs. The target and dumper are injected, so the service knows
// nothing about protocols or mariadb-dump.
import zlib from "zlib";
import { pipeline } from "stream";
import { executeQuery } from "../db/queryHelper.js";

const DB_DUMP = /^db\/\d{8}-\d{6}\.sql\.gz$/;
const pad = (n) => String(n).padStart(2, "0");

export function utcStamp(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

// The message lands in backup_runs.error, which admins can read: keep it short
// and single-line. Dumper errors are already scrubbed of credentials.
const errText = (e) => String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 500);

export function createBackupService({
  target, dumper, store, query = executeQuery, clock = () => new Date(), dbKeep = 14,
}) {
  async function startRun(kind) {
    const res = await query(
      "INSERT INTO backup_runs (kind, started_at, status, target) VALUES (?, ?, 'running', ?)",
      [kind, clock(), target.describe()],
    );
    return res.insertId;
  }

  async function finishRun(id, { ok, artifact = null, bytes = 0, items = 0, error = null }) {
    await query(
      "UPDATE backup_runs SET finished_at = ?, status = ?, artifact = ?, bytes = ?, items = ?, error = ? WHERE id = ?",
      [clock(), ok ? "ok" : "failed", artifact, bytes, items, error, id],
    );
  }

  async function applyRetention() {
    const dumps = (await target.list("db/")).filter((o) => DB_DUMP.test(o.name))
      .sort((a, b) => b.name.localeCompare(a.name)); // UTC stamp: name order is age order
    for (const old of dumps.slice(dbKeep)) await target.remove(old.name);
  }

  async function runDbBackup() {
    const runId = await startRun("db");
    const name = `db/${utcStamp(clock())}.sql.gz`;
    try {
      // pipeline destroys the gzip stream when the dump errors, so put() sees
      // the failure and discards the partial object.
      const gz = pipeline(dumper.dump(), zlib.createGzip(), () => {});
      const { bytes } = await target.put(name, gz);
      const stored = (await target.list(name)).find((o) => o.name === name);
      if (!stored || stored.bytes !== bytes) throw new Error("stored dump size does not match");
      await applyRetention();
      await finishRun(runId, { ok: true, artifact: name, bytes, items: 1 });
      return { ok: true, artifact: name, bytes };
    } catch (err) {
      // No cleanup needed: put() is atomic, so a failed dump left nothing visible.
      await finishRun(runId, { ok: false, items: 0, error: errText(err) });
      return { ok: false, error: errText(err) };
    }
  }

  async function runFileBackup() {
    const runId = await startRun("files");
    let bytes = 0;
    let done = 0;
    let failed = 0;
    let firstError = null;
    let rows = [];
    try {
      rows = await query(
        "SELECT id, session_id, storage_path FROM upload_sessions " +
        "WHERE backed_up_at IS NULL AND status <> 'validating' ORDER BY id",
      );
    } catch (err) {
      await finishRun(runId, { ok: false, error: errText(err) });
      return { ok: false, error: errText(err) };
    }
    for (const row of rows) {
      const name = `sessions/${row.session_id.slice(0, 2)}/${row.session_id}.zip`;
      try {
        const res = await target.put(name, store.openRead(row.storage_path));
        const stored = (await target.list(name)).find((o) => o.name === name);
        if (!stored || stored.bytes !== res.bytes) throw new Error("stored size does not match");
        await query("UPDATE upload_sessions SET backed_up_at = ? WHERE id = ?", [clock(), row.id]);
        bytes += res.bytes;
        done += 1;
      } catch (err) {
        failed += 1;
        firstError ??= errText(err);
      }
    }
    const ok = failed === 0;
    const error = ok ? null : `${failed} of ${rows.length} sessions failed: ${firstError}`;
    await finishRun(runId, { ok, bytes, items: done, error });
    return { ok, items: done, failed, bytes, error };
  }

  return { runDbBackup, runFileBackup };
}
