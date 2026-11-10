// The device-log layout of fileStore (docs/device_logs/01_spec.md §3) and its env keys.
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { LocalFileStore } from "./fileStore.js";
import { loadUploadConfig } from "../config/uploads.js";

const SHA = "ab".repeat(32);

describe("deviceLogKey", () => {
  const store = new LocalFileStore(path.join(os.tmpdir(), "x"));

  it("lays files out as device-logs/<device_id>/<sha256>.log.gz", () => {
    expect(store.deviceLogKey(7, SHA)).toBe(`device-logs/7/${SHA}.log.gz`);
    expect(store.resolve(store.deviceLogKey(7, SHA))).toBe(path.join(store.root, "device-logs", "7", `${SHA}.log.gz`));
  });

  it("refuses anything but a positive integer id and 64 lower-case hex", () => {
    for (const bad of [0, -1, 1.5, "7", "../7", null, undefined]) expect(() => store.deviceLogKey(bad, SHA)).toThrow();
    for (const bad of ["", "../x", "AB".repeat(32), SHA.slice(1), `${SHA}/..`]) expect(() => store.deviceLogKey(7, bad)).toThrow();
  });

  it("resolve() rejects keys it did not produce", () => {
    for (const bad of [`device-logs/../x/${SHA}.log.gz`, `device-logs/7/../../${SHA}.log.gz`, `device-logs/07/${SHA}.log.gz`, "device-logs/7/x.log.gz"]) {
      expect(() => store.resolve(bad)).toThrow("invalid storage key");
    }
  });

  it("remove() deletes the file, tolerates a missing one, and drops an emptied folder", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dlk-"));
    try {
      const s = new LocalFileStore(root);
      const key = s.deviceLogKey(3, SHA);
      fs.mkdirSync(path.dirname(s.resolve(key)), { recursive: true });
      fs.writeFileSync(s.resolve(key), "x");
      await s.remove(key);
      expect(fs.existsSync(path.join(root, "device-logs", "3"))).toBe(false);
      await expect(s.remove(key)).resolves.toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("loadUploadConfig device logs", () => {
  it("defaults: 5 MiB per file, 90 days, 2 GiB in total", () => {
    expect(loadUploadConfig({ DATA_PATH: "x" }).deviceLogs).toEqual({ maxBytes: 5242880, retentionDays: 90, totalMaxBytes: 2147483648 });
  });
  it("reads the three env keys", () => {
    const c = loadUploadConfig({ DATA_PATH: "x", DEVICE_LOG_MAX_BYTES: "1000", DEVICE_LOG_RETENTION_DAYS: "7", DEVICE_LOGS_MAX_BYTES: "5000" });
    expect(c.deviceLogs).toEqual({ maxBytes: 1000, retentionDays: 7, totalMaxBytes: 5000 });
  });
});
