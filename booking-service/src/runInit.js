// src/runInit.js — creates the booking-service schema. Run once per
// environment: `npm run db:init`. Safe to re-run — it tears down first.
import path from "path";
import { fileURLToPath } from "url";
import { runSqlFile } from "./utils/runSqlFile.js";
import pool from "./db/connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const teardownPath = path.join(__dirname, "../scripts/schema/drop_tables.sql");
const schemaPath = path.join(__dirname, "../scripts/schema/create_tables.sql");

async function init() {
  let initFailed = false;
  try {
    console.log("Tearing down any existing booking-service schema...");
    await runSqlFile(pool, teardownPath);

    console.log("Creating booking-service tables...");
    await runSqlFile(pool, schemaPath);

    console.log("✅ booking-service schema initialized.");
  } catch (error) {
    initFailed = true;
    console.error("❌ Initialization failed:", error);
  } finally {
    await pool.end();
  }

  if (initFailed) process.exit(1);
}

await init();
