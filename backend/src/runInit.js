import path from 'path';
import { fileURLToPath } from 'url';
import { runSqlFile } from './utils/runSqlFile.js';
import pool from './db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.join(__dirname, '../scripts/schema/create_tables.sql');
const viewsPath = path.join(__dirname, '../scripts/schema/create_views.sql');
const seedPath = path.join(__dirname, '../scripts/seed/seed_all.sql');
const artificialDataPath = path.join(__dirname, '../scripts/seed/artificial_data.sql');

(async function init() {
  try {
    console.log('Starting Database Initialization...');

    // 1. Create Tables
    console.log('Creating tables...');
    await runSqlFile(schemaPath);

    // 2. Create Views (if applicable)
    console.log('Creating database views...');
    await runSqlFile(viewsPath);

    // 3. Seed Lookup Data (Languages, Task Types, Tasks)
    console.log('Seeding core database values...');
    await runSqlFile(seedPath);

    // 4. Insert Artificial Data for Testing
    console.log('Inserting artificial test data...');
    await runSqlFile(artificialDataPath);

    console.log('✅ Database successfully initialized and seeded.');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
  } finally {
    await pool.end();
    console.log('🔌 Connection closed.');
  }
})();
