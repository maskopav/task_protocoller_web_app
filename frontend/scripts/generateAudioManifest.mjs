#!/usr/bin/env node
// scripts/generateAudioManifest.mjs
//
// Audio guide clips live in public/audio/guide/**, so Vite copies them into
// dist byte-for-byte at a fixed URL (unlike imported assets, which get
// content-hashed filenames). That means once a participant's browser has
// fetched e.g. /audio/guide/en/instructions.m4a, it can keep serving that
// cached copy indefinitely even after the file on the server is replaced —
// the URL never changes, so there's nothing to tell the cache the content is
// stale.
//
// This script hashes each guide clip's contents and writes the result to
// src/generated/audioGuideManifest.json. getAudioGuidePath.ts imports that
// manifest and appends `?v=<hash>` to each clip's URL, so only clips whose
// content actually changed get a new URL — everything else keeps its old
// (still valid) cached URL.
//
// Runs automatically before `npm run dev` / `npm run build` (see
// package.json's predev/prebuild scripts) so the manifest can never go stale
// relative to the files it describes.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUIDE_DIR = path.join(__dirname, '../public/audio/guide');
const OUT_FILE = path.join(__dirname, '../src/generated/audioGuideManifest.json');

function collectFiles(dir, baseDir) {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return collectFiles(fullPath, baseDir);
    }
    // Manifest key matches the "<language>/<fileName>.m4a" shape
    // buildAudioGuidePath() constructs at runtime.
    const key = path.relative(baseDir, fullPath).split(path.sep).join('/');
    return [{ key, fullPath }];
  });
}

const files = collectFiles(GUIDE_DIR, GUIDE_DIR);

const manifest = {};
for (const { key, fullPath } of files) {
  const hash = createHash('md5').update(readFileSync(fullPath)).digest('hex').slice(0, 8);
  manifest[key] = hash;
}

mkdirSync(path.dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Wrote ${Object.keys(manifest).length} audio guide file hashes to ${path.relative(process.cwd(), OUT_FILE)}`);
