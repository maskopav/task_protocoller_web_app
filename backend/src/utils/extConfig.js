// src/utils/extConfig.js
//
// Transforms the web app's native protocol serialization (assembleProtocol()
// rows) into the desktop app's config format. Normative shape:
//   docs/ext_app_Task_Configuration_JSON_Spec.md
//   docs/config_alignment_decision_table.md ("Final decisions" section)
//
// buildExtConfig() is a pure function of its arguments so the same code serves
// GET /site-config/:token (siteController.js) and the fixture generator
// (backend/scripts/gen-ext-configs.js). Only loadLocales() touches the disk.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RECORDINGS_FILE_NAME } from "./fieldValidation.js";

export const SCHEMA_VERSION = 1;
const LANGS = ["en", "cs", "de"];

// ---------------------------------------------------------------------------
// Joint deliverables (rows 7a, 12a, 13 of the decision table). The frontend
// mirror of the catalogue lives in frontend/src/components/Identifiers/IdentifierFields.js.
// ---------------------------------------------------------------------------

const CATALOGUE = {
  current_date:  { placeholder: "",      regex: "",               required: true  },
  sex:           { placeholder: "",      regex: "",               required: true  },
  education:     { placeholder: "",      regex: "",               required: false },
  patient_code:  { placeholder: "HC001", regex: "[A-Za-z0-9_-]+", required: true  },
  surname:       { placeholder: "",      regex: "",               required: false },
  year_of_birth: { placeholder: "1965",  regex: "\\d{4}",         required: false },
};
const LEGACY_ID_MAP = { external_id: "patient_code", last_name: "surname", birth_year: "year_of_birth", gender: "sex" };

// Web task category -> ext VOCAL subtype. Anything voice-typed that is not
// listed becomes CUSTOM (generic VOCAL screen, no example audio, all text from
// the config). Questionnaire-typed tasks become QUESTIONNAIRE; every other
// type (vision, cognitive, motoric, camera) is skipped.
const VOCAL_SUBTYPE = {
  phonation: () => "PHONATION",
  syllableRepeating: (p) => (p.syllable === "pataka" ? "PATAKA" : "SYLLABLES"),
  retelling: () => "RETELLING",
  reading: () => "READING",
  monologue: () => "MONOLOGUE",
  dynamic_monologue: () => "MONOLOGUE",
};
const SHOW_INDICATOR_DEFAULT = { phonation: true, syllableRepeating: true };

// Example audio the frontend ships under public/audio/illustrations/. Emitted
// as an absolute URL the desktop app downloads and caches.
const AUDIO_PARAM = { phonation: "phoneme", syllableRepeating: "syllable", retelling: "fairytale" };
const AUDIO_EXAMPLES = new Set(["phonation_a", "syllableRepeating_pataka", "retelling_pussInBoots", "retelling_redRidingHood"]);

// Emoji rating scale (frontend/src/config/emojiRatingScale.jsx) as a
// SINGLE_CHOICE with fixed option keys.
const RATING_LABELS = {
  en: ["Very bad", "Bad", "Okay", "Good", "Very good"],
  cs: ["Velmi špatné", "Špatné", "V pořádku", "Dobré", "Velmi dobré"],
  de: ["Sehr schlecht", "Schlecht", "Okay", "Gut", "Sehr gut"],
};
const RATING_KEYS = RATING_LABELS.en.map((_, i) => `rating_${i + 1}`);

const SETTINGS_DEFAULTS = {
  defaultLanguage: "en",
  languages: [],
  defaultMicName: "",
  defaultMicGain: 1,
  enableEditor: false,
  indicatorType: "CIRCLE",
  useCalibration: true,
};

// Placeholders that are UI widgets in the browser app, not text.
const UI_PLACEHOLDERS = new Set(["example", "playStory"]);

// ---------------------------------------------------------------------------
// Locales
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localeCache = new Map();

// Same path convention as emailService.js: I18N_PATH in prod (backend/locales,
// populated by the frontend build), frontend/src/i18n in dev.
export function loadLocales(baseDir) {
  const dir = baseDir
    ?? (process.env.I18N_PATH ? path.resolve(process.env.I18N_PATH) : path.join(__dirname, "../../../frontend/src/i18n"));
  if (localeCache.has(dir)) return localeCache.get(dir);
  const read = (lang, ns) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, lang, `${ns}.json`), "utf8")); }
    catch { return {}; }
  };
  const locales = Object.fromEntries(LANGS.map((l) => [l, { tasks: read(l, "tasks"), common: read(l, "common") }]));
  localeCache.set(dir, locales);
  return locales;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const bool = (v, dflt) => {
  if (v === undefined || v === null || v === "") return dflt;
  return typeof v === "string" ? v === "true" : Boolean(v);
};
const num = (v, dflt) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? dflt : Number(v));

