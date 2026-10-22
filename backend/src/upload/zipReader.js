// src/upload/zipReader.js
//
// Thin promise wrapper over yauzl for reading uploaded session ZIPs without
// extracting them. Entry names come back raw (decodeStrings: false, then UTF-8),
// so the validator, not yauzl, decides what a bad name is. That way it can
// report a bad name as a check result instead of an exception.
import { Transform, pipeline } from "stream";
import yauzl from "yauzl";

function sliceStream(start, end = Infinity) {
  let pos = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      const from = Math.max(start - pos, 0);
      const to = Math.min(end + 1 - pos, chunk.length);
      pos += chunk.length;
      if (to > from) this.push(chunk.subarray(from, to));
      cb();
    },
  });
}

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
  // autoClose false: streams are opened by name long after the central
  // directory has been read, so the fd must stay open until close().
  const zip = await yauzl.openPromise(file, { lazyEntries: true, decodeStrings: false, autoClose: false });
  const raw = new Map(); // name -> yauzl entry (first occurrence wins)
  const entries = [];
  try {
    for await (const e of zip.eachEntry()) {
      const name = Buffer.isBuffer(e.fileName) ? e.fileName.toString("utf8") : String(e.fileName);
      entries.push({
        name,
        compressedSize: e.compressedSize,
        uncompressedSize: e.uncompressedSize,
        isDirectory: name.endsWith("/"),
      });
      if (!raw.has(name)) raw.set(name, e);
    }
  } catch (err) {
    zip.close();
    throw err;
  }

  return {
    entries,
    async openEntry(name, range) {
      const e = raw.get(name);
      if (!e) throw new Error("no such entry");
      const inflated = await zip.openReadStreamPromise(e);
      if (!range) return inflated;
      // yauzl's own start/end address the *compressed* bytes, so a range over
      // the inflated bytes is inflate-and-discard (spec §9).
      return pipeline(inflated, sliceStream(range.start, range.end), () => {});
    },
    close() {
      zip.close();
    },
  };
}
