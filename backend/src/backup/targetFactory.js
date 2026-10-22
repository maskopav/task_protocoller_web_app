// src/backup/targetFactory.js
//
// The single place a backup protocol is registered. To add one (sftp:, s3:,
// webdav:), write a class that passes backupTargetContract.js and add a
// scheme here.
import { DirectoryBackupTarget } from "./DirectoryBackupTarget.js";

const SCHEMES = {
  dir: (rest) => {
    if (!rest) throw new Error("BACKUP_TARGET 'dir:' needs a path, e.g. dir:/mnt/backup");
    return new DirectoryBackupTarget(rest);
  },
};

export function createBackupTarget(spec) {
  const m = /^([a-z][a-z0-9+-]*):(.*)$/i.exec(String(spec ?? ""));
  if (!m) throw new Error("BACKUP_TARGET must look like '<scheme>:<location>', e.g. dir:/mnt/backup");
  const make = SCHEMES[m[1].toLowerCase()];
  if (!make) {
    throw new Error(`unknown BACKUP_TARGET scheme '${m[1]}' (known: ${Object.keys(SCHEMES).join(", ")})`);
  }
  return make(m[2]);
}
