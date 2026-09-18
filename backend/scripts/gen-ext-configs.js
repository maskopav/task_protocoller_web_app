// backend/scripts/gen-ext-configs.js
//
// Generates sample desktop-app configs from hand-built native fixtures — no
// database needed. Every case is a legitimate state the web platform can
// produce; the JSON files are meant as test input for the desktop app.
//
//   node backend/scripts/gen-ext-configs.js        -> docs/ext_app_samples/<case>.json
//
// The same CASES drive backend/src/utils/extConfig.test.js.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildExtConfig, loadLocales } from "../src/utils/extConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../../docs/ext_app_samples");

// tasks / task_types seed order (backend/scripts/seed/seed_all.sql)
const TASKS = {
  phonation: [1, "voice"], syllableRepeating: [2, "voice"], retelling: [3, "voice"], reading: [4, "voice"],
  monologue: [5, "voice"], questionnaire: [6, "questionnaire"], rbdsq: [7, "questionnaire"], hhies: [8, "questionnaire"],
  d15colour: [9, "vision"], dynamic_monologue: [10, "voice"],
};
export const tasksById = Object.fromEntries(Object.entries(TASKS).map(([category, [id, type]]) => [id, { category, type }]));
const LANG_ID = { en: 1, cs: 2, de: 3 };

export const SAMPLE_TOKEN = "sample00sample00sample00sample00";
const NOW = new Date("2026-09-18T12:00:00Z");
const ASSETS = "https://example.org/test/dist";

// tasksBase.ts defaults, as the editor stores them (flat task object = params).
const DEFAULTS = {
  phonation: { phoneme: "a", repeat: 1, minDuration: 10, maxDuration: 60, recordVideo: false },
  syllableRepeating: { syllable: "pataka", repeat: 1, duration: 7, recordVideo: false },
  retelling: { fairytale: "pussInBoots", repeat: 1, duration: 90, minDuration: 30, maxDuration: 120, recordVideo: false },
  reading: { topic: "northWind", repeat: 1, minDuration: 0, maxDuration: 150, recordVideo: false },
  monologue: { topic: "dayDescription", repeat: 1, duration: 60, minDuration: 30, maxDuration: 120, recordVideo: false },
  dynamic_monologue: { topics: ["everyday", "hobbies", "travel", "eating"], duration: 60, minDuration: 30, maxDuration: 120, recordVideo: false },
  d15colour: { randomize: true, repeat: 1, version: "desaturated", demoTrial: "no", showNumbers: "never", maxDuration: 180 },
};
const task = (category, over = {}) => [category, { ...DEFAULTS[category], ...over }];

// Standard questionnaire content exactly as ProtocolEditor.handleCreateTask injects it.
const standardQuestionnaire = (locales, category, lang) => {
  const dc = locales[lang]?.tasks?.[category]?.defaultContent ?? locales.en.tasks[category].defaultContent;
  return [category, { ...dc }];
};

const site = (config_json = null, over = {}) => ({
  name: "Sample Site", config_json, updated_at: "2026-09-01 10:00:00", access_token: SAMPLE_TOKEN, ...over,
});

// Catalogue entries as the identifier editor stores them.
const cat = (name, over = {}) => ({
  name, catalogue: true, label: "", help: "",
  ...{ current_date: { placeholder: "", regex: "", required: true },
       sex: { placeholder: "", regex: "", required: true },
       education: { placeholder: "", regex: "", required: false },
       patient_code: { placeholder: "HC001", regex: "[A-Za-z0-9_-]+", required: true },
       surname: { placeholder: "", regex: "", required: false },
       year_of_birth: { placeholder: "1965", regex: "\\d{4}", required: false } }[name],
  ...over,
});
const FILE_NAME = "${field.patient_code}_${installationId}_${taskIndex}_${task.subtype}_Rep${repetition}";
const PDF = "https://example.org/manuals/protocol_manual_2026.pdf";

