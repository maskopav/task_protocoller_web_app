import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { describe, it, expect } from "vitest";
import { MariaDbDumper } from "./MariaDbDumper.js";

// Fake child process. `script(child, calls)` drives it after spawn.
function fakeSpawn(script) {
  const calls = [];
  const spawn = (bin, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    const call = { bin, args, opts, stdin: "", optFile: null };
    const a = args.find((x) => x.startsWith("--defaults-extra-file="));
    const f = a?.split("=")[1];
    if (f && f !== "/dev/stdin" && fs.existsSync(f)) {
      call.optFile = f;
      call.optText = fs.readFileSync(f, "utf8");
      call.optMode = fs.statSync(f).mode & 0o777;
    }
    child.stdin.on("data", (c) => { call.stdin += c; });
    calls.push(call);
    setImmediate(() => script(child, call));
    return child;
  };
  return { spawn, calls };
}

const read = async (stream) => { let s = ""; for await (const c of stream) s += c; return s; };
const base = { database: "tp", user: "backup", password: 'S3cr"et\\word', host: "db", port: 3306 };

describe("MariaDbDumper", () => {
  it("streams stdout, keeps credentials out of argv and removes the option file", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dump-"));
    const { spawn, calls } = fakeSpawn((child) => {
      child.stdout.write("CREATE TABLE a;");
      child.stdout.end();
      child.emit("close", 0, null);
    });
    const d = new MariaDbDumper({ ...base, spawn, tmpDir });
    expect(await read(d.dump())).toBe("CREATE TABLE a;");
    const c = calls[0];
    expect(c.bin).toBe("mariadb-dump");
    expect(c.args[0]).toMatch(/^--defaults-extra-file=/);
    expect(c.args.slice(1)).toEqual(["--single-transaction", "--routines", "--triggers", "tp"]);
    expect(c.args.join(" ")).not.toContain("S3cr");
    expect(c.optText).toContain('password="S3cr\\"et\\\\word"');
    if (process.platform !== "win32") expect(c.optMode).toBe(0o600);
    expect(fs.existsSync(c.optFile)).toBe(false);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("errors the stream on non-zero exit and removes the option file", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dump-"));
    const { spawn } = fakeSpawn((child) => {
      child.stdout.write("partial");
      child.stderr.write("Access denied");
      child.emit("close", 2, null);
    });
    const d = new MariaDbDumper({ ...base, spawn, tmpDir });
    await expect(read(d.dump())).rejects.toThrow(/exit 2.*Access denied/);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("errors the stream on spawn error", async () => {
    const { spawn } = fakeSpawn((child) => child.emit("error", new Error("ENOENT")));
    const d = new MariaDbDumper({ ...base, spawn });
    await expect(read(d.dump())).rejects.toThrow(/could not run mariadb-dump: ENOENT/);
  });

  it("sends credentials via stdin for a wrapped command", async () => {
    const { spawn, calls } = fakeSpawn((child) => {
      child.stdout.end("ok");
      child.emit("close", 0, null);
    });
    const d = new MariaDbDumper({ ...base, cmd: "docker exec -i tp-mariadb mariadb-dump", spawn });
    expect(await read(d.dump())).toBe("ok");
    const c = calls[0];
    expect(c.bin).toBe("docker");
    expect(c.args.slice(0, 4)).toEqual(["exec", "-i", "tp-mariadb", "mariadb-dump"]);
    expect(c.args[4]).toBe("--defaults-extra-file=/dev/stdin");
    expect(c.args.join(" ")).not.toContain("S3cr");
    expect(c.stdin).toContain("[client]");
    expect(c.stdin).toContain("user=\"backup\"");
  });
});
