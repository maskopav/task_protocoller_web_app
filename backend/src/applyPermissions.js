// src/applyPermissions.js
// Non-destructively applies scripts/schema/alter_permissions.sql, which adds
// the delegated-permission columns to a database that predates them. The
// statements use ADD COLUMN IF NOT EXISTS, so running this twice is a no-op.
// Views are re-applied afterwards because two of them now select the new
// columns.
import path from 'path';
import { fileURLToPath } from 'url';
import { runSqlFile } from './utils/runSqlFile.js';
import { syncViewConstants } from './utils/syncViewConstants.js';
import pool from './db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const alterPath = path.join(__dirname, '../scripts/schema/alter_permissions.sql');
const viewsPath = path.join(__dirname, '../scripts/schema/create_views.sql');

async function applyPermissions() {
  try {
    await runSqlFile(pool, alterPath);
    console.log('✅ Permission columns applied.');
    await syncViewConstants(viewsPath);
    await runSqlFile(pool, viewsPath);
    console.log('✅ Views re-applied.');
  } catch (error) {
    console.error('❌ Failed to apply permission columns:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await applyPermissions();
