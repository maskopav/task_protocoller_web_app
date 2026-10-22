// src/upload/archiveValidator.js
// Rules: docs/upload_management/specification.md §4.1.
import crypto from "crypto";
import { openZip } from "./zipReader.js";
import { taskInstances } from "./sessionExtractor.js";

/**
 * @typedef {'ok'|'bad'|'warn'|'skip'} CheckResult
 * @typedef {{key: 'zip_checksum'|'archive'|'manifest'|'ids'|'device'|'config_version'|'complete',
 *            result: CheckResult, detail?: string}} Check
 *
 * @typedef {Object} ParsedArchive    null members when the file is absent or unparsable
 * @property {object|null} manifest
 * @property {object|null} examination
 * @property {object|null} participant
 * @property {object|null} snapshot          task_configuration_snapshot.json
 * @property {object|null} timelineOriginal
 * @property {object|null} timelineEdited
 *
 * @typedef {Object} ValidationResult
 * @property {Check[]} checks                 always all seven keys, in spec order
 * @property {'valid'|'invalid'} status
 * @property {'manifest'|'malformed'|'unknown_device'|null} invalidReason
 * @property {ParsedArchive} parsed
 */

const MAX_ENTRIES = 10_000;
const MAX_RATIO = 200;
// The per-entry ratio alone does not stop a bomb built from many modest
// entries, so the sum of what would be inflated is capped too. yauzl's
// validateEntrySizes (on by default) fails a stream whose inflated size differs
// from the declared one, which makes declared sizes trustworthy here.
const MAX_TOTAL_RATIO = 20;
const MAX_TOTAL_BYTES = 8 * 1024 ** 3;
// The JSON files are buffered and parsed together. Real ones are kilobytes;
// the caps only stop hostile ones from exhausting the heap.
const MAX_JSON_BYTES = 4 * 1024 ** 2;
const MAX_JSON_TOTAL_BYTES = 16 * 1024 ** 2;
// Smallest possible local record: fixed header plus the compressed data. Using
// the lower bound means an honest archive can never be flagged as overlapping.
const LOCAL_HEADER_BYTES = 30;

// A Map, not an object literal: an entry named "constructor" or "__proto__"
// must not look like a JSON file.
const JSON_FILES = new Map([
  ["manifest.json", "manifest"],
  ["examination.json", "examination"],
  ["participant.json", "participant"],
  ["task_configuration_snapshot.json", "snapshot"],
  ["timeline_original.json", "timelineOriginal"],
  ["timeline_edited.json", "timelineEdited"],
]);
const REQUIRED = ["manifest.json", "examination.json", "participant.json",
  "task_configuration_snapshot.json", "timeline_original.json"];

// Which check, when bad, makes the session invalid for which reason.
const REASON = { archive: "malformed", manifest: "manifest", ids: "malformed",
  device: "unknown_device", config_version: "malformed" };

/** Why an entry name is unacceptable, or null. */
function badName(name) {
  if (!name || name.includes("\0")) return "empty name";
  if (name.includes("\\")) return "backslash in name";
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return "absolute name";
  if (name.split("/").includes("..")) return "parent directory reference";
  if (name.endsWith("/")) return "directory entry";
  return null;
}

async function drain(stream, { hash, collect }) {
  const h = hash ? crypto.createHash("sha256") : null;
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    h?.update(chunk);
    if (collect) {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) throw new Error("json file too large");
      chunks.push(chunk);
    }
  }
  return { sha: h?.digest("hex"), buf: collect ? Buffer.concat(chunks) : null };
}

const quote = (name) => JSON.stringify(name.slice(0, 80));

/**
 * Indexes of entries whose local records share or overlap another's. Each
 * overlapping entry would inflate the same compressed bytes again.
 */
function overlapping(entries) {
  const order = entries.map((e, i) => i)
    .sort((a, b) => entries[a].relativeOffsetOfLocalHeader - entries[b].relativeOffsetOfLocalHeader);
  const out = new Set();
  let prev = -1;
  let prevEnd = -1;
  for (const i of order) {
    const e = entries[i];
    const start = e.relativeOffsetOfLocalHeader;
    if (prev >= 0 && start < prevEnd) {
      out.add(prev);
      out.add(i);
    }
    const end = start + LOCAL_HEADER_BYTES + e.compressedSize;
    if (end > prevEnd) {
      prevEnd = end;
      prev = i;
    }
  }
  return out;
}

