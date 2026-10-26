// Pure rules of the bulk download (absorbed from the old Downloads page).
// POST /uploads/download takes at most 200 sessions and 5 GB; the server enforces
// both, the page checks first so a refusal never reaches the browser as raw JSON.

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

/**
 * What the Download button acts on: the ticked rows, or (nothing ticked) every
 * downloadable row of the current filter.
 * @param {Array<object>} selected ticked rows
 * @returns {{mode: "selection"|"filter", ids: string[]}} ids is empty in filter mode (resolved by paging).
 */
export function downloadTarget(selected) {
  const rows = selected.filter((s) => !blockedReason(s));
  return rows.length ? { mode: "selection", ids: rows.map((s) => s.id) } : { mode: "filter", ids: [] };
}

/** Rows of a filter that "Download all" includes (read-only, validating and invalid ones are left out). */
export const downloadableFromFilter = (rows) => rows.filter(isBulkSelectable);