const settingsOf = (configJson) => {
  const s = { ...SETTINGS_DEFAULTS };
  const src = configJson && typeof configJson === "object" ? configJson : {};
  for (const k of Object.keys(SETTINGS_DEFAULTS)) {
    if (src[k] === undefined || src[k] === null) continue;
    if (typeof SETTINGS_DEFAULTS[k] === "boolean") s[k] = bool(src[k], SETTINGS_DEFAULTS[k]);
    else if (typeof SETTINGS_DEFAULTS[k] === "number") s[k] = num(src[k], SETTINGS_DEFAULTS[k]);
    else if (Array.isArray(SETTINGS_DEFAULTS[k])) s[k] = Array.isArray(src[k]) ? src[k].map(String) : [];
    else s[k] = String(src[k]);
  }
  return s;
};

const decodeEntities = (s) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Web HTML (Quill / tasks.json) -> ext paragraphs with inline <bold>/<italic>.
export function htmlToParagraphs(html) {
  return String(html ?? "")
    .replace(/<\/(p|li|h\d|div)>/gi, "\n\n")
    .replace(/(<br\s*\/?>\s*){2,}/gi, "\n\n")
    .split(/\n{2,}/)
    .map((p) =>
      decodeEntities(
        p.replace(/<(strong|b)(\s[^>]*)?>/gi, "<bold>").replace(/<\/(strong|b)>/gi, "</bold>")
          .replace(/<(em|i)(\s[^>]*)?>/gi, "<italic>").replace(/<\/(em|i)>/gi, "</italic>")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<(?!\/?(bold|italic)>)[^>]+>/g, "")
      ).replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim()
    )
    .filter(Boolean);
}

// tasks.json node for a category in `lang`, with per-key fallback to `en`.
const catText = (locales, lang, category, key) =>
  locales[lang]?.tasks?.[category]?.[key] ?? locales.en?.tasks?.[category]?.[key] ?? "";
const paramValues = (locales, lang, category, param) =>
  locales[lang]?.tasks?.[category]?.params?.[param]?.values ?? locales.en?.tasks?.[category]?.params?.[param]?.values;

// Resolves {{placeholder}} tokens the way the frontend does (translations.ts):
// a param whose translated value is a string -> that string; an object -> its
// label, with its other fields (text, topicDescription) available as further
// placeholders. Numbers/literals -> String(). UI widgets and unknowns -> "".
export function resolveText(tpl, params, category, lang, locales, extraScope = {}) {
  const scope = { ...extraScope };
  for (const [k, v] of Object.entries(params || {})) {
    if (Array.isArray(v) || (v && typeof v === "object")) continue;
    const entry = paramValues(locales, lang, category, k)?.[v];
    if (entry && typeof entry === "object") {
      Object.assign(scope, entry);
      scope[k] = entry.label ?? String(v);
    } else if (typeof entry === "string") scope[k] = entry;
    else if (v !== undefined && v !== null) scope[k] = String(v);
  }
  return String(tpl ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    UI_PLACEHOLDERS.has(k) ? "" : (scope[k] ?? "")
  ).replace(/ {2,}/g, " ");
}

// Title + instruction paragraphs of one task in one language.
function taskTexts(category, params, lang, locales) {
  const text = (key, scope) => resolveText(catText(locales, lang, category, key), params, category, lang, locales, scope);
  const title = text("title").trim() || catText(locales, lang, category, "name") || category;
  let paragraphs = htmlToParagraphs(text("instructions"));

  if (category === "monologue") {
    paragraphs = paragraphs.concat(htmlToParagraphs(text("instructionsTopic")));
  } else if (category === "dynamic_monologue") {
    const values = paramValues(locales, lang, category, "topics") || {};
    for (const topic of Array.isArray(params?.topics) ? params.topics : []) {
      const entry = values[topic];
      if (entry) paragraphs = paragraphs.concat(htmlToParagraphs(text("instructionsTopic", { ...entry, topics: entry.label })));
    }
  } else if (category === "reading") {
    const entry = paramValues(locales, lang, category, "topic")?.[params?.topic];
    if (entry?.text) paragraphs.push(entry.text);
  }
  return { title, paragraphs };
}

const QUESTION_TYPE = { open: "OPEN", single: "SINGLE_CHOICE", dropdown: "SINGLE_CHOICE", rating: "SINGLE_CHOICE", multiple: "MULTIPLE_CHOICE" };

