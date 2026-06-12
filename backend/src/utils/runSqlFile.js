// src/utils/runSqlFile.js
import fs from 'fs/promises';

/**
 * Parses a SQL file into individual executable statements.
 *
 * @param {string} sql - Raw SQL file contents.
 * @returns {string[]} Array of non-empty SQL statements.
 */
function parseSqlStatements(sql) {
  return sql
    .replace(/--[^\n]*/g, '')         // strip -- comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip /* */ block comments
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Runs a SQL file WITHOUT a transaction.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} filePath - Absolute path to the .sql file.
 */
export async function runSqlFile(pool, filePath) {
  let connection;
  try {
    const sql = await fs.readFile(filePath, 'utf-8');
    const statements = parseSqlStatements(sql);
    console.log(`Executing script: ${filePath}...`);

    connection = await pool.getConnection();
    for (const statement of statements) {
      await connection.query(statement);
    }

    console.log('✔ Successfully executed SQL script');
  } catch (err) {
    console.error('❌ Error executing SQL file:', filePath);
    console.error(err);
    throw err; 
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Runs a SQL file INSIDE a database transaction.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} filePath - Absolute path to the .sql file.
 */
export async function runSqlFileInTransaction(pool, filePath) {
  let connection;
  try {
    const sql = await fs.readFile(filePath, 'utf-8');
    const statements = parseSqlStatements(sql);
    console.log(`Executing script (transactional): ${filePath}...`);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    for (const statement of statements) {
      await connection.query(statement);
    }

    await connection.commit();
    console.log('✔ Successfully executed SQL script');
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('❌ Error executing SQL file (rolled back):', filePath);
    console.error(err);
    throw err; // re-throw so runInit.js can handle it
  } finally {
    if (connection) connection.release();
  }
}