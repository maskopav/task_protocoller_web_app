// Placeholder description that older saves wrote when the description was blank (F-069).
// It is never shown, re-saved or sent to the desktop app.
export const LEGACY_DESCRIPTION = "Auto-created from AdminTaskEditor";

/** True for the legacy placeholder (surrounding whitespace ignored). */
export const isLegacyDescription = (d) => typeof d === "string" && d.trim() === LEGACY_DESCRIPTION;

/** The description to show: null for the placeholder, otherwise unchanged. */
export const cleanDescription = (d) => (isLegacyDescription(d) ? null : d);
