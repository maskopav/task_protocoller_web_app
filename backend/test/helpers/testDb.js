// test/helpers/testDb.js
//
// Real-database helper for integration tests. It reads backend/.env.test (the
// disposable E2E database, never the dev one) and gives each test a connection
// inside a transaction that is always rolled back, so tests can insert freely
// without leaving anything behind or depending on each other.
//
// When the database is unreachable the suites skip instead of failing, so
// unit tests still run on a machine without the MariaDB container.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env.test");

let pool = null;
let available = null;

export async function testDbAvailable() {
  if (available !== null) return available;
  if (!fs.existsSync(envPath)) return (available = false);
  const env = dotenv.parse(fs.readFileSync(envPath));
  pool = mysql.createPool({
    host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
    connectionLimit: 2, charset: "utf8mb4", stringifyObjects: true, dateStrings: true, timezone: "Z",
  });
  try {
    await pool.query("SELECT 1 FROM upload_sessions LIMIT 1");
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export async function withRollback(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const q = async (sql, params = []) => (await conn.query(sql, params))[0];
    return await fn(q);
  } finally {
    await conn.rollback();
    conn.release();
  }
}

export async function closeTestDb() {
  if (pool) await pool.end();
  pool = null;
  available = null;
}
