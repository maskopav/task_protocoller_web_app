// backend/src/utils/zipStreamWriter.js
// A minimal streaming ZIP writer built entirely on Node core modules (fs,
// zlib, node:events) -- no archiver/yazl/etc. dependency. Deliberately
// narrow: it only supports what the session data export needs -- an
// in-memory buffer entry (deflated, for the generated CSVs) and a
// from-disk file entry (stored uncompressed and streamed chunk-by-chunk,
// for recordings) -- not the full ZIP feature set (no folders as entries,
// no ZIP64, no encryption).
//
// Disk-file entries use the standard ZIP "streaming" format (general
// purpose bit 3): the local file header is written with CRC/sizes as
// placeholders, the file is streamed straight through to the output while
// a running CRC-32 and byte count are computed, and the real values are
// written afterwards in a data descriptor. That way a file of any size can
// be zipped with only one chunk held in memory at a time, instead of
// buffering it first just to learn its CRC-32 before the header can be
// written.
//
// All multi-byte fields are 32-bit -- same 4GB-per-value ceiling as
// classic (non-ZIP64) ZIP. Buffer's writeUInt32LE throws a RangeError if a
// size/offset ever exceeds that, so an export that grows too large fails
// loudly instead of silently producing a corrupt archive.
import fs from "fs";
import zlib from "zlib";
import { once } from "events";
import { crc32Update, crc32Finish, INITIAL_CRC_STATE } from "./crc32.js";

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

const FLAG_UTF8 = 0x0800;
const FLAG_DATA_DESCRIPTOR = 0x0008;

const VERSION_NEEDED = 20; // 2.0 -- deflate + data descriptors

function toDosDateTime(date) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

export class ZipStreamWriter {
  constructor(outStream) {
    this.out = outStream;
    this.offset = 0;
    this.entries = [];
    this.aborted = false;
    // If the client disconnects mid-download, stop writing instead of
    // waiting forever on a 'drain' event that will never come.
    outStream.on("error", () => { this.aborted = true; });
    outStream.on("close", () => { this.aborted = true; });
  }

  async _write(buffer) {
    if (this.aborted) {
      throw new Error("Output stream closed before zip export finished");
    }
    if (buffer.length === 0) return;
    this.offset += buffer.length;
    if (!this.out.write(buffer)) {
      await once(this.out, "drain");
    }
  }

  // Small in-memory content (used for the generated CSVs): deflated, since
  // it's cheap to do synchronously on a buffer already held whole, and text
  // compresses well. Falls back to STORE if deflate doesn't actually shrink
  // it (can happen on very small inputs).
  async addBuffer(name, content, mtime = new Date()) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const deflated = zlib.deflateRawSync(data);
    const useDeflate = deflated.length < data.length;
    const method = useDeflate ? METHOD_DEFLATE : METHOD_STORE;
    const payload = useDeflate ? deflated : data;
    const crc = crc32Finish(crc32Update(data));

    const { dosTime, dosDate } = toDosDateTime(mtime);
    const nameBuf = Buffer.from(name, "utf8");
    const localHeaderOffset = this.offset;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0);
    header.writeUInt16LE(VERSION_NEEDED, 4);
    header.writeUInt16LE(FLAG_UTF8, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(dosTime, 10);
    header.writeUInt16LE(dosDate, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(payload.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);

    await this._write(header);
    await this._write(nameBuf);
    await this._write(payload);

    this.entries.push({
      nameBuf, method, flag: FLAG_UTF8, dosTime, dosDate,
      crc, compressedSize: payload.length, uncompressedSize: data.length, localHeaderOffset,
    });
  }

  // Streams a file from disk in, without ever holding more than one chunk
  // in memory. Stored (not deflated): the recordings this is used for
  // (FLAC audio, gzipped coordinate JSON) are already compressed, so
  // deflating them again would spend CPU for close to zero size savings.
  async addFileFromDisk(name, filePath, mtime = new Date()) {
    const { dosTime, dosDate } = toDosDateTime(mtime);
    const nameBuf = Buffer.from(name, "utf8");
    const localHeaderOffset = this.offset;
    const flag = FLAG_UTF8 | FLAG_DATA_DESCRIPTOR;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0);
    header.writeUInt16LE(VERSION_NEEDED, 4);
    header.writeUInt16LE(flag, 6);
    header.writeUInt16LE(METHOD_STORE, 8);
    header.writeUInt16LE(dosTime, 10);
    header.writeUInt16LE(dosDate, 12);
    header.writeUInt32LE(0, 14); // crc -- unknown until streamed; see data descriptor below
    header.writeUInt32LE(0, 18); // compressed size
    header.writeUInt32LE(0, 22); // uncompressed size
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);

    await this._write(header);
    await this._write(nameBuf);

    let crcState = INITIAL_CRC_STATE;
    let size = 0;
    const readStream = fs.createReadStream(filePath);
    try {
      for await (const chunk of readStream) {
        crcState = crc32Update(chunk, crcState);
        size += chunk.length;
        await this._write(chunk);
      }
    } finally {
      readStream.destroy();
    }
    const crc = crc32Finish(crcState);

    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(DATA_DESCRIPTOR_SIGNATURE, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(size, 8);
    descriptor.writeUInt32LE(size, 12);
    await this._write(descriptor);

    this.entries.push({
      nameBuf, method: METHOD_STORE, flag, dosTime, dosDate,
      crc, compressedSize: size, uncompressedSize: size, localHeaderOffset,
    });
  }

  // Writes the central directory + end-of-central-directory record and
  // closes the output stream. Call exactly once, after every entry has
  // been added.
  async finalize() {
    const centralDirStart = this.offset;

    for (const e of this.entries) {
      const central = Buffer.alloc(46);
      central.writeUInt32LE(CENTRAL_FILE_SIGNATURE, 0);
      central.writeUInt16LE(VERSION_NEEDED, 4); // version made by
      central.writeUInt16LE(VERSION_NEEDED, 6); // version needed
      central.writeUInt16LE(e.flag, 8);
      central.writeUInt16LE(e.method, 10);
      central.writeUInt16LE(e.dosTime, 12);
      central.writeUInt16LE(e.dosDate, 14);
      central.writeUInt32LE(e.crc, 16);
      central.writeUInt32LE(e.compressedSize, 20);
      central.writeUInt32LE(e.uncompressedSize, 24);
      central.writeUInt16LE(e.nameBuf.length, 28);
      central.writeUInt16LE(0, 30); // extra field length
      central.writeUInt16LE(0, 32); // comment length
      central.writeUInt16LE(0, 34); // disk number start
      central.writeUInt16LE(0, 36); // internal attributes
      central.writeUInt32LE(0, 38); // external attributes
      central.writeUInt32LE(e.localHeaderOffset, 42);

      await this._write(central);
      await this._write(e.nameBuf);
    }

    const centralDirSize = this.offset - centralDirStart;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // disk with central dir start
    eocd.writeUInt16LE(this.entries.length, 8);
    eocd.writeUInt16LE(this.entries.length, 10);
    eocd.writeUInt32LE(centralDirSize, 12);
    eocd.writeUInt32LE(centralDirStart, 16);
    eocd.writeUInt16LE(0, 20); // comment length

    await this._write(eocd);
    this.out.end();
  }
}
