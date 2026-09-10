// src/db/connection.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import dns from "dns";
dotenv.config();

dns.setDefaultResultOrder("ipv4first");

// BOOKING_DB_NAME, not DB_NAME, is checked first: when this service runs
// mounted inside a host app's own process (see src/app.js's "Running
// mounted" note), both apps' dotenv.config() calls write into the same
// process.env, and DB_HOST/DB_USER/DB_PASSWORD are meant to collide (same
// MySQL server, shared credentials, by design) — but DB_NAME must not,
// since it names two different databases. Standalone use is unaffected:
// booking-service/.env only ever sets DB_NAME, so the fallback applies.
const pool = await mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.BOOKING_DB_NAME || process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
  multipleStatements: true,
  dateStrings: true,
  timezone: "Z",
});

export default pool;
