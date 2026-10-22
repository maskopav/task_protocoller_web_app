import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";
import zlib from "zlib";

vi.mock("../db/queryHelper.js", () => ({ executeQuery: vi.fn(), executeTransaction: vi.fn() }));

const { createBackupService, utcStamp } = await import("./backupService.js");
const { MemoryBackupTarget } = await import("./MemoryBackupTarget.js");

const ID_A = "aa" + "1".repeat(30);
const ID_B = "bb" + "2".repeat(30);
const ID_C = "cc" + "3".repeat(30);

function setup({ dumper, rows = [], dbKeep = 3, openRead } = {}) {
  const target = new MemoryBackupTarget();
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith("INSERT INTO backup_runs")) return { insertId: 7 };
    if (sql.includes("FROM upload_sessions")) return rows;
    return { affectedRows: 1 };
  });
  const store = {
    openRead: openRead ?? vi.fn((key) => Readable.from([Buffer.from(`zip:${key}`)])),
  };
  let t = Date.UTC(2026, 9, 22, 2, 30, 5);
  const clock = () => new Date(t++ * 1); // distinct but same-second stamps
  const dump = dumper ?? { dump: () => Readable.from([Buffer.from("CREATE TABLE a;")]) };
  const svc = createBackupService({ target, dumper: dump, store, query, clock, dbKeep });
  const runUpdate = () => calls.find((c) => c.sql.startsWith("UPDATE backup_runs"));
  return { svc, target, query, calls, store, runUpdate };
}

describe("utcStamp", () => {
  it("formats UTC yyyymmdd-HHMMss", () => {
    expect(utcStamp(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe("20260102-030405");
  });
});

describe("runDbBackup", () => {
  it("stores a gzip'd dump under db/ and records an ok run", async () => {
    const { svc, target, runUpdate, calls } = setup();
    const res = await svc.runDbBackup();
    expect(res.ok).toBe(true);
    expect(res.artifact).toBe("db/20261022-023005.sql.gz");
    const [obj] = target.objects.values();
    expect(zlib.gunzipSync(obj.data).toString()).toBe("CREATE TABLE a;");
    expect(calls[0].params[0]).toBe("db");
    expect(calls[0].params[2]).toBe("memory");
    const u = runUpdate().params; // [finished, status, artifact, bytes, items, error, id]
    expect(u.slice(1)).toEqual(["ok", "db/20261022-023005.sql.gz", obj.data.length, 1, null, 7]);
  });

  it("keeps only the newest dbKeep dumps and ignores foreign names", async () => {
    const { svc, target } = setup({ dbKeep: 2 });
    for (const n of ["db/20260101-000000.sql.gz", "db/20260102-000000.sql.gz", "db/20260103-000000.sql.gz", "db/notes.txt"]) {
      await target.put(n, Readable.from([Buffer.from("x")]));
    }
    await svc.runDbBackup();
    expect((await target.list("db/")).map((o) => o.name)).toEqual([
      "db/20261022-023005.sql.gz", "db/20260103-000000.sql.gz", "db/notes.txt",
    ].sort());
  });

  it("fails the run, stores nothing and keeps old dumps when the dump errors", async () => {
    const failing = {
      dump: () => {
        const r = new Readable({ read() {} });
        r.push("CREATE");
        setImmediate(() => r.destroy(new Error("mariadb-dump failed (exit 2): denied")));
        return r;
      },
    };
    const { svc, target, runUpdate } = setup({ dumper: failing, dbKeep: 1 });
    await target.put("db/20260101-000000.sql.gz", Readable.from([Buffer.from("old")]));
    const res = await svc.runDbBackup();
    expect(res.ok).toBe(false);
    expect((await target.list()).map((o) => o.name)).toEqual(["db/20260101-000000.sql.gz"]);
    const u = runUpdate().params;
    expect(u[1]).toBe("failed");
    expect(u[5]).toMatch(/exit 2/);
  });
});

describe("runFileBackup", () => {
  const row = (id, n) => ({ id: n, session_id: id, storage_path: `sessions/${id.slice(0, 2)}/${id}.zip` });

  it("selects only unbacked, non-validating sessions", async () => {
    const { svc, calls } = setup();
    await svc.runFileBackup();
    const sel = calls.find((c) => c.sql.includes("FROM upload_sessions")).sql;
    expect(sel).toContain("backed_up_at IS NULL");
    expect(sel).toContain("status <> 'validating'");
  });

  it("copies each zip, marks it backed up and records totals", async () => {
    const { svc, target, calls, runUpdate } = setup({ rows: [row(ID_A, 1), row(ID_B, 2)] });
    const res = await svc.runFileBackup();
    expect(res).toMatchObject({ ok: true, items: 2, failed: 0 });
    expect((await target.list("sessions/")).map((o) => o.name)).toEqual([
      `sessions/aa/${ID_A}.zip`, `sessions/bb/${ID_B}.zip`,
    ]);
    const marks = calls.filter((c) => c.sql.startsWith("UPDATE upload_sessions"));
    expect(marks.map((m) => m.params[1])).toEqual([1, 2]);
    const u = runUpdate().params;
    expect(u[1]).toBe("ok");
    expect(u[3]).toBe(res.bytes);
    expect(u[4]).toBe(2);
  });

  it("continues after one failure, counts it and ends failed", async () => {
    const openRead = vi.fn((key) => {
      if (key.includes(ID_B)) {
        const r = new Readable({ read() {} });
        setImmediate(() => r.destroy(new Error("ENOENT: gone")));
        return r;
      }
      return Readable.from([Buffer.from("zip")]);
    });
    const { svc, calls, runUpdate, target } = setup({ rows: [row(ID_A, 1), row(ID_B, 2), row(ID_C, 3)], openRead });
    const res = await svc.runFileBackup();
    expect(res).toMatchObject({ ok: false, items: 2, failed: 1 });
    const marks = calls.filter((c) => c.sql.startsWith("UPDATE upload_sessions")).map((m) => m.params[1]);
    expect(marks).toEqual([1, 3]);
    expect((await target.list("sessions/")).length).toBe(2);
    const u = runUpdate().params;
    expect(u[1]).toBe("failed");
    expect(u[4]).toBe(2);
    expect(u[5]).toMatch(/1 of 3 sessions failed/);
  });

  it("does not mark a session whose stored size cannot be verified", async () => {
    const { svc, target, calls } = setup({ rows: [row(ID_A, 1)] });
    const realList = target.list.bind(target);
    target.list = async (p) => (await realList(p)).map((o) => ({ ...o, bytes: o.bytes + 1 }));
    const res = await svc.runFileBackup();
    expect(res.ok).toBe(false);
    expect(calls.some((c) => c.sql.startsWith("UPDATE upload_sessions"))).toBe(false);
  });

  it("fails the run when the session query fails", async () => {
    const { svc, query, runUpdate } = setup();
    query.mockImplementation(async (sql) => {
      if (sql.startsWith("INSERT")) return { insertId: 7 };
      if (sql.includes("FROM upload_sessions")) throw new Error("db down");
      return {};
    });
    const res = await svc.runFileBackup();
    expect(res.ok).toBe(false);
    expect(query.mock.calls.find((c) => c[0].startsWith("UPDATE backup_runs"))[1][1]).toBe("failed");
  });
});
