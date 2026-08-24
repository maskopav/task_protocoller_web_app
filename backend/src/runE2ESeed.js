import path from 'path';
import { fileURLToPath } from 'url';
import { runSqlFileInTransaction } from './utils/runSqlFile.js';
import pool from './db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedPath = path.join(__dirname, '../scripts/seed/e2e_participant_seed.sql');

async function seed() {
  try {
    await runSqlFileInTransaction(pool, seedPath);
    console.log('✅ E2E participant seed applied.');
  } catch (error) {
    console.error('❌ E2E seed failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await seed();
