import path from 'path';
import { fileURLToPath } from 'url';
import { runSqlFile, runSqlFileInTransaction } from './utils/runSqlFile.js';
import pool from './db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DDL scripts — MySQL cannot roll these back; compensation via teardown below
const teardownPath = path.join(__dirname, '../scripts/schema/drop_tables.sql');
const schemaPath = path.join(__dirname, '../scripts/schema/create_tables.sql');
const viewsPath = path.join(__dirname, '../scripts/schema/create_views.sql');

// DML scripts — genuinely transactional; auto-rolled back on failure
const seedPath = path.join(__dirname, '../scripts/seed/seed_all.sql');
const artificialDataPath = path.join(__dirname, '../scripts/seed/artificial_data.sql');

async function init() {
  let initFailed = false;
  let schemaCreated = false;

  try {
    await runSqlFile(pool, teardownPath);
    console.log('✅ Teardown complete — schema reverted.');
    console.log('Starting Database Initialization...');

    // Step 1 — DDL: Create tables (auto-committed by MySQL; no real rollback)
    console.log('Creating tables...');
    await runSqlFile(pool, schemaPath);
    schemaCreated = true; // only set after success; gates teardown below

    // Step 2 — DDL: Create views
    console.log('Creating database views...');
    await runSqlFile(pool, viewsPath);

    // Step 3 — DML: Seed lookup data (transactional — rolls back automatically)
    console.log('Seeding core database values...');
    await runSqlFileInTransaction(pool, seedPath);

    // Step 4 — DML: Insert artificial test data (transactional)
    console.log('Inserting artificial test data...');
    await runSqlFileInTransaction(pool, artificialDataPath);

    console.log('✅ Database successfully initialized and seeded.');
  } catch (error) {
    initFailed = true;
    console.error('❌ Initialization failed:', error);

    // Compensate for any DDL that was already auto-committed.
    // DML failures are handled by runSqlFileInTransaction's own ROLLBACK,
    // so by the time we reach here, any seed data is already rolled back.
    if (schemaCreated) {
      console.log('Running teardown to clean up partially created schema...');
      try {
        await runSqlFile(pool, teardownPath);
        console.log('✅ Teardown complete — schema reverted.');
      } catch (teardownError) {
        console.error('❌ Teardown also failed — manual cleanup may be required:', teardownError);
      }
    }
  } finally {
    try {
      await pool.end();
      console.log('🔌 Connection closed.');
    } catch (poolError) {
      console.error('❌ Failed to close pool:', poolError);
    }
  }

  if (initFailed) {
    process.exit(1);
  }
}

await init();