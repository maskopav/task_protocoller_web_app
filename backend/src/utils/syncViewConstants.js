// src/utils/syncViewConstants.js
import fs from 'fs/promises';
import { SESSION_RESUME_WINDOW_HOURS, BOOKING_ELIGIBILITY_DAYS } from '../config/constants.js';

// Keeps constant literals baked into create_views.sql in sync with their
// canonical source in config/constants.js. Run this before (re)creating the
// views so editing a constant and re-running the DB init/migration scripts
// is enough — no need to hunt the number down inside the SQL file by hand.
export async function syncViewConstants(viewsPath) {
  const raw = await fs.readFile(viewsPath, 'utf-8');
  // Global: every `INTERVAL <n> HOUR` in this file represents the same
  // resume window (the protocol_status cutoff and the resumable_until
  // deadline), so all occurrences are kept in sync together. Likewise every
  // `INTERVAL <n> DAY` is the follow-up booking eligibility window
  // (reservation_eligible_at).
  let synced = raw
    .replace(/INTERVAL \d+ HOUR/g, `INTERVAL ${SESSION_RESUME_WINDOW_HOURS} HOUR`)
    .replace(/INTERVAL \d+ DAY/g, `INTERVAL ${BOOKING_ELIGIBILITY_DAYS} DAY`);

  if (synced !== raw) {
    await fs.writeFile(viewsPath, synced, 'utf-8');
    console.log(`Synced SESSION_RESUME_WINDOW_HOURS (${SESSION_RESUME_WINDOW_HOURS}h) and BOOKING_ELIGIBILITY_DAYS (${BOOKING_ELIGIBILITY_DAYS}d) into ${viewsPath}`);
  }
}
