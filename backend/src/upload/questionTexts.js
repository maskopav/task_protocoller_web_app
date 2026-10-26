// src/upload/questionTexts.js
//
// Question and answer texts of a session's questionnaires, read from the
// session ZIP's task_configuration_snapshot.json (the config the app used).
// Answers are stored by key (p13_t5_q1, p13_t5_q3_o2); the snapshot's `strings`
// map those keys to text. Only keys the answers use are returned, so the detail
// response stays small. Any problem yields {}: the UI then shows the keys.
import { openZip } from "./zipReader.js";

const SNAPSHOT = "task_configuration_snapshot.json";
const MAX_BYTES = 4 * 1024 * 1024;

async function readEntry(zip, name) {
  const entry = zip.entries.find((e) => e.name === name && !e.isDirectory);
  if (!entry || entry.uncompressedSize > MAX_BYTES) return null;
  const chunks = [];
  let total = 0;
  for await (const c of await zip.openEntry(name)) {
    total += c.length;
    if (total > MAX_BYTES) return null;
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Pure part: snapshot object + answers -> { key: text }. */
export function questionTextsFromSnapshot(snapshot, { protocolName, protocolProject, answerMaps }) {
  const strings = snapshot?.strings;
  if (!strings || typeof strings !== "object") return {};
  const langs = Object.keys(strings);
  const lang = strings[snapshot.defaultLanguage] ? snapshot.defaultLanguage : langs[0];
  const table = strings[lang];
  if (!table || typeof table !== "object") return {};

  const protocols = Array.isArray(snapshot.protocols) ? snapshot.protocols : [];
  const matched = protocols.filter((p) => p?.name === protocolName && (protocolProject == null || p?.project === protocolProject));
  const questions = new Map();
  for (const p of matched.length ? matched : protocols) {
    for (const t of Array.isArray(p?.tasks) ? p.tasks : []) {
      for (const q of Array.isArray(t?.questions) ? t.questions : []) {
        if (q?.questionKey && q.questionTextKey) questions.set(q.questionKey, q.questionTextKey);
      }
    }
  }

  const text = (k) => (typeof table[k] === "string" && table[k] !== "" ? table[k] : null);
  const out = {};
  for (const answers of answerMaps) {
    for (const [key, value] of Object.entries(answers ?? {})) {
      const qt = text(questions.get(key) ?? "");
      if (qt) out[key] = qt;
      for (const v of [].concat(value)) {
        if (typeof v === "string" && text(v)) out[v] = text(v);
      }
    }
  }
  return out;
}

/** Reads the snapshot out of the ZIP at `file`. Never throws. */
export async function readQuestionTexts(file, meta) {
  let zip;
  try {
    zip = await openZip(file);
    const raw = await readEntry(zip, SNAPSHOT);
    if (!raw) return {};
    return questionTextsFromSnapshot(JSON.parse(raw), meta);
  } catch {
    return {};
  } finally {
    zip?.close();
  }
}
