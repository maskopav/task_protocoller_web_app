// src/upload/multipartReceiver.js
// Rules: docs/upload_management/specification.md §3.1.
//
// Parses the multipart body with busboy and streams the `zip` part straight to
// a temp file while hashing it, so a multi-GB upload never sits in memory. The
// text parts must arrive first (the desktop app's KtorUploadApi sends them that
// way), which lets every field be validated before anything touches the disk.
import busboy from "busboy";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { once } from "events";
import { Transform } from "stream";
import { pipeline } from "stream/promises";

export class UploadRequestError extends Error {
  /** @param {number} httpCode @param {string} error  snake_case code for the JSON body */
  constructor(httpCode, error, message = error) {
    super(message);
    this.httpCode = httpCode;
    this.error = error;
  }
}

const FORMATS = {
  installationId: /^[A-Za-z0-9-]{1,64}$/,
  sessionId: /^[0-9a-f]{32}$/,
  zipSha256: /^[0-9a-f]{64}$/,
  siteToken: /^[A-Za-z0-9_-]{16,64}$/,
  // Free text from the app, only bounded: no control characters, so it can
  // never break a log line or a CSV row.
  appVersion: /^[^\x00-\x1f\x7f]{1,32}$/,
};
const REQUIRED = ["installationId", "sessionId", "zipSha256"];
const TEXT_PARTS = new Set(Object.keys(FORMATS));

// The well-formed identifiers of a rejected request, so the caller can still
// write the upload_attempts row (spec §3.3: every request that got as far as a
// valid sessionId is recorded). Only values that passed their format check.
function attemptContext(fields) {
  const ok = (name) => (FORMATS[name].test(fields[name] ?? "") ? fields[name] : null);
  return { sessionId: ok("sessionId"), installationId: ok("installationId"), zipSha256: ok("zipSha256") };
}

/**
 * Streams one upload request to a temp file while hashing it. It never buffers
 * the ZIP and never logs the client filename. On any rejection the temp file is
 * removed.
 *
 * @param {import('express').Request} req
 * @param {{store: import('../storage/fileStore.js').LocalFileStore, maxBytes: number}} opts
 * @returns {Promise<{
 *   fields: {installationId: string, sessionId: string, zipSha256: string, siteToken?: string, appVersion?: string},
 *   file: {tempPath: string, bytes: number, sha256: string}
 * }>}  rejects with UploadRequestError (400) for a malformed request
 */
export async function receiveUpload(req, { store, maxBytes }) {
  let bb;
  try {
    bb = busboy({
      headers: req.headers,
      // +1: busboy marks a file that reaches fileSize exactly as truncated, and
      // a file of exactly maxBytes is allowed.
      // No `parts` limit: busboy signals partsLimit on reaching it, not on
      // exceeding it. files/fields signal on the first part over the limit.
      limits: { fileSize: maxBytes + 1, files: 1, fields: TEXT_PARTS.size, fieldSize: 256 },
    });
  } catch {
    // Not multipart/form-data at all.
    req.resume();
    throw new UploadRequestError(400, "bad_request");
  }

  return new Promise((resolve, reject) => {
    const fields = {};
    let zipSeen = false;
    let tempPath = null;
    let out = null;
    let fileDone = null;
    let settled = false;

    const fail = async (err) => {
      if (settled) return;
      settled = true;
      // Stop parsing but keep draining, so the error response can still be
      // delivered to a client that is mid-send.
      req.unpipe(bb);
      req.resume();
      try {
        if (out && !out.closed) {
          out.destroy();
          await once(out, "close");
        }
        if (tempPath) await store.discardTemp(tempPath);
      } catch {
        // The rejection below matters more than a leftover temp file.
      }
      if (err instanceof UploadRequestError) Object.assign(err, { attempt: attemptContext(fields) });
      // Answering while the client is still sending makes Node close the
      // socket with unread data, and the client sees a connection reset
      // instead of the 400. nginx caps the body, so draining is bounded.
      if (!req.readableEnded && !req.destroyed) {
        await new Promise((r) => {
          req.once("end", r);
          req.once("close", r);
        });
      }
      reject(err);
    };
    const bad = (error = "bad_request") => fail(new UploadRequestError(400, error));

    bb.on("field", (name, value, info) => {
      if (settled) return;
      if (zipSeen || !TEXT_PARTS.has(name) || name in fields || info.nameTruncated || info.valueTruncated) {
        return bad();
      }
      fields[name] = value;
    });

    bb.on("file", (name, stream, _info) => {
      // _info carries the client filename (<patientCode>_<sessionId>.zip):
      // personal data, deliberately never read.
      if (settled || name !== "zip" || zipSeen) {
        stream.resume();
        return bad();
      }
      zipSeen = true;
      const malformed = REQUIRED.some((k) => !(k in fields))
        || Object.entries(fields).some(([k, v]) => !FORMATS[k].test(v));
      if (malformed) {
        stream.resume();
        return bad();
      }

      tempPath = store.tempPath();
      const hash = crypto.createHash("sha256");
      let bytes = 0;
      const hasher = new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk);
          bytes += chunk.length;
          cb(null, chunk);
        },
      });
      let writeError = null;
      fileDone = (async () => {
        await fsp.mkdir(path.dirname(tempPath), { recursive: true });
        // Rejected while the folder was being made: never create the file.
        if (settled) {
          stream.resume();
          return null;
        }
        out =fs.createWriteStream(tempPath, { flags: "wx" });
        out.on("error", (e) => { writeError = e; });
        await pipeline(stream, hasher, out);
        // busboy stops at limits.fileSize and ends the stream normally; only
        // this flag tells a complete file from a cut-off one.
        if (stream.truncated) throw new UploadRequestError(400, "too_large");
        return { tempPath, bytes, sha256: hash.digest("hex") };
      })().catch((err) => {
        // A disk failure is ours (500); anything else on the way in is the
        // client's malformed or aborted transfer (400).
        fail(err instanceof UploadRequestError ? err : writeError ?? new UploadRequestError(400, "bad_request"));
        return null;
      });
    });

    for (const ev of ["filesLimit", "fieldsLimit"]) bb.on(ev, () => bad());
    bb.on("error", () => bad());
    req.on("aborted", () => bad());
    req.on("error", () => bad());

    bb.on("close", async () => {
      if (settled) return;
      if (!zipSeen) return bad();
      const file = await fileDone;
      if (settled || !file) return;
      settled = true;
      resolve({ fields, file });
    });

    req.pipe(bb);
  });
}
