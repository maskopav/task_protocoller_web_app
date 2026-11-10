import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

vi.mock("../db/queryHelper.js", () => ({ executeQuery: vi.fn() }));
vi.mock("../utils/logger.js", () => ({ logToFile: vi.fn() }));

const { executeQuery } = await import("../db/queryHelper.js");
const { logToFile } = await import("../utils/logger.js");
const { startDeviceLogPurge } = await import("./purge.js");

const DAY = 24 * 3600e3;
const store = { remove: vi.fn(), deviceLogKey: vi.fn() };

beforeEach(() => {
  vi.useFakeTimers();
  // nothing expired, total 0: the purge only reads
  executeQuery.mockImplementation(async (sql) => (sql.includes("SUM(bytes)") ? [{ total: 0 }] : []));
});
afterEach(() => vi.useRealTimers());

describe("startDeviceLogPurge", () => {
  it("runs at boot and then every 24 h, until stopped", async () => {
    const stop = startDeviceLogPurge({ store, retentionDays: 90, totalMaxBytes: 1 });
    await vi.advanceTimersByTimeAsync(0);
    const runs = () => executeQuery.mock.calls.filter(([sql]) => sql.includes("received_at <")).length;
    expect(runs()).toBe(1);
    await vi.advanceTimersByTimeAsync(DAY - 1000);
    expect(runs()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs()).toBe(2);
    await vi.advanceTimersByTimeAsync(DAY);
    expect(runs()).toBe(3);
    stop();
    await vi.advanceTimersByTimeAsync(3 * DAY);
    expect(runs()).toBe(3);
  });

  it("its timer is unref'd, so it never keeps the process (or a test run) alive", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const stop = startDeviceLogPurge({ store, retentionDays: 90, totalMaxBytes: 1 });
    const timer = spy.mock.results[0].value;
    expect(timer.hasRef()).toBe(false);
    stop();
    spy.mockRestore();
  });

  it("a failing run is logged by code and does not stop the schedule", async () => {
    executeQuery.mockRejectedValue(Object.assign(new Error("secret detail"), { code: "ECONNREFUSED" }));
    const stop = startDeviceLogPurge({ store, retentionDays: 90, totalMaxBytes: 1 });
    await vi.advanceTimersByTimeAsync(DAY);
    expect(logToFile).toHaveBeenCalledWith("ERROR", "Device log purge failed", { code: "ECONNREFUSED" });
    expect(logToFile).toHaveBeenCalledTimes(2);
    stop();
  });

  it("logs counts only, and only when something was removed", async () => {
    let first = true;
    executeQuery.mockImplementation(async (sql) => {
      if (sql.includes("received_at <") && first) { first = false; return [{ id: 1, device_id: 2, sha256: "a".repeat(64) }]; }
      if (sql.includes("SUM(bytes)")) return [{ total: 0 }];
      return [];
    });
    store.deviceLogKey.mockReturnValue("k");
    store.remove.mockResolvedValue();
    const stop = startDeviceLogPurge({ store, retentionDays: 90, totalMaxBytes: 1 });
    await vi.advanceTimersByTimeAsync(DAY);
    expect(logToFile.mock.calls).toEqual([["INFO", "Device log purge", { expired: 1, overCap: 0, failed: 0 }]]);
    stop();
  });
});

describe("backups (spec D6)", () => {
  it("no backup source mentions device logs: the file backup is driven by upload_sessions rows", () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../backup");
    const sources = fs.readdirSync(dir).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"));
    expect(sources.length).toBeGreaterThan(0);
    for (const f of sources) {
      expect(fs.readFileSync(path.join(dir, f), "utf8")).not.toMatch(/device[-_]?logs?/i);
    }
  });
});