// The DB stores UTC_TIMESTAMP(); a bare "YYYY-MM-DD HH:MM:SS" string is UTC.
const toDate = (v) => {
  if (v == null) return null;
  const s = typeof v === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.replace(" ", "T")}Z` : v;
  const d = s instanceof Date ? s : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const formatVersion = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}.${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
};

// ---------------------------------------------------------------------------
// The transform
// ---------------------------------------------------------------------------

/**
 * @param site        { name, config_json: object|null, updated_at }
 * @param projects    [{ name, protocols: [assembled] }] where assembled is the
 *                    assembleProtocol() result with protocol.language_code set
 * @param tasksById   { [tasks.id]: { category, type } }
 * @param locales     loadLocales() result
 * @param assetBaseUrl public origin of the frontend build ("" disables audio examples)
 * @param now         Date used when no row carries an updated_at
 * @returns { config, skipped: [{ protocol, order, category }] }
 */
export function buildExtConfig({ site, projects, tasksById, locales, assetBaseUrl = "", now = new Date() }) {
  const settings = settingsOf(site?.config_json);
  const skipped = [];
  const strings = {};
  const put = (lang, key, value) => { (strings[lang] ??= {})[key] = value ?? ""; };

  // Languages: union of variant languages, restricted by the site setting.
  const allAssembled = projects.flatMap((p) => p.protocols);
  const union = [...new Set(allAssembled.map((a) => a.protocol.language_code).filter(Boolean))].sort();
  let languages = settings.languages.length ? union.filter((l) => settings.languages.includes(l)) : union;
  if (!languages.length) languages = union.length ? union : [settings.defaultLanguage];
  const defaultLanguage = languages.includes(settings.defaultLanguage) ? settings.defaultLanguage : languages[0];
  for (const l of languages) strings[l] ??= {};

  // configVersion = newest updated_at across the site and every protocol row.
  const stamps = [site?.updated_at, ...allAssembled.map((a) => a.protocol.updated_at)].map(toDate).filter(Boolean);
  const configVersion = formatVersion(stamps.length ? new Date(Math.max(...stamps)) : now);

  const audioUrl = (category, params) => {
    const key = AUDIO_PARAM[category] && `${category}_${params?.[AUDIO_PARAM[category]]}`;
    return assetBaseUrl && key && AUDIO_EXAMPLES.has(key)
      ? `${assetBaseUrl.replace(/\/+$/, "")}/audio/illustrations/${key}.wav` : undefined;
  };

  const mapProtocolGroup = (variants) => {
    const byLang = Object.fromEntries(variants.map((v) => [v.protocol.language_code, v]));
    const primary = byLang[defaultLanguage] ?? byLang.en ?? variants[0];
    const gid = primary.protocol.protocol_group_id ?? primary.protocol.id;
    const name = primary.protocol.name;

    // Per-language params of the task at `order` (questionnaire texts differ
    // between variants; everything structural is synced by saveProtocol).
    const paramsFor = (lang, order) =>
      (byLang[lang] ?? primary).tasks.find((t) => t.task_order === order)?.params
      ?? primary.tasks.find((t) => t.task_order === order)?.params ?? {};

    const tasks = [];
    for (const task of primary.tasks) {
      const def = tasksById[task.task_id];
      const category = def?.category ?? `unknown(${task.task_id})`;
      const type = def?.type;
      const params = task.params || {};
      const P = `p${gid}_t${task.task_order}`;

      const isQuestionnaire = type === "questionnaire";
      const subtype = VOCAL_SUBTYPE[category]?.(params) ?? (type === "voice" ? "CUSTOM" : null);
      if (!isQuestionnaire && !subtype) {
        skipped.push({ protocol: name, order: task.task_order, category });
        continue;
      }

      const common = {
        titleKey: `${P}_title`,
        canRepeat: bool(params.canRepeat, true),
        canSkip: bool(params.canSkip, false),
        nrepetition: isQuestionnaire ? 1 : Math.max(1, num(params.repeat, 1)),
      };

      if (isQuestionnaire) {
        const questions = (Array.isArray(params.questions) ? params.questions : []).map((q, i) => {
          const qi = i + 1;
          const questionType = QUESTION_TYPE[q.type] ?? "OPEN";
          const out = { questionType, questionKey: `${P}_q${qi}`, questionTextKey: `${P}_q${qi}_text` };
          if (questionType === "OPEN") out.questionRegex = q.optional ? ".*" : ".+";
          else out.questionOptions = q.type === "rating" ? RATING_KEYS : (q.options || []).map((_, oi) => `${P}_q${qi}_o${oi + 1}`);
          return out;
        });
        for (const lang of languages) {
          const lp = paramsFor(lang, task.task_order);
          put(lang, common.titleKey, (lp.title || params.title || "").trim() || taskTexts(category, lp, lang, locales).title);
          (Array.isArray(params.questions) ? params.questions : []).forEach((q, i) => {
            const lq = lp.questions?.[i] ?? q;
            put(lang, `${P}_q${i + 1}_text`, lq.text || q.text || "");
            if (q.type === "rating") RATING_KEYS.forEach((k, ri) => put(lang, k, (RATING_LABELS[lang] ?? RATING_LABELS.en)[ri]));
            else (q.options || []).forEach((opt, oi) => put(lang, `${P}_q${i + 1}_o${oi + 1}`, lq.options?.[oi] ?? opt));
          });
        }
        tasks.push({ type: "QUESTIONNAIRE", ...common, questions, length: num(params.duration, 300) });
        continue;
      }

      // VOCAL: paragraph count comes from the default language so every key
      // exists in every strings.<lang>.
      const primaryTexts = taskTexts(category, params, defaultLanguage, locales);
      const n = Math.max(1, primaryTexts.paragraphs.length);
      for (const lang of languages) {
        const texts = lang === defaultLanguage ? primaryTexts : taskTexts(category, paramsFor(lang, task.task_order), lang, locales);
        put(lang, common.titleKey, texts.title);
        for (let i = 0; i < n; i++) put(lang, `${P}_instr${i + 1}`, texts.paragraphs[i] ?? "");
      }
      const vocal = {
        type: "VOCAL",
        subtype,
        ...common,
        instructionKeys: Array.from({ length: n }, (_, i) => `${P}_instr${i + 1}`),
        length: num(params.duration, num(params.minDuration, 0) || num(params.maxDuration, 0)),
        showIndicator: bool(params.showIndicator, SHOW_INDICATOR_DEFAULT[category] ?? false),
      };
      const audio = audioUrl(category, params);
      if (audio) vocal.audioExamplePath = audio;
      tasks.push(vocal);
    }

    // patientFields (row 6/7): objects, or legacy string ids mapped onto the catalogue.
    const fields = (Array.isArray(primary.protocol.required_identifiers) ? primary.protocol.required_identifiers : [])
      .map((f) => (typeof f === "string"
        ? (LEGACY_ID_MAP[f] ? { name: LEGACY_ID_MAP[f], catalogue: true, ...CATALOGUE[LEGACY_ID_MAP[f]] } : null)
        : f))
      .filter((f) => f && typeof f === "object" && f.name);
    const patientFields = fields.map((f) => {
      const base = f.catalogue ? CATALOGUE[f.name] ?? {} : {};
      const labelKey = `p${gid}_f_${f.name}_label`;
      const helpKey = `p${gid}_f_${f.name}_help`;
      for (const lang of languages) {
        const cat = f.catalogue
          ? (locales[lang]?.common?.identifiers?.catalogue?.[f.name] ?? locales.en?.common?.identifiers?.catalogue?.[f.name])
          : null;
        put(lang, labelKey, cat?.label ?? f.label ?? f.name);
        put(lang, helpKey, cat?.help ?? f.help ?? "");
      }
      return {
        name: f.name,
        labelKey,
        helpKey,
        placeholder: f.placeholder ?? base.placeholder ?? "",
        regex: f.regex ?? base.regex ?? "",
        required: bool(f.required, base.required ?? false),
      };
    });

    const out = { name };
    if (primary.protocol.instructions_pdf_url) out.protocolInstructionsPdfUrl = primary.protocol.instructions_pdf_url;
    out.recordingsFileName = primary.protocol.recordings_file_name || DEFAULT_RECORDINGS_FILE_NAME;
    out.patientFields = patientFields;
    out.tasks = tasks;
    return out;
  };

  const outProjects = projects.map((project) => {
    const groups = new Map();
    const seen = new Set();
    for (const a of project.protocols) {
      if (!a?.protocol || seen.has(a.protocol.id)) continue;
      seen.add(a.protocol.id);
      const gid = a.protocol.protocol_group_id ?? a.protocol.id;
      if (!groups.has(gid)) groups.set(gid, []);
      groups.get(gid).push(a);
    }
    return { name: project.name, protocols: [...groups.values()].map(mapProtocolGroup) };
  });

  const config = {
    schemaVersion: SCHEMA_VERSION,
    configVersion,
    defaultLanguage,
    languages,
    defaultMicName: settings.defaultMicName,
    defaultMicGain: settings.defaultMicGain,
    enableEditor: settings.enableEditor,
    indicatorType: settings.indicatorType,
    useCalibration: settings.useCalibration,
    projects: outProjects,
    strings,
  };
  return { config, skipped };
}