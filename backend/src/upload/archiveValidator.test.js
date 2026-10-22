import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { validateArchive } from "./archiveValidator.js";
import { buildSessionZip, VARIANTS, CONFIG_VERSION, INSTALLATION_ID } from "../../test/fixtures/buildSessionZip.js";
import { writeZip } from "../../test/fixtures/zipWriter.js";

const dirs = [];
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const build = (variant) => {
  const f = buildSessionZip({ variant });
  dirs.push(path.dirname(f.path));
  return f;
};
const run = (f, extra = {}) => validateArchive(f.path, {
  sessionId: f.sessionId, installationId: f.installationId, siteKnown: true,
  currentConfigVersion: CONFIG_VERSION, ...extra,
});
const results = (v) => Object.fromEntries(v.checks.map((c) => [c.key, c.result]));

const OK = { zip_checksum: "ok", archive: "ok", manifest: "ok", ids: "ok", device: "ok", config_version: "ok", complete: "ok" };
const ALL_SKIPPED = { manifest: "skip", ids: "skip", config_version: "skip", complete: "skip" };

// variant -> [status, invalidReason, check results that differ from all-ok]
const TABLE = {
  valid: ["valid", null, {}],
  noMaster: ["valid", null, {}],
  edited: ["valid", null, {}],
  manifestHashMismatch: ["invalid", "manifest", { manifest: "bad" }],
  missingEntry: ["invalid", "manifest", { manifest: "bad" }],
  unlistedEntry: ["invalid", "manifest", { manifest: "bad" }],
  idMismatch: ["invalid", "malformed", { ids: "bad" }],
  badJson: ["invalid", "malformed", { archive: "bad", ids: "skip", config_version: "skip", complete: "skip" }],
  zipSlipName: ["invalid", "malformed", { archive: "bad" }],
  recoveredInterrupted: ["valid", null, { complete: "warn" }],
  nonstdMic: ["valid", null, {}],
  oldConfig: ["valid", null, { config_version: "warn" }],
  highRatio: ["invalid", "malformed", { archive: "bad", manifest: "skip" }],
  tooManyEntries: ["invalid", "malformed", { archive: "bad", ...ALL_SKIPPED }],
  directoryEntry: ["invalid", "malformed", { archive: "bad" }],
  hugeRepetition: ["valid", null, { complete: "warn" }],
  overlappingEntries: ["invalid", "malformed", { archive: "bad", manifest: "skip" }],
  jsonTooLarge: ["invalid", "malformed", { archive: "bad" }],
  nullTask: ["valid", null, {}],
  longStrings: ["valid", null, {}],
};