// Builds what assembleProtocol() returns for one protocols row.
export function proto({ id, gid = id, name, lang = "en", identifiers = [cat("patient_code")], fileName = FILE_NAME, pdf = PDF, tasks, updated_at = "2026-09-10 09:30:00" }) {
  return {
    protocol: {
      id, protocol_group_id: gid, name, language_code: lang, language_id: LANG_ID[lang] ?? 1, version: 1, is_current: 1,
      description: "", created_at: updated_at, updated_at, randomization: { strategy: "none" }, use_audio_guide: 1,
      required_identifiers: identifiers, recordings_file_name: fileName, instructions_pdf_url: pdf, is_archived: 0,
    },
    contentMap: {},
    globalFields: {},
    tasks: tasks.map(([category, params], i) => ({ id: id * 100 + i + 1, task_id: TASKS[category][0], task_order: i + 1, params, contents: [] })),
  };
}

const speechBattery = [
  task("phonation"), task("syllableRepeating"), task("reading"), task("monologue"), task("retelling"),
];

const args = (s, projects) => ({ site: s, projects, tasksById, assetBaseUrl: ASSETS, now: NOW });

export const CASES = {
  // One project, one English protocol, full site settings.
  single_en: () => args(
    site({ defaultLanguage: "en", languages: ["en"], defaultMicName: "USB audio CODEC", defaultMicGain: 0.8, enableEditor: true, indicatorType: "CIRCLE", useCalibration: true }),
    [{ name: "Speech Study", protocols: [proto({ id: 10, name: "Speech battery", tasks: speechBattery })] }],
  ),

  // Two projects; group 1 is linked to both (deduplicated per project, listed under each).
  multi_project: () => args(
    site({ defaultLanguage: "en" }),
    [
      { name: "Project A", protocols: [proto({ id: 10, name: "Speech battery", tasks: speechBattery }), proto({ id: 20, gid: 20, name: "Short screening", tasks: [task("phonation"), task("syllableRepeating", { syllable: "ta" })], pdf: null })] },
      { name: "Project B", protocols: [proto({ id: 10, name: "Speech battery", tasks: speechBattery }), proto({ id: 30, gid: 30, name: "Monologue only", tasks: [task("dynamic_monologue", { topics: ["hobbies", "travel"] })] })] },
    ],
  ),

  // English + Czech variants of one protocol merged into one entry; the
  // questionnaire task carries per-language texts.
  variants_en_cs: (locales) => {
    const q = (lang) => ["questionnaire", {
      title: lang === "cs" ? "Dotazník spokojenosti" : "Satisfaction questionnaire", description: "",
      questions: [
        { id: 1, text: lang === "cs" ? "Jak se dnes cítíte?" : "How do you feel today?", type: "single", options: lang === "cs" ? ["Dobře", "Špatně"] : ["Good", "Bad"], optional: false },
        { id: 2, text: lang === "cs" ? "Poznámka" : "Note", type: "open", options: [], optional: true },
      ],
    }];
    const tasks = (lang) => [task("phonation", { phoneme: "e" }), task("reading", { topic: "rainbow" }), q(lang), standardQuestionnaire(locales, "rbdsq", lang)];
    return args(
      site({ defaultLanguage: "cs", languages: ["cs", "en"], useCalibration: false }),
      [{ name: "Bilingual Study", protocols: [proto({ id: 40, gid: 40, name: "Bilingual protocol", lang: "en", tasks: tasks("en") }), proto({ id: 41, gid: 40, name: "Bilingual protocol", lang: "cs", tasks: tasks("cs") })] }],
    );
  },

  // Vision tasks are not supported by the desktop app and are skipped.
  skipped_vision: () => args(
    site(null),
    [{ name: "Mixed Study", protocols: [proto({ id: 50, name: "Mixed modalities", tasks: [task("phonation"), task("d15colour")] })] }],
  ),

  // The standard questionnaires plus a custom one with every question type.
  questionnaires: (locales) => args(
    site({ defaultLanguage: "en" }),
    [{ name: "Questionnaire Study", protocols: [proto({ id: 60, name: "Questionnaire set", tasks: [
      standardQuestionnaire(locales, "rbdsq", "en"),
      standardQuestionnaire(locales, "hhies", "en"),
      ["questionnaire", { title: "Custom questionnaire", description: "All question types", canRepeat: false, canSkip: true, questions: [
        { id: 1, text: "Open question", type: "open", options: [], optional: false },
        { id: 2, text: "Optional open question", type: "open", options: [], optional: true },
        { id: 3, text: "Single choice", type: "single", options: ["A", "B", "C"], optional: false },
        { id: 4, text: "Multiple choice", type: "multiple", options: ["X", "Y", "Z", "None"], exclusiveOption: "None", freeTextOptions: ["Z"], optional: false },
        { id: 5, text: "Dropdown", type: "dropdown", options: ["One", "Two"], optional: false },
        { id: 6, text: "Rating", type: "rating", options: [], optional: false },
      ] }],
    ] })] }],
  ),

  // Every catalogue entry (with overrides), two custom fields, and legacy string ids.
  identifiers_full: () => args(
    site({ defaultLanguage: "en" }),
    [{ name: "Identifier Study", protocols: [proto({ id: 70, name: "All identifiers", tasks: [task("phonation")],
      fileName: "${field.patient_code}_${field.surname}_${installationId}_${taskIndex}_${task.subtype}_Rep${repetition}",
      identifiers: [
        cat("current_date"), cat("sex"), cat("education", { required: true }), cat("patient_code", { placeholder: "PD001" }), cat("surname"), cat("year_of_birth"),
        { name: "visit_number", catalogue: false, label: "Visit number", help: "V0 baseline, V3 three-month follow-up", placeholder: "V0", regex: "V\\d+", required: true },
        { name: "medication_state", catalogue: false, label: "Medication state", help: "", placeholder: "ON/OFF", regex: "", required: false },
        "external_id", "first_name",
      ] })] }],
  ),

  // No site settings at all -> defaults.
  empty_settings: () => args(
    site(null),
    [{ name: "Defaults Study", protocols: [proto({ id: 80, name: "Defaults", tasks: [task("phonation"), task("retelling", { fairytale: "redRidingHood" })], pdf: null })] }],
  ),

  // Site restricted to Czech although the protocol also has an English variant.
  restricted_languages: () => args(
    site({ defaultLanguage: "cs", languages: ["cs"] }),
    [{ name: "Czech Clinic Study", protocols: [proto({ id: 90, gid: 90, name: "Czech protocol", lang: "en", tasks: speechBattery }), proto({ id: 91, gid: 90, name: "Czech protocol", lang: "cs", tasks: speechBattery })] }],
  ),

  // Protocol saved before the desktop-app fields existed: NULL template, string identifiers.
  legacy_protocol: () => args(
    site({ defaultLanguage: "en" }),
    [{ name: "Legacy Study", protocols: [proto({ id: 100, name: "Legacy protocol", fileName: null, pdf: null, identifiers: ["external_id", "gender", "birth_year", "first_name"],
      tasks: [task("syllableRepeating", { syllable: "ta", recordVideo: "true" }), task("monologue")] })] }],
  ),
};

export function generateAll(locales = loadLocales()) {
  return Object.fromEntries(Object.entries(CASES).map(([name, make]) => [name, buildExtConfig({ ...make(locales), locales })]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, { config, skipped }] of Object.entries(generateAll())) {
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(config, null, 2) + "\n");
    console.log(`${name}.json${skipped.length ? `  (skipped: ${skipped.map((s) => `${s.category}@${s.order}`).join(", ")})` : ""}`);
  }
  console.log(`\nWritten to ${OUT_DIR}`);
}