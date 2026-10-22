import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openZip } from "./zipReader.js";
import { buildSessionZip } from "../../test/fixtures/buildSessionZip.js";
import { writeZip } from "../../test/fixtures/zipWriter.js";

const dirs = [];
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "zipreader-")); dirs.push(d); return d; };

async function read(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

describe("openZip", () => {
  it("lists entries in archive order with sizes and the directory flag", async () => {
    const f = buildSessionZip({ variant: "directoryEntry", dir: tmp() });
    const zip = await openZip(f.path);
    try {
      expect(zip.entries.at(-1).name).toBe("manifest.json");
      expect(zip.entries.find((e) => e.name === "clips/").isDirectory).toBe(true);
      const exam = zip.entries.find((e) => e.name === "examination.json");
      expect(exam.isDirectory).toBe(false);
      expect(exam.uncompressedSize).toBeGreaterThan(0);
      expect(exam.compressedSize).toBeGreaterThan(0);
    } finally { zip.close(); }
  });

  it("reports a ../ name instead of rejecting the archive", async () => {
    const f = buildSessionZip({ variant: "zipSlipName", dir: tmp() });
    const zip = await openZip(f.path);
    try {
      expect(zip.entries.map((e) => e.name)).toContain("../evil.txt");
      expect((await read(await zip.openEntry("../evil.txt"))).toString()).toBe("x");
    } finally { zip.close(); }
  });

  it("opens entries by name after the directory has been read, and decodes UTF-8 names", async () => {
    const dir = tmp();
    const file = path.join(dir, "u.zip");
    fs.writeFileSync(file, writeZip([{ name: "clips/příliš.txt", data: "ahoj" }, { name: "b.txt", data: "b" }]));
    const zip = await openZip(file);
    try {
      expect(zip.entries.map((e) => e.name)).toEqual(["clips/příliš.txt", "b.txt"]);
      expect((await read(await zip.openEntry("b.txt"))).toString()).toBe("b");
      expect((await read(await zip.openEntry("clips/příliš.txt"))).toString()).toBe("ahoj");
    } finally { zip.close(); }
  });

  it("serves an inclusive byte range of the inflated entry", async () => {
    const dir = tmp();
    const file = path.join(dir, "r.zip");
    const body = Buffer.from("0123456789".repeat(1000));
    fs.writeFileSync(file, writeZip([{ name: "a.bin", data: body }, { name: "s.bin", data: body, store: true }]));
    const zip = await openZip(file);
    try {
      for (const name of ["a.bin", "s.bin"]) {
        expect((await read(await zip.openEntry(name, { start: 3, end: 12 }))).toString()).toBe("3456789012");
        expect((await read(await zip.openEntry(name, { start: 9995 }))).toString()).toBe("56789");
        expect((await read(await zip.openEntry(name, { start: 0, end: 0 }))).toString()).toBe("0");
      }
    } finally { zip.close(); }
  });

  it("rejects for a file that is not a ZIP", async () => {
    const file = path.join(tmp(), "x.zip");
    fs.writeFileSync(file, "nope");
    await expect(openZip(file)).rejects.toThrow();
  });

  it("rejects when opening an unknown entry", async () => {
    const f = buildSessionZip({ dir: tmp() });
    const zip = await openZip(f.path);
    try { await expect(zip.openEntry("nope.txt")).rejects.toThrow(); } finally { zip.close(); }
  });
});
