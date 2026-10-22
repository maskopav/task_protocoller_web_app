// src/backup/DatabaseDumper.js — CONTRACT (wave 0). Implementation: task C.

/**
 * @interface DatabaseDumper
 *
 * @method dump
 *   @returns {import('stream').Readable}  SQL text of the whole database. The
 *   stream emits 'error' if the dump fails (non-zero exit), so a broken dump is
 *   never stored as if it were complete.
 */
export {};
