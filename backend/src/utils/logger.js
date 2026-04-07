// src/utils/logger.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log folder and file
const logDir = path.resolve(__dirname, "../../logs");
const logPath = path.join(logDir, "system_log.txt");

// Ensure folder exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 1. BACKEND LOGS
export function logToFile(message, error = null) {
  try {
    let logString = `${new Date().toISOString()} - [BACKEND] - ${message}`;
    if (error) {
      logString += `\n${error.stack || error}`;
    }
    fs.appendFileSync(logPath, `${logString}\n`);
  } catch (err) {
    console.error("Logging failed:", err);
  }
}

// 2. FRONTEND LOGS
export function logFrontendToFile(message, details = null) {
  try {
    let logString = `${new Date().toISOString()} - [FRONTEND] - ${message}`;
    if (details) {
      const detailsString = typeof details === 'object' ? JSON.stringify(details, null, 2) : details;
      logString += `\nDetails:\n${detailsString}`;
    }
    fs.appendFileSync(logPath, `${logString}\n`);
  } catch (err) {
    console.error("Frontend logging failed:", err);
  }
}