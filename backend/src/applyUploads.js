// src/applyUploads.js
// Non-destructively applies scripts/schema/create_upload_tables.sql to a
// database that predates phase B. Every statement is CREATE TABLE IF NOT
// EXISTS, so running this twice is a no-op and existing data is untouched.
import path from 'path';
import { fileURLToPath } from 'url';
import { runSqlFile } from './utils/runSqlFile.js';
import pool from './db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadTablesPath = path.join(__dirname, '../scripts/schema/create_upload_tables.sql');

async function applyUploads() {
  try {
    await runSqlFile(pool, uploadTablesPath);
    console.log('✅ Upload tables applied.');
  } catch (error) {
    console.error('❌ Failed to apply upload tables:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await applyUploads();
