// src/utils/logger.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log folder and file
const logDir = path.resolve(__dirname, "../../logs");
const logPath = path.join(logDir, "backend_log.txt");

// Ensure folder exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Append a message with timestamp
export function logToFile(message, error = null) {
  try {
    let logString = `${new Date().toISOString()} - ${message}`;
    if (error) {
      logString += `\n${error.stack || error}`;
    }
    fs.appendFileSync(logPath, `${logString}\n`);
  } catch (err) {
    console.error("Logging failed:", err);
  }
}
