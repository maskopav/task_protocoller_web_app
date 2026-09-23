// src/utils/httpErrors.js — shared by adminController.js and publicController.js
// (was copy-pasted identically in both before).
import { logToFile } from "./logger.js";

export function handleError(res, err, fallbackMessage) {
  logToFile("ERROR", fallbackMessage, { error: err.message });
  // `code` is a stable, locale-independent identifier (e.g. "SLOT_ALREADY_BOOKED")
  // that public/i18n.js maps to a translated string — `error` itself is
  // English-only and meant for logs/admins, never shown to a respondent as-is.
  res.status(err.statusCode || 500).json({ error: err.message || fallbackMessage, code: err.code });
}
