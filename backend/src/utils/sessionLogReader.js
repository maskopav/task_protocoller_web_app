// backend/src/utils/sessionLogReader.js
// Pulls the system_log.txt entries belonging to specific sessions, for the
// session data export. system_log.txt is never rotated, so this is built to
// stay cheap as the file grows:
//   1. Entries are appended in time order, so a binary search over byte
//      offsets (reading only a small chunk per probe) skips everything logged
//      before the earliest exported session started -- O(log n) reads
//      instead of scanning years of history.
//   2. The remainder is streamed line by line (readline), never loaded whole.
//   3. Only entries matching a requested session are kept in memory, capped
//      per session so a runaway logging loop can't blow up the export.
import fs from "fs";
import readline from "readline";

// Same entry boundary readSystemLog() in logger.js relies on: every entry
// starts on its own line with "[<ISO timestamp>]"; continuation lines
// (URL/User-Agent/Context/Details) are indented, so they never match.
const ENTRY_HEADER = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/;
const HEADER_IN_CHUNK = /\n\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/;

// Frontend entries carry `Context: {"sessionId":452,...}`; backend entries
// put sessionId in their pretty-printed Details (`"sessionId": 452`, or
// `"sessionId": "452"` when it came from a route param).
const SESSION_ID = /"sessionId":\s*"?(\d+)/g;

const PROBE_CHUNK_BYTES = 64 * 1024;
const MAX_PROBE_BYTES = 1024 * 1024;
// Below this gap the binary search stops and streaming takes over.
const SEEK_RESOLUTION_BYTES = 256 * 1024;
export const MAX_LOG_BYTES_PER_SESSION = 20 * 1024 * 1024;

// Timestamp of the first entry starting at or after `offset`, or null if
// none starts within MAX_PROBE_BYTES (end of file, or one huge entry).
function firstTimestampAfter(fd, offset, fileSize) {
  const buf = Buffer.alloc(PROBE_CHUNK_BYTES);
  let carry = "";
  for (let pos = offset; pos < fileSize && pos - offset < MAX_PROBE_BYTES; pos += PROBE_CHUNK_BYTES) {
    const bytesRead = fs.readSync(fd, buf, 0, PROBE_CHUNK_BYTES, pos);
    if (bytesRead === 0) break;
    // A multi-byte char cut at a chunk edge decodes as garbage, but the
    // pattern itself is plain ASCII, so it's unaffected.
    const text = carry + buf.toString("utf8", 0, bytesRead);
    const match = text.match(HEADER_IN_CHUNK);
    if (match) return match[1];
    carry = text.slice(-40); // a header split across two chunks
  }
  return null;
}

// Byte offset from which every entry at or after `sinceIso` is guaranteed to
// be read (entries before it are skipped). Falls back to 0 on any doubt.
export function findStartOffset(logPath, sinceIso, fileSize) {
  if (!sinceIso || fileSize <= SEEK_RESOLUTION_BYTES) return 0;

  const fd = fs.openSync(logPath, "r");
  try {
    let lo = 0;
    let hi = fileSize;
    while (hi - lo > SEEK_RESOLUTION_BYTES) {
      const mid = Math.floor((lo + hi) / 2);
      const timestamp = firstTimestampAfter(fd, mid, fileSize);
      // ISO "...Z" strings compare correctly as plain strings.
      if (timestamp !== null && timestamp < sinceIso) lo = mid;
      else hi = mid;
    }
    return lo;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Collects system log entries per session.
 * @param {object} opts
 * @param {string} opts.logPath - path to system_log.txt
 * @param {number[]} opts.sessionIds - sessions to collect
 * @param {string|null} [opts.sinceIso] - ISO UTC lower bound; entries before
 *   it may be skipped (used only to seek -- pass it with a safety margin)
 * @returns {Promise<Map<number, {entries: string[], truncated: boolean}>>}
 */
export async function collectSessionLogEntries({ logPath, sessionIds, sinceIso = null }) {
  const result = new Map(sessionIds.map((id) => [Number(id), { entries: [], bytes: 0, truncated: false }]));
  if (!logPath || result.size === 0 || !fs.existsSync(logPath)) return result;

  // Fix the end at the current size: the log keeps being appended to while
  // the export runs, and a half-written trailing entry isn't worth chasing.
  const fileSize = fs.statSync(logPath).size;
  if (fileSize === 0) return result;
  const start = findStartOffset(logPath, sinceIso, fileSize);

  const addEntry = (lines) => {
    const entry = lines.join("\n").trimEnd();
    if (!entry.includes("sessionId")) return; // cheap pre-filter before the regex

    const matched = new Set();
    for (const m of entry.matchAll(SESSION_ID)) matched.add(Number(m[1]));
    for (const id of matched) {
      const bucket = result.get(id);
      if (!bucket || bucket.truncated) continue;
      if (bucket.bytes + entry.length > MAX_LOG_BYTES_PER_SESSION) {
        bucket.truncated = true;
        continue;
      }
      bucket.entries.push(entry);
      bucket.bytes += entry.length;
    }
  };

  const stream = fs.createReadStream(logPath, { start, end: fileSize - 1, encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });

  // Lines before the first header (the tail of an entry the seek landed in
  // the middle of) belong to an older entry and are dropped.
  let current = null;
  for await (const line of lines) {
    if (ENTRY_HEADER.test(line)) {
      if (current) addEntry(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) addEntry(current);

  return result;
}
