import { describe, expect, it } from "vitest";
import {
  compareVersions, computerStatus, generateAccessToken, nameProblem, newestVersion, pickSettings,
  settingsPayload, sortComputers, summariseByClinic,
} from "./clinicLogic";

const dev = (o) => ({ id: 1, installationId: "x", siteId: 4, health: { key: "ok" }, pending: 0, failed: 0, ...o });

describe("computerStatus", () => {
  it("quarantined computers need assignment, whatever else they report", () => {
    expect(computerStatus(dev({ siteId: null, health: { key: "unassigned" } })).key).toBe("unassigned");
    expect(computerStatus(dev({ siteId: null, health: { key: "ok" } })).key).toBe("unassigned");
  });
  it("maps silent, failing, waiting, no uploads and healthy", () => {
    expect(computerStatus(dev({ health: { key: "bad" } })).key).toBe("silent");
    expect(computerStatus(dev({ health: { key: "warn" }, failed: 2 })).key).toBe("failing");
    expect(computerStatus(dev({ health: { key: "warn" }, pending: 2 })).key).toBe("waiting");
    expect(computerStatus(dev({ health: { key: "off" } })).key).toBe("noUploads");
    expect(computerStatus(dev()).key).toBe("healthy");
  });
  it("ignores hidden backlog counts", () => {
    expect(computerStatus(dev({ backlogHidden: true, pending: 0, failed: 0 })).key).toBe("healthy");
  });
});

describe("sorting and grouping", () => {
  it("lists the worst first", () => {
    const list = sortComputers([dev({ id: 1, installationId: "b" }), dev({ id: 2, installationId: "a", health: { key: "bad" } })]);
    expect(list.map((d) => d.id)).toEqual([2, 1]);
  });
  it("counts per clinic with the worst tone and skips unassigned", () => {
    const m = summariseByClinic([dev(), dev({ health: { key: "bad" } }), dev({ siteId: 5 }), dev({ siteId: null })]);
    expect(m.get(4)).toEqual({ count: 2, tone: "bad" });
    expect(m.get(5)).toEqual({ count: 1, tone: "ok" });
    expect(m.size).toBe(2);
  });
});

describe("versions", () => {
  it("compares dotted versions", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.3", "1.3.0")).toBe(0);
  });
  it("finds the newest", () => {
    expect(newestVersion([{ appVersion: "1.3.2" }, { appVersion: "1.4.0" }, {}])).toBe("1.4.0");
    expect(newestVersion([])).toBeNull();
  });
});

describe("token, settings and name", () => {
  it("generates a token the backend accepts", () => {
    expect(generateAccessToken()).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });
  it("validates the mic gain", () => {
    expect(settingsPayload({ ...pickSettings({}), defaultMicGain: "" }).value).not.toHaveProperty("defaultMicGain");
    expect(settingsPayload({ ...pickSettings({}), defaultMicGain: "63" }).value.defaultMicGain).toBe(63);
    expect(settingsPayload({ ...pickSettings({}), defaultMicGain: "101" }).error).toBe("invalidMicGain");
    expect(settingsPayload({ ...pickSettings({}), defaultMicGain: "1.5" }).error).toBe("invalidMicGain");
  });
  it("accepts any name of 1 to 64 characters", () => {
    expect(nameProblem("Olomouc University Hospital")).toBe("ok");
    expect(nameProblem("   ")).toBe("required");
    expect(nameProblem("x".repeat(65))).toBe("tooLong");
    expect(nameProblem("x".repeat(64))).toBe("ok");
  });
});
