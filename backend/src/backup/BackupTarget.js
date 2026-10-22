// src/backup/BackupTarget.js — CONTRACT (wave 0). Implementations: task C.
//
// Where backups go. The network storage's protocol hasn't been decided yet, so
// the backup service depends only on this interface. Supporting a new protocol
// (SFTP, S3, WebDAV, ...) takes one new class that passes
// backupTargetContract.js, plus one scheme in targetFactory.js. Nothing else
// changes.

/**
 * @interface BackupTarget
 *
 * @method put
 *   @param {string} name   relative, '/'-separated, [A-Za-z0-9._/-], no '..'
 *   @param {import('stream').Readable} data
 *   @returns {Promise<{bytes: number}>}
 *   Atomic: `name` is never visible half-written. Overwrites an existing name.
 *
 * @method list
 *   @param {string} [prefix='']
 *   @returns {Promise<{name: string, bytes: number, modifiedAt: Date}[]>}
 *
 * @method remove
 *   @param {string} name
 *   @returns {Promise<void>}   no error if absent
 *
 * @method describe
 *   @returns {string}          human-readable, no secrets (stored in backup_runs.target)
 */

const SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Throws unless `name` is a valid backup object name. Shared by all targets. */
export function assertBackupName(name) {
  const ok = typeof name === "string" && name.length > 0 &&
    name.split("/").every((s) => SEGMENT.test(s) && s !== "." && s !== "..");
  if (!ok) throw new Error(`invalid backup name: ${JSON.stringify(name)}`);
  return name;
}
