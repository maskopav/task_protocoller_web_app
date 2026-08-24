// backend/scripts/schema/compareSchemas.js
//
// Dumps the live schema (tables + views, no data) from two databases via
// `mysqldump` and reports any structural difference between them: tables
// or views that exist in one but not the other, and tables/views whose
// definition (columns, types, keys, defaults, engine, view SELECT, ...)
// differs.
//
// This compares what's ACTUALLY in each database right now — not what
// scripts/schema/create_tables.sql says it should be. That's deliberate:
// it's the only way to catch drift introduced by manual ALTER TABLEs run
// directly against a database (e.g. production) outside the SQL scripts.
//
// Usage:
//   node scripts/schema/compareSchemas.js <envFileA> <envFileB>
//
// Example (safe, both local):
//   node scripts/schema/compareSchemas.js .env .env.test
//
// Example (dev vs production — see README note on credentials below):
//   node scripts/schema/compareSchemas.js .env .env.production
//
// IMPORTANT: never point this at production using the app's read/write
// credentials from a laptop. Create a dedicated read-only MySQL user for
// production (GRANT SELECT ON <db>.* — schema dumping needs SELECT, not
// data access, but SHOW CREATE TABLE etc. requires at least that) and put
// its credentials in a gitignored .env.production. This script only ever
// runs `mysqldump --no-data`, so it cannot modify anything, but keep the
// blast radius of the credentials themselves small regardless.

import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import path from 'path';

function loadEnvFile(relativePath) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const parsed = dotenv.parse(readFileSync(absolutePath));
  const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
  const missing = required.filter((key) => !parsed[key]);
  if (missing.length > 0) {
    throw new Error(`${relativePath} is missing: ${missing.join(', ')}`);
  }
  return parsed;
}

function dumpSchema(env, label) {
  const args = [
    '--no-data',
    '--routines',
    '--triggers',
    '--compact',
    '--skip-comments',
    '--skip-add-locks',
    '--skip-set-charset',
    '-h', env.DB_HOST,
    '-u', env.DB_USER,
    env.DB_NAME,
  ];
  if (env.DB_PORT) args.splice(6, 0, '-P', env.DB_PORT);

  const result = spawnSync('mysqldump', args, {
    encoding: 'utf-8',
    env: { ...process.env, MYSQL_PWD: env.DB_PASSWORD || '' }, // avoid -p on the command line (visible in process list)
  });

  if (result.error) {
    throw new Error(`Failed to run mysqldump for ${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`mysqldump exited ${result.status} for ${label}:\n${result.stderr}`);
  }
  return result.stdout;
}

// Strips content that legitimately differs between environments without
// indicating a real structural difference: dump metadata, current
// AUTO_INCREMENT counters (a function of row count, not schema), and
// DEFINER clauses on views/routines (tied to whichever DB user created them).
function normalize(dump) {
  return dump
    .split('\n')
    .filter((line) => !line.startsWith('--') && line.trim() !== '')
    .join('\n')
    .replace(/\/\*!\d+\s+DEFINER=`[^`]+`@`[^`]+`\s*/gi, '/*!DEFINER ')
    .replace(/DEFINER=`[^`]+`@`[^`]+`\s*/gi, '')
    .replace(/AUTO_INCREMENT=\d+\s*/gi, '');
}

// Splits a normalized dump into named objects (tables/views/routines) by
// statement, keyed by the identifier mysqldump quotes right after
// CREATE [...] TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER.
function splitObjects(dump) {
  const objects = new Map();
  const statements = dump.split(/;\s*\n/);
  const nameRe = /CREATE\s+(?:[\s\S]*?\s)?(TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER)\s+(?:IF NOT EXISTS\s+)?`([^`]+)`/i;

  for (const raw of statements) {
    const statement = raw.trim();
    if (!statement) continue;
    const match = statement.match(nameRe);
    const key = match ? `${match[1].toUpperCase()} ${match[2]}` : `UNRECOGNIZED_${objects.size}`;
    objects.set(key, statement + ';');
  }
  return objects;
}

// Small LCS-based line diff so a "different" object shows exactly which
// lines changed, instead of dumping both full definitions side by side.
function diffLines(a, b) {
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  const dp = Array.from({ length: linesA.length + 1 }, () => new Array(linesB.length + 1).fill(0));

  for (let i = linesA.length - 1; i >= 0; i--) {
    for (let j = linesB.length - 1; j >= 0; j--) {
      dp[i][j] = linesA[i] === linesB[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out = [];
  let i = 0, j = 0;
  while (i < linesA.length && j < linesB.length) {
    if (linesA[i] === linesB[j]) {
      out.push(`  ${linesA[i]}`);
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`- ${linesA[i]}`);
      i++;
    } else {
      out.push(`+ ${linesB[j]}`);
      j++;
    }
  }
  while (i < linesA.length) out.push(`- ${linesA[i++]}`);
  while (j < linesB.length) out.push(`+ ${linesB[j++]}`);
  return out.join('\n');
}

function compare(labelA, envA, labelB, envB) {
  console.log(`Dumping schema from ${labelA} (${envA.DB_HOST}/${envA.DB_NAME})...`);
  const objectsA = splitObjects(normalize(dumpSchema(envA, labelA)));
  console.log(`Dumping schema from ${labelB} (${envB.DB_HOST}/${envB.DB_NAME})...`);
  const objectsB = splitObjects(normalize(dumpSchema(envB, labelB)));

  const allKeys = new Set([...objectsA.keys(), ...objectsB.keys()]);
  const onlyInA = [];
  const onlyInB = [];
  const different = [];

  for (const key of [...allKeys].sort()) {
    const a = objectsA.get(key);
    const b = objectsB.get(key);
    if (a && !b) onlyInA.push(key);
    else if (b && !a) onlyInB.push(key);
    else if (a !== b) different.push(key);
  }

  console.log('');
  if (onlyInA.length === 0 && onlyInB.length === 0 && different.length === 0) {
    console.log(`✔ ${labelA} and ${labelB} schemas match.`);
    return true;
  }

  console.log(`✘ ${labelA} and ${labelB} schemas differ:\n`);

  if (onlyInA.length > 0) {
    console.log(`Only in ${labelA}:`);
    onlyInA.forEach((k) => console.log(`  - ${k}`));
    console.log('');
  }
  if (onlyInB.length > 0) {
    console.log(`Only in ${labelB}:`);
    onlyInB.forEach((k) => console.log(`  - ${k}`));
    console.log('');
  }
  if (different.length > 0) {
    console.log(`Different definition (- ${labelA} / + ${labelB}):`);
    for (const key of different) {
      console.log(`\n  ${key}`);
      console.log(diffLines(objectsA.get(key), objectsB.get(key)).split('\n').map((l) => `    ${l}`).join('\n'));
    }
  }
  return false;
}

const [, , envPathA, envPathB] = process.argv;
if (!envPathA || !envPathB) {
  console.error('Usage: node scripts/schema/compareSchemas.js <envFileA> <envFileB>');
  process.exit(2);
}

try {
  const envA = loadEnvFile(envPathA);
  const envB = loadEnvFile(envPathB);
  const matched = compare(envPathA, envA, envPathB, envB);
  process.exit(matched ? 0 : 1);
} catch (err) {
  console.error('❌', err.message);
  process.exit(2);
}
