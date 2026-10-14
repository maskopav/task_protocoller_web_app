import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { collectSessionLogEntries, findStartOffset } from "./sessionLogReader.js";

// Same shape formatLogEntry() in logger.js writes: leading blank line, a
// "[ISO] [SOURCE] [LEVEL] message" header, indented continuation lines.
function frontendEntry(iso, message, sessionId) {
  return `\n[${iso}] [FRONTEND] [INFO] ${message}\n  URL: http://x/participant/interface\n  Context: {"sessionId":${sessionId},"taskIndex":2}\n`;
}
function backendEntry(iso, message, details) {
  const body = JSON.stringify(details, null, 2).split("\n").map((l) => `  ${l}`).join("\n");
  return `\n[${iso}] [BACKEND] [ERROR] ${message}\n  Details:\n${body}\n`;
}

let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-log-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeLog(name, content) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

describe("collectSessionLogEntries", () => {
  it("groups frontend and backend entries by session id, keeping multi-line entries whole", async () => {
    const logPath = writeLog("small.txt", [
      frontendEntry("2026-10-01T10:00:00.000Z", "recorder_mounted", 45),
      frontendEntry("2026-10-01T10:00:01.000Z", "other session", 452),
      backendEntry("2026-10-01T10:00:02.000Z", "Failed to save recording", { sessionId: "45", error: "disk full" }),
      backendEntry("2026-10-01T10:00:03.000Z", "Admin login failed", { email: "a@b.c" }),
    ].join(""));

    const result = await collectSessionLogEntries({ logPath, sessionIds: [45, 452] });

    const s45 = result.get(45).entries;
    expect(s45).toHaveLength(2);
    expect(s45[0]).toMatch(/^\[2026-10-01T10:00:00\.000Z\] \[FRONTEND\] \[INFO\] recorder_mounted/);
    expect(s45[1]).toContain("Failed to save recording");
    expect(s45[1]).toContain('"error": "disk full"');
    // 45 must not also pick up session 452's entries
    expect(result.get(452).entries).toHaveLength(1);
    expect(result.get(452).entries[0]).toContain("other session");
  });

  it("returns empty buckets when the log file doesn't exist", async () => {
    const result = await collectSessionLogEntries({ logPath: path.join(dir, "missing.txt"), sessionIds: [1] });
    expect(result.get(1)).toMatchObject({ entries: [], truncated: false });
  });

  it("seeks past old entries in a large log without losing any matching ones", async () => {
    // ~2 MB of history for session 7 (an id reused after a DB reset, say)
    // logged long before the exported session, then the real entries.
    const parts = [];
    const base = Date.parse("2025-01-01T00:00:00.000Z");
    for (let i = 0; i < 12000; i++) {
      parts.push(frontendEntry(new Date(base + i * 1000).toISOString(), `old ${i}`, 7));
    }
    parts.push(frontendEntry("2026-10-01T09:59:59.999Z", "just before since", 7));
    parts.push(frontendEntry("2026-10-01T10:00:00.000Z", "first new", 7));
    for (let i = 0; i < 2000; i++) {
      parts.push(frontendEntry(new Date(Date.parse("2026-10-01T10:00:01.000Z") + i).toISOString(), `filler ${i}`, 8));
    }
    parts.push(backendEntry("2026-10-01T11:00:00.000Z", "last new", { sessionId: 7 }));
    const logPath = writeLog("large.txt", parts.join(""));
    const size = fs.statSync(logPath).size;
    const sinceIso = "2026-10-01T10:00:00.000Z";

    const offset = findStartOffset(logPath, sinceIso, size);
    expect(offset).toBeGreaterThan(size / 2); // most of the file is skipped

    const result = await collectSessionLogEntries({ logPath, sessionIds: [7, 8], sinceIso });
    const messages = result.get(7).entries.map((e) => e.split("\n")[0].replace(/^\[[^\]]+\] \[\w+\] \[\w+\] /, ""));
    expect(messages).toContain("first new");
    expect(messages).toContain("last new");
    expect(messages).not.toContain("old 0");
    expect(result.get(8).entries).toHaveLength(2000);
  });

  it("reads the whole file when no lower bound is given", async () => {
    const logPath = writeLog("nobound.txt", frontendEntry("2020-01-01T00:00:00.000Z", "ancient", 3));
    const result = await collectSessionLogEntries({ logPath, sessionIds: [3] });
    expect(result.get(3).entries).toHaveLength(1);
  });
});
