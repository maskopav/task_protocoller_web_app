import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.add(key.replace(PLURAL, '_*'));
  }
  return out;
}

const load = (lng, f) => JSON.parse(fs.readFileSync(path.join(dir, lng, f), 'utf8'));
// intro.json is only used by the English-only intro component
const files = fs.readdirSync(path.join(dir, 'en')).filter((f) => f.endsWith('.json') && f !== 'intro.json');
// Standardised reading passages are study stimuli: a language gets one only
// as a published, validated version, never a translation. Until then the
// English passage is the fallback.
const STIMULI = /^reading\.params\.topic\.values\.[^.]+\.text$/;

describe('i18n parity', () => {
  for (const lng of ['cs', 'de']) {
    for (const f of files) {
      it(`${lng}/${f} has every en key`, () => {
        const en = flatten(load('en', f));
        const other = flatten(load(lng, f));
        const missing = [...en].filter((k) => !other.has(k) && !STIMULI.test(k));
        expect(missing).toEqual([]);
      });
    }
  }
});
