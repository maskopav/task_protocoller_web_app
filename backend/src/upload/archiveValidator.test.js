import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { validateArchive } from "./archiveValidator.js";
import { buildSessionZip, VARIANTS, CONFIG_VERSION, INSTALLATION_ID } from "../../test/fixtures/buildSessionZip.js";

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

  it("a missing file is an I/O error and does throw", async () => {
    await expect(validateArchive(path.join(os.tmpdir(), "does-not-exist-xyz.zip"), {
      sessionId: "a".repeat(32), installationId: INSTALLATION_ID, siteKnown: true, currentConfigVersion: null,
    })).rejects.toThrow();
  });
});
