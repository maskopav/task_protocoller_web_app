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

// 3. READ LOGS (admin log viewer -- there's no server shell/SSH access for
// most admins, so this is the only way to inspect system_log.txt at all)
//
// Each entry is written with a leading blank line (formatLogEntry's leading
// "\n") and starts with a "[<ISO timestamp>]" tag, so splitting on that
// boundary reconstructs whole entries -- including their multi-line
// URL/User-Agent/Details block -- instead of breaking them apart the way a
// plain line-by-line filter would.
const ENTRY_START = /\n(?=\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\])/;
const ENTRY_TIMESTAMP = /^\[([\d-]+T[\d:.]+Z)\]/;
const MAX_TAIL = 2000;
const DEFAULT_TAIL = 200;

export function readSystemLog({ tail, search, since, until } = {}) {
  if (!fs.existsSync(logPath)) return [];

  const content = fs.readFileSync(logPath, "utf8");
  const entries = content
    .split(ENTRY_START)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const searchLower = search ? search.toLowerCase() : null;

  const filtered = entries.filter((entry) => {
    if (searchLower && !entry.toLowerCase().includes(searchLower)) return false;
    if (since || until) {
      const timestamp = entry.match(ENTRY_TIMESTAMP)?.[1];
      // No parseable timestamp -- exclude rather than guess, once a since/until
      // filter is actually in use.
      if (!timestamp) return false;
      if (since && timestamp < since) return false;
      if (until && timestamp > until) return false;
    }
    return true;
  });

  const limit = Math.min(Math.max(Number(tail) || DEFAULT_TAIL, 1), MAX_TAIL);
  return filtered.slice(-limit);
}