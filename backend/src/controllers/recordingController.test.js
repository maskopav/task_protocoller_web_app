import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("../db/connection.js", () => ({ default: {} }));
vi.mock("../utils/logger.js", () => ({ logToFile: vi.fn() }));

// UPLOAD_DIR is read from DATA_PATH when the controller module loads.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "recordings-test-"));
process.env.DATA_PATH = dataDir;
const { saveAudioTimingSidecar } = await import("./recordingController.js");
const { logToFile } = await import("../utils/logger.js");

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe("saveAudioTimingSidecar", () => {
  beforeAll(() => logToFile.mockClear());

  it("stores the segment timing next to the recording", async () => {
    const timing = { format: "audio-timing-v1", sampleRate: 48000, segments: [{ startSample: 0, endSample: 4800 }] };
    const name = await saveAudioTimingSidecar(JSON.stringify(timing), "S1_O1_Cmonologue_R1_D2026", 1);

    expect(name).toBe("S1_O1_Cmonologue_R1_D2026.segments.json");
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"))).toEqual(timing);
  });

  it("does nothing when the upload carries no timing", async () => {
    expect(await saveAudioTimingSidecar(undefined, "S1_none", 1)).toBeNull();
    expect(fs.existsSync(path.join(dataDir, "S1_none.segments.json"))).toBe(false);
  });

  it("skips and logs malformed payloads instead of failing the upload", async () => {
    for (const raw of ["{not json", JSON.stringify({ segments: "nope" }), "x".repeat(1024 * 1024 + 1)]) {
      expect(await saveAudioTimingSidecar(raw, "S1_bad", 1)).toBeNull();
    }
    expect(fs.existsSync(path.join(dataDir, "S1_bad.segments.json"))).toBe(false);
    expect(logToFile).toHaveBeenCalledTimes(3);
    expect(logToFile).toHaveBeenCalledWith("WARN", "Audio timing not saved", expect.objectContaining({ sessionId: 1 }));
  });
});
