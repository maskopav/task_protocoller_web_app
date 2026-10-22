// src/config/uploads.js
//
// Phase B settings, read once from the environment. DATA_PATH is required:
// accepted session ZIPs are the only copy of the data on this server until the
// backup has run, so a missing or read-only path must stop the boot rather than
// surface as a 500 on the first upload.
import fs from "fs";
import path from "path";

const DEFAULT_MAX_BYTES = 4 * 1024 ** 3;

export function loadUploadConfig(env = process.env) {
  if (!env.DATA_PATH) {
    throw new Error("DATA_PATH is not set — add it to backend/.env (directory for uploaded sessions)");
  }
  const dataPath = path.resolve(env.DATA_PATH);
  const maxBytes = Number(env.UPLOAD_MAX_BYTES) || DEFAULT_MAX_BYTES;
  return {
    dataPath,
    maxBytes,
    backup: {
      target: env.BACKUP_TARGET || null,
      dbKeep: Number(env.BACKUP_DB_KEEP) || 14,
      dumpCmd: env.BACKUP_DUMP_CMD || "mariadb-dump",
    },
  };
}

// Creates DATA_PATH (and its tmp/ and sessions/ folders) and proves it is
// writable. Called at startup.
export function ensureDataPath(dataPath) {
  for (const sub of ["tmp", "sessions"]) {
    fs.mkdirSync(path.join(dataPath, sub), { recursive: true });
  }
  fs.accessSync(dataPath, fs.constants.W_OK);
}
