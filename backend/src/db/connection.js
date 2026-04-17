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
  multipleStatements: true,
  dateStrings: true,
  timezone: 'Z'
});

export default pool;