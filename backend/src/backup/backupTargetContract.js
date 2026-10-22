// src/backup/backupTargetContract.js
//
// Reusable vitest suite. Every BackupTarget (directory, memory, and any future
// SFTP/S3/WebDAV class) must pass it:
//
//   runBackupTargetContract("MyTarget", async () => ({ target, cleanup }));
//
// `factory` returns a fresh, empty target and optionally a `cleanup()`.
import { describe, it, expect, afterEach } from "vitest";
import { Readable } from "stream";

const fromString = (s) => Readable.from([Buffer.from(s)]);

// Emits `first`, then fails: models a dump or file read that dies midway.
function failingStream(first) {
  let sent = false;
  return new Readable({
    read() {
      if (!sent) { sent = true; this.push(Buffer.from(first)); }
      else setImmediate(() => this.destroy(new Error("source broke")));
    },
  });
}

export function runBackupTargetContract(name, factory) {
  describe(`BackupTarget contract: ${name}`, () => {
    const cleanups = [];
    const make = async () => {
      const made = await factory();
      if (made.cleanup) cleanups.push(made.cleanup);
      return made.target;
    };
    afterEach(async () => { while (cleanups.length) await cleanups.pop()(); });

    it("puts, lists and removes with byte counts", async () => {
      const t = await make();
      expect(await t.put("a/b.txt", fromString("hello"))).toEqual({ bytes: 5 });
      const items = await t.list();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe("a/b.txt");
      expect(items[0].bytes).toBe(5);
      expect(items[0].modifiedAt).toBeInstanceOf(Date);
      await t.remove("a/b.txt");
      expect(await t.list()).toEqual([]);
    });

    it("overwrites an existing name", async () => {
      const t = await make();
      await t.put("x.bin", fromString("first version"));
      await t.put("x.bin", fromString("v2"));
      const items = await t.list();
      expect(items).toHaveLength(1);
      expect(items[0].bytes).toBe(2);
    });

    it("filters by prefix", async () => {
      const t = await make();
      await t.put("db/1.gz", fromString("1"));
      await t.put("db/2.gz", fromString("22"));
      await t.put("sessions/ab/x.zip", fromString("333"));
      expect((await t.list("db/")).map((i) => i.name)).toEqual(["db/1.gz", "db/2.gz"]);
      expect((await t.list("sessions/")).map((i) => i.name)).toEqual(["sessions/ab/x.zip"]);
      expect(await t.list("nothing/")).toEqual([]);
    });

    it("does not fail when removing an absent name", async () => {
      const t = await make();
      await expect(t.remove("never/existed.txt")).resolves.toBeUndefined();
    });

    it.each(["", "/abs", "a/../b", "..", "a//b", "a b"])("rejects invalid name %j", async (bad) => {
      const t = await make();
      await expect(t.put(bad, fromString("x"))).rejects.toThrow();
      await expect(t.remove(bad)).rejects.toThrow();
    });

    it("is atomic: a failing source leaves nothing under a new name", async () => {
      const t = await make();
      await expect(t.put("new.bin", failingStream("partial"))).rejects.toThrow();
      expect(await t.list()).toEqual([]);
    });

    it("rejects (not crashes) when the source fails before any data", async () => {
      const t = await make();
      const src = new Readable({ read() {} });
      setImmediate(() => src.destroy(new Error("ENOENT")));
      await expect(t.put("early.bin", src)).rejects.toThrow();
      expect(await t.list()).toEqual([]);
    });

    it("is atomic: a failing source keeps the previous content intact", async () => {
      const t = await make();
      await t.put("keep.bin", fromString("original"));
      await expect(t.put("keep.bin", failingStream("partial"))).rejects.toThrow();
      const items = await t.list();
      expect(items.map((i) => [i.name, i.bytes])).toEqual([["keep.bin", 8]]);
    });

    it("stores several MB streamed in chunks", async () => {
      const t = await make();
      const chunk = Buffer.alloc(64 * 1024, 7);
      const count = 96; // 6 MiB
      const src = Readable.from((function* () { for (let i = 0; i < count; i++) yield chunk; })());
      const res = await t.put("big/data.bin", src);
      expect(res.bytes).toBe(chunk.length * count);
      expect((await t.list("big/"))[0].bytes).toBe(chunk.length * count);
    });
  });
}
