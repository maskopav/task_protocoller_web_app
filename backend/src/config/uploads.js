// src/config/uploads.js
//
// Phase B settings, read once from the environment. DATA_PATH is required:
// accepted session ZIPs are the only copy of the data on this server until the
// backup has run, so a missing or read-only path must stop the boot rather than
// surface as a 500 on the first upload.
import fs from "fs";
import path from "path";

const DEFAULT_MAX_BYTES = 4 * 1024 ** 3;
const GiB = 1024 ** 3;

export function loadUploadConfig(env = process.env) {
  if (!env.DATA_PATH) {
    throw new Error("DATA_PATH is not set — add it to backend/.env (directory for uploaded sessions)");
  }
  const dataPath = path.resolve(env.DATA_PATH);
  const maxBytes = Number(env.UPLOAD_MAX_BYTES) || DEFAULT_MAX_BYTES;
  return {
    dataPath,
    maxBytes,
    // Quarantine accepts uploads without a valid site token (today's desktop
    // app sends none), so it is the one place an anonymous client can make
    // the server store data. These bound what it can store.
    limits: {
      quarantineMaxBytes: Number(env.QUARANTINE_MAX_BYTES) || 20 * GiB,
      quarantineMaxPerDevice: Number(env.QUARANTINE_MAX_PER_DEVICE) || 50,
      // Below this much free space on DATA_PATH every upload is refused (507),
      // so a flood can never fill the disk the DB and backups share.
      minFreeBytes: Number(env.MIN_FREE_BYTES) || 5 * GiB,
    },
    backup: {
      target: env.BACKUP_TARGET || null,
      dbKeep: Number(env.BACKUP_DB_KEEP) || 14,
      dumpCmd: env.BACKUP_DUMP_CMD || "mariadb-dump",
    },
  };
}

// Deletes every file in DATA_PATH/tmp. Only safe at startup, before the upload
// route accepts requests. Returns how many files were removed.
export function sweepTempFiles(dataPath) {
  const dir = path.join(dataPath, "tmp");
  let n = 0;
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    fs.rmSync(path.join(dir, name), { force: true, recursive: true });
    n++;
  }
  return n;
}

// Creates DATA_PATH (and its tmp/ and sessions/ folders) and proves it is
// writable. Called at startup.
export function ensureDataPath(dataPath) {
  for (const sub of ["tmp", "sessions"]) {
    fs.mkdirSync(path.join(dataPath, sub), { recursive: true });
  }
  fs.accessSync(dataPath, fs.constants.W_OK);
}