describe("validateArchive", () => {
  it("the table covers every fixture variant", () => {
    expect(Object.keys(TABLE).sort()).toEqual([...VARIANTS].sort());
  });

  it.each(VARIANTS)("%s", async (variant) => {
    const [status, reason, diff] = TABLE[variant];
    const v = await run(build(variant));
    expect(v.checks.map((c) => c.key)).toEqual(Object.keys(OK));
    expect(results(v)).toEqual({ ...OK, ...diff });
    expect(v.status).toBe(status);
    expect(v.invalidReason).toBe(reason);
  });

  it("every bad or warn check explains itself", async () => {
    const v = await run(build("manifestHashMismatch"));
    expect(v.checks.find((c) => c.key === "manifest").detail).toMatch(/hash mismatch/);
  });

  it("parses the JSON files, and leaves unparsable or absent ones null", async () => {
    const ok = await run(build("valid"));
    expect(ok.parsed.examination.protocolName).toBe("Speech battery");
    expect(ok.parsed.manifest.files.length).toBeGreaterThan(5);
    expect(ok.parsed.timelineEdited).toBeNull();
    expect((await run(build("edited"))).parsed.timelineEdited.segments).toHaveLength(1);
    expect((await run(build("badJson"))).parsed.examination).toBeNull();
  });

  it("zipSlipName reports the offending name", async () => {
    const v = await run(build("zipSlipName"));
    expect(v.checks.find((c) => c.key === "archive").detail).toMatch(/parent directory/);
  });

  it("an unknown site fails the device check and gives reason unknown_device", async () => {
    const v = await run(build("valid"), { siteKnown: false });
    expect(results(v)).toEqual({ ...OK, device: "bad" });
    expect(v.status).toBe("invalid");
    expect(v.invalidReason).toBe("unknown_device");
  });

  it("the first failing check in spec order sets the reason", async () => {
    // manifest (reason manifest) comes before device (unknown_device)
    const v = await run(build("manifestHashMismatch"), { siteKnown: false });
    expect(v.invalidReason).toBe("manifest");
    const w = await run(build("zipSlipName"), { siteKnown: false });
    expect(w.invalidReason).toBe("malformed");
  });

  it("the form's installationId must match examination.installationId", async () => {
    const v = await run(build("valid"), { installationId: "other-installation" });
    expect(results(v).ids).toBe("bad");
    expect(v.invalidReason).toBe("malformed");
  });

  it("the form's sessionId must match the archive", async () => {
    const v = await run(build("valid"), { sessionId: "a".repeat(32) });
    expect(results(v).ids).toBe("bad");
  });

  it("no known current config version: nothing is outdated", async () => {
    const v = await run(build("oldConfig"), { currentConfigVersion: null });
    expect(results(v).config_version).toBe("ok");
  });

  it("a file that is not a ZIP is an archive failure, not an exception", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "not-a-zip-"));
    dirs.push(dir);
    const file = path.join(dir, "x.zip");
    fs.writeFileSync(file, "this is not a zip");
    const v = await validateArchive(file, { sessionId: "a".repeat(32), installationId: INSTALLATION_ID, siteKnown: true, currentConfigVersion: null });
    expect(results(v)).toEqual({ ...OK, archive: "bad", ...ALL_SKIPPED });
    expect(v.invalidReason).toBe("malformed");
    expect(Object.values(v.parsed).every((p) => p === null)).toBe(true);
  });

  describe("hostile archives end quickly", () => {
    const detail = (v) => v.checks.find((c) => c.key === "archive").detail;
    const timed = async (f) => {
      const t0 = Date.now();
      const v = await run(f);
      return { v, ms: Date.now() - t0 };
    };

    it("hugeRepetition: the expected list is capped and the complete check says so", async () => {
      const { v, ms } = await timed(build("hugeRepetition"));
      expect(ms).toBeLessThan(2000);
      expect(v.checks.find((c) => c.key === "complete").detail).toMatch(/capped/);
    }, 3000);

    it("overlappingEntries: an archive failure, and the shared data is never inflated", async () => {
      const f = build("overlappingEntries");
      const { v, ms } = await timed(f);
      expect(ms).toBeLessThan(2000);
      expect(detail(v)).toMatch(/share local data \(501 entries\)/);
      expect(v.invalidReason).toBe("malformed");
    }, 3000);

    it("jsonTooLarge: the file is hashed but not parsed", async () => {
      const v = await run(build("jsonTooLarge"));
      expect(detail(v)).toMatch(/timeline_original\.json too large/);
      expect(v.parsed.timelineOriginal).toBeNull();
      expect(results(v).manifest).toBe("ok");
    });

    const tmpZip = (entries) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostile-"));
      dirs.push(dir);
      const file = path.join(dir, "h.zip");
      fs.writeFileSync(file, writeZip(entries));
      return file;
    };
    const ctx = { sessionId: "a".repeat(32), installationId: INSTALLATION_ID, siteKnown: true, currentConfigVersion: null };

    it("many modest entries above 20x the ZIP size in total: nothing is inflated", async () => {
      // 64 entries of 1 MiB at ~75:1 each, every one under the per-entry guard.
      const blob = Buffer.alloc(1 << 20);
      let seed = 1;
      for (let i = 0; i < blob.length; i += 256) {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        blob[i] = seed >>> 24;
      }
      const file = tmpZip(Array.from({ length: 64 }, (_, i) => ({ name: `pad/${i}.bin`, data: blob })));
      const v = await validateArchive(file, ctx);
      expect(detail(v)).toMatch(/total uncompressed size too large/);
      expect(Object.values(v.parsed).every((p) => p === null)).toBe(true);
    });

    it("JSON files above 16 MiB together are not parsed, even when each is under 4 MiB", async () => {
      const big = Buffer.from(JSON.stringify({ padding: crypto.randomBytes(1_800_000).toString("hex") }));
      const file = tmpZip(["manifest.json", "examination.json", "participant.json", "task_configuration_snapshot.json",
        "timeline_original.json"].map((name) => ({ name, data: big, store: true })));
      const v = await validateArchive(file, ctx);
      expect(detail(v)).toMatch(/JSON files too large together/);
      expect(Object.values(v.parsed).every((p) => p === null)).toBe(true);
    });

    it("an entry named like an Object.prototype key is not treated as a JSON file", async () => {
      const file = tmpZip([{ name: "constructor", data: "not json" }]);
      const v = await validateArchive(file, ctx);
      expect(detail(v)).not.toMatch(/not valid JSON/);
    });
  });

  it("a missing file is an I/O error and does throw", async () => {
    await expect(validateArchive(path.join(os.tmpdir(), "does-not-exist-xyz.zip"), {
      sessionId: "a".repeat(32), installationId: INSTALLATION_ID, siteKnown: true, currentConfigVersion: null,
    })).rejects.toThrow();
  });
});
