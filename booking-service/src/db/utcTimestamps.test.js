// src/db/utcTimestamps.test.js
//
// Every stored timestamp must be UTC. The MySQL session runs in the server's
// local zone (e.g. Europe/Prague), so CURRENT_TIMESTAMP / NOW() give *local*
// time (slots.starts_at/ends_at are naive local wall-clock time by design,
// but have no default and are always given explicitly). Two guards:
//  1. the schema's column defaults are UTC_TIMESTAMP(), never local time;
//  2. INSERTs still set those columns explicitly -- a database that hasn't
//     had scripts/utils/utc_timestamp_defaults.sql run yet still has the old
//     local-time defaults, so the code must not depend on them.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, "..");
const SCHEMA = path.resolve(__dirname, "../../scripts/schema/create_tables.sql");

// { tableName: [timestamp/datetime columns that have a "now" default] }
function defaultTimestampColumns(sql) {
  const result = {};
  const tableRe = /CREATE TABLE `?(\w+)`?\s*\(([\s\S]*?)\n\)/gi;
  const nowDefault = /`(\w+)`\s+(?:timestamp|datetime)\b[^\n]*DEFAULT\s+\(?\s*(?:UTC_TIMESTAMP|CURRENT_TIMESTAMP|NOW)\b/gi;
  for (const [, table, body] of sql.matchAll(tableRe)) {
    const cols = [...body.matchAll(nowDefault)].map((m) => m[1]);
    if (cols.length) result[table] = cols;
  }
  return result;
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.js$/.test(entry.name) && !/\.test\.js$/.test(entry.name) ? [full] : [];
  });
}

// Every INSERT into a table, with its column list (null when it has none).
function inserts(code) {
  const re = /INSERT\s+(?:IGNORE\s+)?INTO\s+`?(\w+)`?\s*(\(([^)]*)\))?/gi;
  return [...code.matchAll(re)].map((m) => ({
    table: m[1],
    columns: m[3] ? m[3].split(",").map((c) => c.trim().replace(/`/g, "")) : null,
  }));
}

describe("UTC timestamps", () => {
  const schema = fs.readFileSync(SCHEMA, "utf8");
  const defaults = defaultTimestampColumns(schema);

  it("schema defaults are UTC_TIMESTAMP(), never local CURRENT_TIMESTAMP/NOW()", () => {
    const local = schema.split("\n").filter((line) => /DEFAULT\s+\(?\s*(CURRENT_TIMESTAMP|NOW\s*\()/i.test(line));
    expect(local).toEqual([]);
  });

  it("finds the timestamp columns with a 'now' default in the schema", () => {
    // Sanity check that the schema parse works at all -- otherwise the test
    // below would pass vacuously.
    expect(defaults.bookings).toContain("created_at");
    expect(defaults.slots).toContain("created_at");
  });

  it("no INSERT relies on a timestamp column default", () => {
    const problems = [];
    for (const file of sourceFiles(SRC_DIR)) {
      for (const { table, columns } of inserts(fs.readFileSync(file, "utf8"))) {
        const required = defaults[table];
        if (!required) continue;
        const missing = columns ? required.filter((c) => !columns.includes(c)) : required;
        if (missing.length) {
          problems.push(`${path.relative(SRC_DIR, file)}: INSERT INTO ${table} omits ${missing.join(", ")} -- set it to UTC_TIMESTAMP()`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