const check = (key, result, detail) => (detail === undefined ? { key, result } : { key, result, detail });

/**
 * Validates one stored session ZIP. It never throws for a bad archive, because
 * that is a result. It throws only for I/O failures on a file that should exist.
 *
 * @param {string} file  absolute path of the stored ZIP
 * @param {Object} ctx
 * @param {string} ctx.sessionId              from the upload form
 * @param {string} ctx.installationId         from the upload form
 * @param {boolean} ctx.siteKnown             false = quarantined (device check fails)
 * @param {string|null} ctx.currentConfigVersion  the site's current config version, if known
 * @returns {Promise<ValidationResult>}
 */
export async function validateArchive(file, ctx) {
  const parsed = { manifest: null, examination: null, participant: null, snapshot: null,
    timelineOriginal: null, timelineEdited: null };
  const problems = [];       // archive-check failures
  const hashes = new Map();  // entry name -> sha256 (only for entries actually streamed)
  let hashingComplete = false;

  let zip = null;
  try {
    zip = await openZip(file);
  } catch (err) {
    // A missing or unreadable file is an I/O failure the caller must see; yauzl's own
    // format errors carry no errno code and are a verdict on the archive.
    if (err.code) throw err;
    problems.push(`not a readable ZIP (${err.message})`);
  }

  if (zip) {
    try {
      const { entries } = zip;
      if (entries.length > MAX_ENTRIES) {
        problems.push(`too many entries (${entries.length})`);
      } else {
        const overlaps = overlapping(entries);
        if (overlaps.size) problems.push(`entries share local data (${overlaps.size} entries)`);
        const seen = new Set();
        let streamable = [];
        for (const [i, e] of entries.entries()) {
          const why = badName(e.name);
          if (why) problems.push(`${why}: ${quote(e.name)}`);
          if (seen.has(e.name)) {
            problems.push(`duplicate entry name: ${quote(e.name)}`);
            continue; // streams open by name, so a twin could never be hashed on its own
          }
          seen.add(e.name);
          if (e.isDirectory) continue;
          if (overlaps.has(i)) continue;
          const ratioBad = e.compressedSize === 0 ? e.uncompressedSize > 0 : e.uncompressedSize / e.compressedSize > MAX_RATIO;
          if (ratioBad) {
            problems.push(`compression ratio above ${MAX_RATIO}: ${quote(e.name)}`);
            continue; // never inflate a likely bomb
          }
          streamable.push(e);
        }

        const total = streamable.reduce((n, e) => n + e.uncompressedSize, 0);
        const totalCap = Math.min(MAX_TOTAL_BYTES, MAX_TOTAL_RATIO * zip.fileSize);
        if (total > totalCap) {
          problems.push(`total uncompressed size too large (${total} bytes)`);
          streamable = []; // inflate nothing
        }

        // JSON files over the caps are still hashed, but never buffered or parsed.
        let jsonTotal = 0;
        for (const e of streamable) if (JSON_FILES.has(e.name)) jsonTotal += e.uncompressedSize;
        const jsonTooLarge = jsonTotal > MAX_JSON_TOTAL_BYTES;
        if (jsonTooLarge) problems.push(`JSON files too large together (${jsonTotal} bytes)`);

        // One pass: hash every entry, keep the small JSON files.
        let streamFailed = false;
        for (const e of streamable) {
          const { name } = e;
          let key = JSON_FILES.get(name);
          if (key && (jsonTooLarge || e.uncompressedSize > MAX_JSON_BYTES)) {
            if (!jsonTooLarge) problems.push(`${name} too large (${e.uncompressedSize} bytes)`);
            key = undefined;
          }
          try {
            const { sha, buf } = await drain(await zip.openEntry(name), { hash: true, collect: !!key });
            hashes.set(name, sha);
            if (key) {
              try {
                parsed[key] = JSON.parse(buf.toString("utf8"));
              } catch {
                problems.push(`${name} is not valid JSON`);
              }
            }
          } catch (err) {
            streamFailed = true;
            problems.push(`entry unreadable: ${quote(name)} (${err.message})`);
          }
        }
        hashingComplete = !streamFailed && hashes.size === entries.filter((e) => !e.isDirectory).length;
      }

      const names = new Set(entries.map((e) => e.name));
      for (const r of REQUIRED) if (!names.has(r)) problems.push(`${r} is missing`);
    } finally {
      zip.close();
    }
  }

  const archive = problems.length ? check("archive", "bad", problems[0]) : check("archive", "ok");
  const manifest = checkManifest(parsed.manifest, zip?.entries ?? [], hashes, hashingComplete);
  const ids = checkIds(parsed, ctx);
  const device = ctx.siteKnown ? check("device", "ok") : check("device", "bad", "no site for this device");
  const configVersion = checkConfigVersion(parsed, ctx);
  const complete = checkComplete(parsed);

  const checks = [check("zip_checksum", "ok", "verified at ingest"), archive, manifest, ids, device, configVersion, complete];
  const firstBad = checks.find((c) => c.result === "bad");
  return {
    checks,
    status: firstBad ? "invalid" : "valid",
    invalidReason: firstBad ? REASON[firstBad.key] : null,
    parsed,
  };
}

