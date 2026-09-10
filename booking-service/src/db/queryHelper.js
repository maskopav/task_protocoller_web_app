// src/db/queryHelper.js
import pool from "./connection.js";

export async function executeQuery(query, params = []) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(query, params);
    return rows;
  } finally {
    conn.release();
  }
}

export async function executeTransaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
