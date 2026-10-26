// src/db/queryHelper.js
import pool from './connection.js';

export async function executeQuery(query, params = []) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(query, params);
    return rows;
  } finally {
    conn.release();
  }
}

// Lock conflicts a fresh attempt can get past. ER_CHECKREAD is MariaDB 11.8's
// snapshot isolation refusing a row another transaction changed meanwhile.
export const TRANSIENT_TX_CODES = new Set(["ER_LOCK_DEADLOCK", "ER_CHECKREAD"]);

/**
 * Runs callback(conn) in a transaction. With `retries`, a transient lock
 * conflict reruns the whole callback, so it must have no side effects outside
 * the database.
 */
export async function executeTransaction(callback, { retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await callback(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      if (attempt < retries && TRANSIENT_TX_CODES.has(err?.code)) continue;
      throw err;
    } finally {
      conn.release();
    }
  }
}
