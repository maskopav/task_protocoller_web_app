// src/utils/runSqlFile.js
import fs from "fs/promises";

function parseSqlStatements(sql) {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function runSqlFile(pool, filePath) {
  let connection;
  try {
    const sql = await fs.readFile(filePath, "utf-8");
    const statements = parseSqlStatements(sql);
    console.log(`Executing script: ${filePath}...`);

    connection = await pool.getConnection();
    for (const statement of statements) {
      await connection.query(statement);
    }

    console.log("✔ Successfully executed SQL script");
  } catch (err) {
    console.error("❌ Error executing SQL file:", filePath);
    console.error(err);
    throw err;
  } finally {
    if (connection) connection.release();
  }
}
