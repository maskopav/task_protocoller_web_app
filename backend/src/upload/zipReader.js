// src/upload/zipReader.js — CONTRACT STUB (wave 0). Implemented by task B.
//
// Thin promise wrapper over yauzl for reading uploaded session ZIPs without
// extracting them. Entry names come back raw (decodeStrings: false, then UTF-8),
// so the validator, not yauzl, decides what a bad name is. That way it can
// report a bad name as a check result instead of an exception.

/**
 * @typedef {Object} ZipEntryInfo
 * @property {string} name              entry name exactly as stored
 * @property {number} compressedSize
 * @property {number} uncompressedSize
 * @property {boolean} isDirectory      name ends with "/"
 */

/**
 * @typedef {Object} ZipHandle
 * @property {ZipEntryInfo[]} entries                 in archive order
 * @property {(name: string, range?: {start: number, end?: number}) => Promise<import('stream').Readable>} openEntry
 *           inflated bytes of one entry; with `range`, only those bytes (inclusive end)
 * @property {() => void} close
 */

/**
 * @param {string} file  absolute path
 * @returns {Promise<ZipHandle>}  rejects if the file is not a readable ZIP
 */
export async function openZip(file) {
  throw new Error("not implemented");
}
