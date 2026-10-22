import fs from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { describe, it, expect } from "vitest";
import { runBackupTargetContract } from "./backupTargetContract.js";
import { MemoryBackupTarget } from "./MemoryBackupTarget.js";
import { DirectoryBackupTarget } from "./DirectoryBackupTarget.js";
import { createBackupTarget } from "./targetFactory.js";

runBackupTargetContract("MemoryBackupTarget", async () => ({ target: new MemoryBackupTarget() }));

runBackupTargetContract("DirectoryBackupTarget", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bk-"));
  return {
    target: new DirectoryBackupTarget(path.join(dir, "root")), // root is created on demand
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
});

describe("DirectoryBackupTarget specifics", () => {
  it("hides .part files from list and describes itself", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bk-"));
    try {
      const t = new DirectoryBackupTarget(dir);
      await fs.mkdir(path.join(dir, "db"));
      await fs.writeFile(path.join(dir, "db", "x.sql.gz.part"), "half");
      await t.put("db/y.sql.gz", Readable.from([Buffer.from("ok")]));
      expect((await t.list()).map((i) => i.name)).toEqual(["db/y.sql.gz"]);
      expect(t.describe()).toBe(`dir:${path.resolve(dir)}`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("createBackupTarget", () => {
  it("parses dir:", () => {
    const t = createBackupTarget("dir:/mnt/backup");
    expect(t).toBeInstanceOf(DirectoryBackupTarget);
    expect(t.describe()).toBe(`dir:${path.resolve("/mnt/backup")}`);
  });
  it.each(["sftp://host/x", "nonsense", "", undefined, "dir:"])("rejects %j", (spec) => {
    expect(() => createBackupTarget(spec)).toThrow(/BACKUP_TARGET/);
  });
  it("names the unknown scheme", () => {
    expect(() => createBackupTarget("s3:bucket")).toThrow(/scheme 's3'/);
  });
});
