// src/utils/syncViewConstants.js
import fs from 'fs/promises';
import { SESSION_RESUME_WINDOW_HOURS } from '../config/constants.js';

// Keeps the SESSION_RESUME_WINDOW_HOURS literal baked into create_views.sql
// in sync with its canonical source in config/constants.js. Run this before
// (re)creating the views so editing the constant and re-running the DB
// init/migration scripts is enough — no need to hunt the number down inside
// the SQL file by hand.
export async function syncViewConstants(viewsPath) {
  const raw = await fs.readFile(viewsPath, 'utf-8');
  const pattern = /(INTERVAL )\d+( HOUR\) THEN 'in_progress')/;
  const synced = raw.replace(pattern, `$1${SESSION_RESUME_WINDOW_HOURS}$2`);

  if (synced !== raw) {
    await fs.writeFile(viewsPath, synced, 'utf-8');
    console.log(`Synced SESSION_RESUME_WINDOW_HOURS (${SESSION_RESUME_WINDOW_HOURS}h) into ${viewsPath}`);
  }
}
