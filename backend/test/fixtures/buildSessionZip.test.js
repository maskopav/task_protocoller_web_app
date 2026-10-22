// Guards the fixtures themselves: if a variant stops being broken in exactly
// the way its name says, every test built on it silently loses its meaning.
import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import yauzl from "yauzl";
import { buildSessionZip, VARIANTS, LONG, ALIAS_COUNT } from "./buildSessionZip.js";

const dirs = [];
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

// Reads every entry into memory. Fine for kilobyte-sized fixtures only.
// decodeStrings: false, because yauzl would otherwise refuse "../evil.txt"
// outright, and the zipSlipName test needs to see that entry is there.
// `skip` names entries to list without reading (the overlapping bomb).
async function readAll(file, skip = () => false) {
  const zip = await yauzl.openPromise(file, { lazyEntries: true, decodeStrings: false, autoClose: false });
  const out = new Map();
  try {
    for await (const entry of zip.eachEntry()) {
      if (skip(entry.fileName.toString("utf8"))) {
        out.set(entry.fileName.toString("utf8"), null);
        continue;
      }
      const stream = await zip.openReadStreamPromise(entry);
      const chunks = [];
      for await (const c of stream) chunks.push(c);
      out.set(entry.fileName.toString("utf8"), Buffer.concat(chunks));
    }
  } finally {
    zip.close();
  }
  return out;
}

const build = (variant) => {
  const f = buildSessionZip({ variant });
  dirs.push(path.dirname(f.path));
  return f;
};
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

