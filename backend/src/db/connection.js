// src/db/connection.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import dns from 'dns';
dotenv.config();

dns.setDefaultResultOrder('ipv4first');

const pool = await mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  // Off: runSqlFile.js already splits scripts into single statements, so
  // nothing needs it — and it turns any injection into a stacked-query one.
  multipleStatements: false,
  // Without this, an object in req.body bound to `?` expands to `key` = val:
  // {"token":{"reset_password_token":1}} made the reset lookup match every
  // pending reset. Objects now bind as their string form instead.
  stringifyObjects: true,
  dateStrings: true,
  timezone: 'Z'
});

export default pool;