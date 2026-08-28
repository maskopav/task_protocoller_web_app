// src/applyViews.js
// Non-destructively (re)applies backend/scripts/schema/create_views.sql —
// CREATE OR REPLACE VIEW never touches table data, unlike runInit.js which
// drops and recreates the whole schema. Use this after changing a view
// definition (or a constant it depends on, e.g. SESSION_RESUME_WINDOW_HOURS
// in src/config/constants.js) against a database you want to keep.
import path from 'path';
import { fileURLToPath } from 'url';
import { runSqlFile } from './utils/runSqlFile.js';
import { syncViewConstants } from './utils/syncViewConstants.js';
import pool from './db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsPath = path.join(__dirname, '../scripts/schema/create_views.sql');

async function applyViews() {
  try {
    await syncViewConstants(viewsPath);
    await runSqlFile(pool, viewsPath);
    console.log('✅ Views re-applied.');
  } catch (error) {
    console.error('❌ Failed to apply views:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await applyViews();
