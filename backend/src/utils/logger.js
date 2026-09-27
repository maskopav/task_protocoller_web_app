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

// Frontend payloads come from an unauthenticated endpoint. Single-line fields
// are flattened so a crafted value cannot forge extra log entries, and every
// field is truncated.
const FRONTEND_LEVELS = new Set(['INFO', 'WARN', 'ERROR', 'FATAL']);
const oneLine = (v, max) => String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, max);

// 2. FRONTEND LOGS
export function logFrontendToFile(payload) {
  try {
    const { level, message, userAgent, url, details } = payload;
    const lvl = String(level ?? '').toUpperCase();

    let detailsString = details == null ? null
      : typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details);
    if (detailsString && detailsString.length > 4000) {
      detailsString = `${detailsString.slice(0, 4000)}\n…[truncated]`;
    }

    const logString = formatLogEntry('FRONTEND', FRONTEND_LEVELS.has(lvl) ? lvl : 'INFO', oneLine(message, 500), {
      userAgent: userAgent && oneLine(userAgent, 300),
      url: url && oneLine(url, 500),
      details: detailsString
    });
    
    fs.appendFileSync(logPath, `${logString}\n`);
  } catch (err) {
    console.error("Frontend logging failed:", err);
  }
}