// Pure selection rules for the Downloads page (spec §9, downloads.html mockup).

export const MAX_BUNDLE_SESSIONS = 200;
export const MAX_BUNDLE_BYTES = 5 * 1024 ** 3;

/** Why a row can't be ticked: "readOnly" | "validating" | null (selectable). */
export function blockedReason(s) {
  if (!s.canEdit) return "readOnly";
  if (s.status === "validating") return "validating";
  return null;
}

/** "Select all" skips invalid rows; they can still be ticked one by one. */
export const isBulkSelectable = (s) => !blockedReason(s) && s.status !== "invalid";

/** Client-side guard before POST /uploads/download. reason: "tooMany" | "tooLarge" | null. */
export function checkBundleLimits(rows) {
  const count = rows.length;
  const bytes = rows.reduce((a, s) => a + (Number(s.bytes) || 0), 0);
  let reason = null;
  if (count > MAX_BUNDLE_SESSIONS) reason = "tooMany";
  else if (bytes > MAX_BUNDLE_BYTES) reason = "tooLarge";
  return { ok: reason === null, reason, count, bytes };
}

/** Row filter of the page. f: {hideBad, qc, protocol, excludeFlags:Set}. */
export function filterRows(rows, f) {
  return rows.filter((s) => {
    if (f.hideBad && (s.qc === "excluded" || s.status === "invalid")) return false;
    if (f.qc && s.qc !== f.qc) return false;
    if (f.protocol && s.protocol !== f.protocol) return false;
    if ((s.issues || []).some((i) => f.excludeFlags.has(i))) return false;
    return true;
  });
}

export const sessionEnd = (s) => s.endedAt || s.processedAt || s.receivedAt || "";
