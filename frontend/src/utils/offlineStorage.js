// src/utils/offlineStorage.js

const DB_NAME = 'task_protocoller_offline';
const DB_VER  = 1;          // No schema change — we only add fields to records, not the store
const STORE   = 'pending_recordings';

// Recordings older than this are automatically purged on startup,
// regardless of upload status. 48 h is long enough for any realistic scenario.
const TTL_MS = 48 * 60 * 60 * 1000;

// ─── DB OPEN ─────────────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ─── WRITE ───────────────────────────────────────────────────────────────────

/**
 * Persist a recording blob + its full upload metadata to IndexedDB.
 *
 * ALWAYS call this BEFORE the network upload attempt.
 * The blob + metadata together are everything needed to retry the upload later.
 *
 * id convention: `${sessionId}_task${taskIndex}` — unique per task per session.
 *
 * Storage quota is checked non-blocking; if the device is near full a warning
 * is logged but the save is still attempted.
 */
export async function saveRecordingLocally(id, blob, metadata) {
  // Non-blocking quota check — never delay the save
  checkStorageQuota()
    .then(({ available, usagePercent }) => {
      if (!available) {
        console.warn(
          `[IDB] Device storage is ${usagePercent.toFixed(1)}% full. ` +
          `Recording may fail to save. Consider asking the participant to free space.`
        );
      }
    })
    .catch(() => {}); // quota API is optional — never throw

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      id,
      blob,
      metadata,
      savedAt: Date.now(),
      status: 'pending',  // 'pending' | 'uploaded'
    });
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Mark a record's lifecycle status.
 *
 * The correct two-step deletion sequence is:
 *   1. markRecordingStatus(id, 'uploaded')   ← do this first
 *   2. deleteLocalRecording(id)              ← then this
 *
 * Why two steps? If the process is interrupted between upload success and
 * the IDB delete (e.g. phone dies), the record is stuck as 'uploaded'.
 * cleanupExpiredAndUploaded() on next app open will catch and remove it.
 * If we deleted first and then crashed, we'd have no safety net.
 */
export async function markRecordingStatus(id, status) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx   = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req   = store.get(id);
    req.onsuccess = () => {
      const record = req.result;
      if (record) {
        store.put({ ...record, status });
      }
      resolve(); // idempotent — resolves even if record is already gone
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── READ ────────────────────────────────────────────────────────────────────

/**
 * Return all pending (not yet uploaded) recordings for a session,
 * sorted ascending by taskIndex so callers can flush them in order.
 *
 * Records missing a `status` field are treated as 'pending' for
 * backwards-compatibility with the previous version of this module.
 */
export async function getPendingRecordingsForSession(sessionId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const results = [];
    const tx = db.transaction(STORE, 'readonly');
    tx.objectStore(STORE).openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const r = cursor.value;
        const isPending = r.status === 'pending' || !r.status; // backwards-compat guard
        if (r.metadata?.sessionId === sessionId && isPending) {
          results.push(r);
        }
        cursor.continue();
      } else {
        results.sort(
          (a, b) => (a.metadata?.taskIndex ?? 9999) - (b.metadata?.taskIndex ?? 9999)
        );
        resolve(results);
      }
    };
    tx.onerror = () => reject(tx.error);
  });
}

// Kept for any existing callers in ParticipantInterfacePage.jsx
export { getPendingRecordingsForSession as getPendingRecordings };

// ─── DELETE ──────────────────────────────────────────────────────────────────

/**
 * Hard-delete a record from IDB.
 * Call markRecordingStatus(id, 'uploaded') BEFORE this — see the note above.
 */
export async function deleteLocalRecording(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

// ─── STARTUP CLEANUP ─────────────────────────────────────────────────────────

/**
 * Call once on every app startup (in ParticipantInterfaceLoader useEffect).
 *
 * Deletes:
 *  • Records with status 'uploaded' — a previous deleteLocalRecording() failed
 *    mid-session (phone died, tab force-closed). These are safe to remove
 *    because the upload already succeeded.
 *  • Records older than TTL_MS — orphaned data from abandoned sessions that
 *    will never be resumed (outside the 12-hour session window anyway).
 *
 * Returns the number of records removed. Never throws.
 */
export async function cleanupExpiredAndUploaded() {
  try {
    const db      = await openDB();
    const cutoff  = Date.now() - TTL_MS;
    const toDelete = [];

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.objectStore(STORE).openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const r = cursor.value;
          if (r.status === 'uploaded' || r.savedAt < cutoff) {
            toDelete.push(r.id);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      tx.onerror = () => reject(tx.error);
    });

    if (toDelete.length === 0) return 0;

    await new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      toDelete.forEach(id => store.delete(id));
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });

    console.log(`[IDB] Startup cleanup removed ${toDelete.length} record(s).`);
    return toDelete.length;

  } catch (err) {
    console.warn('[IDB] Startup cleanup failed (non-fatal):', err);
    return 0;
  }
}

// ─── QUOTA ───────────────────────────────────────────────────────────────────

/**
 * Estimate available browser storage.
 *
 * Typical values on smartphones:
 *   - Chrome Android / Safari iOS (normal): 500 MB – several GB
 *   - Safari iOS Private Browsing:           ~50 MB cap
 *
 * This is called non-blocking inside saveRecordingLocally.
 * You do NOT need to call it manually anywhere.
 *
 * If you want to show a storage warning in the UI, call it explicitly and
 * check `available` (false when usage > 85% of quota).
 */
export async function checkStorageQuota() {
  if (!navigator.storage?.estimate) {
    return { available: true, usagePercent: 0, usage: 0, quota: 0 };
  }
  try {
    const { usage, quota } = await navigator.storage.estimate();
    const usagePercent = quota > 0 ? (usage / quota) * 100 : 0;
    return { available: usagePercent < 85, usagePercent, usage, quota };
  } catch {
    return { available: true, usagePercent: 0, usage: 0, quota: 0 };
  }
}