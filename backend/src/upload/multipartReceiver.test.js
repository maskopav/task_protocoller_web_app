import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";

vi.mock("../db/queryHelper.js", () => ({ executeQuery: vi.fn(), executeTransaction: vi.fn() }));
vi.mock("../utils/logger.js", () => ({ logToFile: vi.fn(), logFrontendToFile: vi.fn() }));

const { createUploadRouter } = await import("../routes/upload.js");
const { LocalFileStore } = await import("../storage/fileStore.js");
const { ensureDataPath } = await import("../config/uploads.js");

let dataPath, app;
beforeAll(() => {
  dataPath = fs.mkdtempSync(path.join(os.tmpdir(), "mp-recv-"));
  ensureDataPath(dataPath);
  app = express();
  app.use("/upload", createUploadRouter({ store: new LocalFileStore(dataPath), queue: { enqueue() {} }, maxBytes: 1 << 20 }));
});
afterAll(() => fs.rmSync(dataPath, { recursive: true, force: true }));

describe("receiver: server-side filesystem failures", () => {
  it("/upload answers 500 internal, not 400, when the tmp folder cannot be created, and leaves no tmp file", async () => {
    const real = fsp.mkdir.bind(fsp);
    const spy = vi.spyOn(fsp, "mkdir").mockImplementation((p, o) =>
      String(p).endsWith("tmp") ? Promise.reject(Object.assign(new Error("EROFS"), { code: "EROFS" })) : real(p, o));
    try {
      const res = await request(app).post("/upload")
        .field("installationId", "dev-1").field("sessionId", "a".repeat(32)).field("zipSha256", "0".repeat(64))
        .attach("zip", Buffer.from("PK"), "x.zip");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "internal" });
    } finally {
      spy.mockRestore();
    }
    expect(fs.readdirSync(path.join(dataPath, "tmp"))).toEqual([]);
  });

  it("a malformed request is still 400", async () => {
    const res = await request(app).post("/upload").field("installationId", "bad id!").attach("zip", Buffer.from("PK"), "x.zip");
    expect(res.status).toBe(400);
  });
});
