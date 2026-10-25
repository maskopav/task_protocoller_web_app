// Golden-file guard for the desktop-facing contract: GET /site-config/:token.
//
// The desktop app consumes this JSON and its format is FROZEN. For every site
// in the seeded test database (artificial_data.sql sites 1-2 + e2e_seed.sql
// sites 3-5) the response is compared, deep-equal, to
// test/fixtures/site-config.golden/<id>-<slug>.json. Key order is irrelevant.
// Status code and content-type are checked as well.
//
// Normalised (volatile) fields, everything else is compared verbatim:
//  - configVersion: derived from the newest updated_at of the site and its
//    protocol rows (YYYY-MM-DD.HHMMSS). The seeds set updated_at to
//    CURRENT_TIMESTAMP, so it changes on every `npm run db:test:reset`.
//    Replaced by "<configVersion>" after asserting it matches the format.
//  - any other string matching the timestamp format of configVersion, or an
//    ISO-8601 timestamp, is replaced too (defensive; see `normalise`).
//
// Needs the disposable DB of backend/.env.test (npm run db:test:reset); the
// suite is skipped when it is unreachable, like the other integration tests.
// Regenerate fixtures with UPDATE_GOLDEN=1 (needs the user's explicit approval,
// see test/fixtures/site-config.golden/README.md).
import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";
import request from "supertest";
import { testDbAvailable } from "../helpers/testDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.resolve(__dirname, "../fixtures/site-config.golden");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

// Fixed tokens from the seeds.
const SITES = [
  { id: 1, slug: "paris", token: "paris000paris000paris000paris000" },
  { id: 2, slug: "london", token: "london00london00london00london00" },
  { id: 3, slug: "e2e-site", token: "e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2" },
  { id: 4, slug: "e2e-clinic-a", token: "e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4" },
  { id: 5, slug: "e2e-clinic-b", token: "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5" },
];

const dbUp = await testDbAvailable();

let app = null;
if (dbUp) {
  // Point the app at the test DB before the pool module is first imported
  // (dotenv in connection.js never overrides variables that are already set).
  const env = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../../.env.test")));
  for (const k of ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "I18N_PATH", "ASSET_BASE_URL"]) {
    process.env[k] = env[k];
  }
  const { getSiteConfig } = await import("../../src/controllers/siteController.js");
  app = express();
  app.get("/site-config/:token", getSiteConfig); // same handler/route as server.js (limiter omitted)
}

afterAll(async () => {
  if (!dbUp) return;
  const { default: pool } = await import("../../src/db/connection.js");
  await pool.end();
});

const VERSION_RE = /^\d{4}-\d{2}-\d{2}\.\d{6}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

function normalise(value) {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "configVersion") {
        if (typeof v !== "string" || !VERSION_RE.test(v)) throw new Error(`configVersion has unexpected format: ${v}`);
        out[k] = "<configVersion>";
      } else out[k] = normalise(v);
    }
    return out;
  }
  if (typeof value === "string" && (VERSION_RE.test(value) || ISO_RE.test(value))) return "<timestamp>";
  return value;
}

const sortKeys = (v) =>
  Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
    : v;

describe.skipIf(!dbUp)("GET /site-config/:token golden files (desktop contract)", () => {
  for (const site of SITES) {
    it(`site ${site.id} (${site.slug})`, async () => {
      const res = await request(app).get(`/site-config/${site.token}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^application\/json; charset=utf-8$/);
      expect(JSON.stringify(res.body)).not.toContain(site.token); // the token is never echoed

      const actual = normalise(res.body);
      const file = path.join(goldenDir, `${site.id}-${site.slug}.json`);
      if (UPDATE) {
        fs.mkdirSync(goldenDir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(sortKeys({
          status: res.status, contentType: res.headers["content-type"], body: actual,
        }), null, 2) + "\n");
      }
      const golden = JSON.parse(fs.readFileSync(file, "utf8"));
      expect(golden.status).toBe(res.status);
      expect(golden.contentType).toBe(res.headers["content-type"]);
      expect(actual).toEqual(golden.body);
    });
  }
});
