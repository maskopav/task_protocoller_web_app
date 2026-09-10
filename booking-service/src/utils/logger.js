// src/utils/logger.js — minimal file logger, same shape as the main app's
// backend/src/utils/logger.js so log entries look familiar, trimmed to what
// this service actually needs (no frontend-log ingestion).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.resolve(__dirname, "../../logs");
const logPath = path.join(logDir, "booking_service_log.txt");

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

export function logToFile(level = "INFO", message, details = null) {
  try {
    const timestamp = new Date().toISOString();
    let entry = `\n[${timestamp}] [${level.toUpperCase()}] ${message}`;
    if (details) {
      const detailsString = typeof details === "object" ? JSON.stringify(details, null, 2) : details;
      entry += `\n  Details:\n${detailsString.split("\n").map((l) => `  ${l}`).join("\n")}`;
    }
    fs.appendFileSync(logPath, `${entry}\n`);
  } catch (err) {
    console.error("booking-service logging failed:", err);
  }
}
