// src/utils/httpErrors.js — shared by adminController.js and publicController.js
// (was copy-pasted identically in both before).
import { logToFile } from "./logger.js";

export function handleError(res, err, fallbackMessage) {
  logToFile("ERROR", fallbackMessage, { error: err.message });
  res.status(err.statusCode || 500).json({ error: err.message || fallbackMessage });
}
