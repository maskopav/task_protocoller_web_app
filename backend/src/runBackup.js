// src/runBackup.js
// Usage: node src/runBackup.js [db|files|all]   (default: all)
// Exit codes: 0 ok, 1 a run failed, 2 bad usage or missing/unknown BACKUP_TARGET.
import { loadUploadConfig } from "./config/uploads.js";
import { createBackupTarget } from "./backup/targetFactory.js";
import { MariaDbDumper } from "./backup/MariaDbDumper.js";
import { createBackupService } from "./backup/backupService.js";
import { LocalFileStore } from "./storage/fileStore.js";
import pool from "./db/connection.js";

const MODES = ["db", "files", "all"];

async function main() {
  const mode = process.argv[2] ?? "all";
  if (!MODES.includes(mode)) {
    console.error(`Usage: node src/runBackup.js [${MODES.join("|")}]`);
    return 2;
  }
  let config, target;
  try {
    config = loadUploadConfig();
    if (!config.backup.target) throw new Error("BACKUP_TARGET is not set (e.g. dir:/mnt/backup)");
    target = createBackupTarget(config.backup.target);
  } catch (err) {
    console.error(`Backup configuration error: ${err.message}`);
    return 2;
  }

  const dumper = new MariaDbDumper({
    cmd: config.backup.dumpCmd,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
  });
  const service = createBackupService({
    target, dumper, store: new LocalFileStore(config.dataPath), dbKeep: config.backup.dbKeep,
  });

  let failed = false;
  if (mode === "db" || mode === "all") {
    const r = await service.runDbBackup();
    console.log(r.ok ? `DB backup ok: ${r.artifact} (${r.bytes} bytes)` : `DB backup FAILED: ${r.error}`);
    failed ||= !r.ok;
  }
  if (mode === "files" || mode === "all") {
    const r = await service.runFileBackup();
    console.log(r.ok
      ? `File backup ok: ${r.items} session(s), ${r.bytes} bytes`
      : `File backup FAILED: ${r.error}`);
    failed ||= !r.ok;
  }
  return failed ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (err) {
  console.error("Backup crashed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
