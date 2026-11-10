// src/deviceLogs/purge.js
// Rules: docs/device_logs/01_spec.md §4.
//
// Deletes device logs older than the retention, then the oldest ones while the
// total exceeds the cap. Runs at boot and every 24 h; exported for the tests.
import { executeQuery } from "../db/queryHelper.js";
import { toDbDate } from "../upload/ingestService.js";
import { logToFile } from "../utils/logger.js";

const DAY_MS = 24 * 3600e3;

// The row goes only after its file is gone. A missing file is fine; any other
// failure keeps the row (so the file is not orphaned) and is counted.
async function deleteLog(store, row) {
  try {
    await store.remove(store.deviceLogKey(Number(row.device_id), row.sha256));
  } catch {
    return false;
  }
  await executeQuery(`DELETE FROM device_logs WHERE id = ?`, [row.id]);
  return true;
}

/**
 * @param {{store: import('../storage/fileStore.js').LocalFileStore, retentionDays: number,
 *          totalMaxBytes: number, now?: () => Date}} opts
 * @returns {Promise<{expired: number, overCap: number, failed: number}>}
 */
export async function purgeDeviceLogs({ store, retentionDays, totalMaxBytes, now = () => new Date() }) {
  const counts = { expired: 0, overCap: 0, failed: 0 };
  const tally = async (rows, key) => {
    for (const row of rows) (await deleteLog(store, row)) ? counts[key]++ : counts.failed++;
  };

  // 1. Older than the retention.
  const cutoff = toDbDate(new Date(now().getTime() - retentionDays * DAY_MS));
  await tally(
    await executeQuery(`SELECT id, device_id, sha256 FROM device_logs WHERE received_at < ?`, [cutoff]),
    "expired"
  );

  // 2. Over the total cap: oldest first, by received_at and then id.
  const [{ total }] = await executeQuery(`SELECT COALESCE(SUM(bytes), 0) AS total FROM device_logs`);
  let excess = Number(total) - totalMaxBytes;
  if (excess > 0) {
    const rows = await executeQuery(`SELECT id, device_id, sha256, bytes FROM device_logs ORDER BY received_at, id`);
    const doomed = [];
    for (const row of rows) {
      if (excess <= 0) break;
      doomed.push(row);
      excess -= Number(row.bytes);
    }
    await tally(doomed, "overCap");
  }
  return counts;
}

/**
 * Runs the purge now and every `intervalMs`. Counts only go to system_log.txt
 * (spec §4.4). The timer is unref'd, so it never keeps the process alive.
 * @returns {() => void} stop
 */
export function startDeviceLogPurge({ intervalMs = DAY_MS, ...opts }) {
  const run = () =>
    purgeDeviceLogs(opts)
      .then((c) => {
        if (c.expired + c.overCap + c.failed > 0) logToFile("INFO", "Device log purge", c);
      })
      .catch((err) => logToFile("ERROR", "Device log purge failed", { code: err?.code ?? err?.name ?? "Error" }));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