describe("buildSessionZip", () => {
  it.each(VARIANTS)("%s opens and has the manifest last", async (variant) => {
    const f = build(variant);
    expect(sha(fs.readFileSync(f.path))).toBe(f.sha256);
    const entries = [...(await readAll(f.path, (n) => n.startsWith("pad/alias"))).keys()];
    expect(entries.at(-1)).toBe("manifest.json");
  }, 30_000); // tooManyEntries reads 10 000 entries, slow when the full suite runs in parallel

  it("valid: every entry is listed with a matching hash", async () => {
    const entries = await readAll(build("valid").path);
    const manifest = JSON.parse(entries.get("manifest.json"));
    const listed = manifest.files.map((x) => x.path).sort();
    expect(listed).toEqual([...entries.keys()].filter((n) => n !== "manifest.json").sort());
    for (const { path: p, sha256 } of manifest.files) expect(sha(entries.get(p))).toBe(sha256);
    const exam = JSON.parse(entries.get("examination.json"));
    expect(exam.sessionId).toBe(manifest.sessionId);
    expect(exam.tasks.filter((t) => t.clipFile).length).toBe(3);
  });

  it("noMaster: no master, no WAV clips, null offsets", async () => {
    const entries = await readAll(build("noMaster").path);
    expect([...entries.keys()].some((n) => n.endsWith(".wav"))).toBe(false);
    const tl = JSON.parse(entries.get("timeline_original.json"));
    expect(tl.events.every((e) => e.sampleOffset === null)).toBe(true);
  });

  it("manifestHashMismatch / missingEntry / unlistedEntry break the manifest", async () => {
    const mm = await readAll(build("manifestHashMismatch").path);
    const m1 = JSON.parse(mm.get("manifest.json"));
    expect(m1.files.some((x) => sha(mm.get(x.path)) !== x.sha256)).toBe(true);

    const me = await readAll(build("missingEntry").path);
    expect(JSON.parse(me.get("manifest.json")).files.some((x) => !me.has(x.path))).toBe(true);

    const ue = await readAll(build("unlistedEntry").path);
    const listed = new Set(JSON.parse(ue.get("manifest.json")).files.map((x) => x.path));
    expect([...ue.keys()].some((n) => n !== "manifest.json" && !listed.has(n))).toBe(true);
  });

  it("idMismatch, badJson and zipSlipName are broken as named", async () => {
    const id = build("idMismatch");
    const idEntries = await readAll(id.path);
    expect(JSON.parse(idEntries.get("examination.json")).sessionId).not.toBe(id.sessionId);

    const bad = await readAll(build("badJson").path);
    expect(() => JSON.parse(bad.get("examination.json"))).toThrow();

    const slip = await readAll(build("zipSlipName").path);
    expect(slip.has("../evil.txt")).toBe(true);
  });

  it("highRatio has an entry compressed more than 200:1", async () => {
    const zip = await yauzl.openPromise(build("highRatio").path, { lazyEntries: true, decodeStrings: false });
    let worst = 0;
    for await (const e of zip.eachEntry()) worst = Math.max(worst, e.uncompressedSize / Math.max(e.compressedSize, 1));
    zip.close();
    expect(worst).toBeGreaterThan(200);
  });

  it("valid stays below the ratio guard (WAV fixtures are noise, not silence)", async () => {
    const zip = await yauzl.openPromise(build("valid").path, { lazyEntries: true, decodeStrings: false });
    for await (const e of zip.eachEntry()) {
      expect(e.compressedSize === 0 ? e.uncompressedSize : e.uncompressedSize / e.compressedSize).toBeLessThanOrEqual(200);
    }
    zip.close();
  });

  it("tooManyEntries has more than 10 000 entries and directoryEntry has a directory", async () => {
    const many = await yauzl.openPromise(build("tooManyEntries").path, { lazyEntries: true, decodeStrings: false });
    expect(many.entryCount).toBeGreaterThan(10_000);
    many.close();
    const dir = await readAll(build("directoryEntry").path);
    expect(dir.has("clips/")).toBe(true);
  });

  it("hugeRepetition asks for 1e9 repetitions of 26 tasks, consistently with the manifest", async () => {
    const entries = await readAll(build("hugeRepetition").path);
    const tasks = JSON.parse(entries.get("task_configuration_snapshot.json")).protocols[0].tasks;
    expect(tasks).toHaveLength(29);
    expect(tasks.filter((t) => t.nrepetition === 1e9)).toHaveLength(26);
    const manifest = JSON.parse(entries.get("manifest.json"));
    for (const { path: p, sha256 } of manifest.files) expect(sha(entries.get(p))).toBe(sha256);
  });

  it("overlappingEntries: many central entries share one local header, each under the ratio guard", async () => {
    const f = build("overlappingEntries");
    const zip = await yauzl.openPromise(f.path, { lazyEntries: true, decodeStrings: false });
    const offsets = new Map();
    let declared = 0;
    for await (const e of zip.eachEntry()) {
      const name = e.fileName.toString("utf8");
      if (name.startsWith("pad/")) {
        offsets.set(name, e.relativeOffsetOfLocalHeader);
        declared += e.uncompressedSize;
        expect(e.uncompressedSize / e.compressedSize).toBeLessThan(200);
      }
    }
    zip.close();
    expect(offsets.size).toBe(ALIAS_COUNT + 1);
    expect(new Set(offsets.values()).size).toBe(1);
    expect(declared).toBeGreaterThan(400 * f.bytes); // far above the 20x total cap
  });

  it("jsonTooLarge has a timeline above 4 MiB that still parses", async () => {
    const entries = await readAll(build("jsonTooLarge").path);
    const buf = entries.get("timeline_original.json");
    expect(buf.length).toBeGreaterThan(4 * 1024 * 1024);
    expect(buf.length).toBeLessThan(16 * 1024 * 1024);
    expect(JSON.parse(buf).events.length).toBeGreaterThan(5);
  });

  it("nullTask has null elements in the task list and the event log", async () => {
    const entries = await readAll(build("nullTask").path);
    expect(JSON.parse(entries.get("examination.json")).tasks[0]).toBeNull();
    expect(JSON.parse(entries.get("timeline_original.json")).events).toContain(null);
  });

  it("longStrings exceeds the column lengths, consistently across files", async () => {
    const entries = await readAll(build("longStrings").path);
    const exam = JSON.parse(entries.get("examination.json"));
    expect(exam.protocolName).toHaveLength(300);
    expect(exam.protocolProject).toHaveLength(300);
    expect(exam.configVersion).toHaveLength(100);
    expect(JSON.parse(entries.get("manifest.json")).configVersion).toBe(exam.configVersion);
    expect(JSON.parse(entries.get("task_configuration_snapshot.json")).protocols[0].name).toBe(exam.protocolName);
    const { fields } = JSON.parse(entries.get("participant.json"));
    expect(fields.patient_code).toBe(LONG.patientCode);
    expect(fields.visit_number).toHaveLength(100);
  });
});
