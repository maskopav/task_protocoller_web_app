import { describe, it, expect, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { requireHttps } from "./requireHttps.js";

function call(req) {
  const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
  const next = vi.fn();
  requireHttps({ headers: {}, protocol: "http", socket: { remoteAddress: "10.0.0.5" }, ...req }, res, next);
  return { res, next };
}

describe("requireHttps (docs/mcp/01_spec.md D12)", () => {
  afterEach(() => { delete process.env.MCP_ALLOW_HTTP; });

  it("refuses plain HTTP from another host", () => {
    const { res, next } = call({});
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "https_required" });
  });

  it("accepts HTTPS", () => {
    expect(call({ protocol: "https" }).next).toHaveBeenCalled();
  });

  it("accepts a direct loopback client, but not a proxied one", () => {
    for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      expect(call({ socket: { remoteAddress: a } }).next).toHaveBeenCalled();
    }
    expect(call({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "8.8.8.8" } }).next).not.toHaveBeenCalled();
    expect(call({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-proto": "http" } }).next).not.toHaveBeenCalled();
  });

  it("MCP_ALLOW_HTTP=true opts out", () => {
    process.env.MCP_ALLOW_HTTP = "true";
    expect(call({}).next).toHaveBeenCalled();
  });

  it("reads X-Forwarded-Proto from the trusted proxy (as behind nginx)", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.post("/mcp", requireHttps, (req, res) => res.json({ ok: true }));
    const via = (proto) => request(app).post("/mcp").set({ "X-Forwarded-For": "8.8.8.8", "X-Forwarded-Proto": proto });
    expect((await via("https")).status).toBe(200);
    expect((await via("http")).status).toBe(403);
  });
});
