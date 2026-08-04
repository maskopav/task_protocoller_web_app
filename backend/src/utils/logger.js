// backend/src/utils/logger.js
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

/**
 * Helper to format log entries uniformly for readability
 */
function formatLogEntry(source, level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  let logString = `\n[${timestamp}] [${source}] [${level}] ${message}`;

  // Append metadata (like URL or UserAgent) if provided
  if (metadata.url) logString += `\n  URL: ${metadata.url}`;
  if (metadata.userAgent) logString += `\n  User-Agent: ${metadata.userAgent}`;

  // Append details or extracted error stacks
  if (metadata.details) {
    const detailsString = typeof metadata.details === 'object' 
      ? JSON.stringify(metadata.details, null, 2) 
      : metadata.details;
    
    // Indent details for clean visual separation in the text file
    const indentedDetails = detailsString.split('\n').map(line => `  ${line}`).join('\n');
    logString += `\n  Details:\n${indentedDetails}`;
  }

  return logString;
}

// 1. BACKEND LOGS
export function logToFile(level = 'INFO', message, details = null) {
  try {
    const logString = formatLogEntry('BACKEND', level.toUpperCase(), message, { details });
    fs.appendFileSync(logPath, `${logString}\n`);
  } catch (err) {
    console.error("Backend logging failed:", err);
  }
}

// 2. FRONTEND LOGS
export function logFrontendToFile(payload) {
  try {
    // Destructure the new structured JSON payload from the frontend
    const { level = 'INFO', message, userAgent, url, details } = payload;
    
    const logString = formatLogEntry('FRONTEND', level.toUpperCase(), message, { 
      userAgent, 
      url, 
      details 
    });
    
    fs.appendFileSync(logPath, `${logString}\n`);
  } catch (err) {
    console.error("Frontend logging failed:", err);
  }
}