function checkManifest(manifest, entries, hashes, hashingComplete) {
  if (!manifest) return check("manifest", "skip", "manifest.json unavailable");
  if (!Array.isArray(manifest.files)) return check("manifest", "bad", "manifest has no files list");

  const listed = new Set();
  for (const f of manifest.files) {
    if (!f || typeof f.path !== "string" || typeof f.sha256 !== "string") {
      return check("manifest", "bad", "manifest has a malformed files entry");
    }
    if (listed.has(f.path)) return check("manifest", "bad", `listed twice: ${JSON.stringify(f.path.slice(0, 80))}`);
    listed.add(f.path);
  }
  const names = new Set(entries.map((e) => e.name));
  for (const f of manifest.files) {
    if (!names.has(f.path)) return check("manifest", "bad", `listed but missing: ${JSON.stringify(f.path.slice(0, 80))}`);
  }
  for (const e of entries) {
    if (e.name !== "manifest.json" && !e.isDirectory && !listed.has(e.name)) {
      return check("manifest", "bad", `not listed: ${JSON.stringify(e.name.slice(0, 80))}`);
    }
  }
  for (const f of manifest.files) {
    const actual = hashes.get(f.path);
    if (actual === undefined) continue; // not streamed (skipped as a likely bomb or unreadable): the archive check already failed
    if (actual !== f.sha256.toLowerCase()) return check("manifest", "bad", `hash mismatch: ${JSON.stringify(f.path.slice(0, 80))}`);
  }
  if (!hashingComplete) return check("manifest", "skip", "some entries could not be hashed");
  return check("manifest", "ok");
}

function checkIds(parsed, ctx) {
  const { manifest, examination } = parsed;
  if (!manifest || !examination) return check("ids", "skip", "manifest or examination unavailable");
  const sessionIds = [["manifest", manifest.sessionId], ["examination", examination.sessionId]];
  for (const [label, t] of [["timeline_original", parsed.timelineOriginal], ["timeline_edited", parsed.timelineEdited]]) {
    if (t && t.sessionId !== undefined) sessionIds.push([label, t.sessionId]);
  }
  for (const [label, id] of sessionIds) {
    if (id !== ctx.sessionId) return check("ids", "bad", `sessionId differs in ${label}`);
  }
  if (examination.installationId !== ctx.installationId) return check("ids", "bad", "installationId differs in examination");
  return check("ids", "ok");
}

function checkConfigVersion(parsed, ctx) {
  const { manifest, examination } = parsed;
  if (!manifest || !examination) return check("config_version", "skip", "manifest or examination unavailable");
  if (manifest.configVersion !== examination.configVersion) {
    return check("config_version", "bad", "manifest and examination configVersion differ");
  }
  const cur = ctx.currentConfigVersion;
  if (cur && String(examination.configVersion) < cur) {
    // Both sides are the same primitive here (=== above), so String() is safe.
    return check("config_version", "warn", `recorded with ${String(examination.configVersion).slice(0, 64)}, current is ${cur}`);
  }
  return check("config_version", "ok");
}

function checkComplete(parsed) {
  const { examination } = parsed;
  if (!examination) return check("complete", "skip", "examination unavailable");
  const issues = [];
  if (!examination.endedAt) issues.push("session has no end time");
  const instances = taskInstances(examination, parsed.snapshot);
  const missing = instances.filter((i) => i.result === "Missing").length;
  if (missing) issues.push(`${missing} task instance(s) missing`);
  if (instances.capped) issues.push("expected task list exceeds the limits and was capped");
  return issues.length ? check("complete", "warn", issues.join("; ")) : check("complete", "ok");
}
