import { describe, it, expect } from 'vitest';
import { buildExtConfig, loadLocales, htmlToParagraphs, resolveText } from './extConfig.js';
import { CASES, SAMPLE_TOKEN, generateAll } from '../../scripts/gen-ext-configs.js';

const locales = loadLocales();
const all = generateAll(locales);

// Every key the config references must resolve in every served language.
const referencedKeys = (config) => {
  const keys = new Set();
  for (const project of config.projects) for (const protocol of project.protocols) {
    for (const f of protocol.patientFields) { keys.add(f.labelKey); keys.add(f.helpKey); }
    for (const t of protocol.tasks) {
      keys.add(t.titleKey);
      (t.instructionKeys || []).forEach((k) => keys.add(k));
      for (const q of t.questions || []) { keys.add(q.questionTextKey); (q.questionOptions || []).forEach((k) => keys.add(k)); }
    }
  }
  return [...keys];
};

describe('buildExtConfig — spec invariants over every fixture', () => {
  for (const [name, { config }] of Object.entries(all)) {
    describe(name, () => {
      it('has the ext envelope with real booleans', () => {
        expect(config.schemaVersion).toBe(1);
        expect(config.configVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d{6}$/);
        expect(typeof config.enableEditor).toBe('boolean');
        expect(typeof config.useCalibration).toBe('boolean');
        expect(typeof config.defaultMicGain).toBe('number');
        expect(['CIRCLE', 'WAVEFORM']).toContain(config.indicatorType);
        expect(config.languages).toContain(config.defaultLanguage);
        for (const t of config.projects.flatMap((p) => p.protocols).flatMap((p) => p.tasks)) {
          expect(typeof t.canRepeat).toBe('boolean');
          expect(typeof t.canSkip).toBe('boolean');
          expect(Number.isInteger(t.nrepetition) && t.nrepetition >= 1).toBe(true);
          if (t.type === 'VOCAL') expect(typeof t.showIndicator).toBe('boolean');
        }
      });

      it('never emits CALIBRATION/INFO/VIDEO and every recordingsFileName contains ${taskIndex}', () => {
        for (const protocol of config.projects.flatMap((p) => p.protocols)) {
          expect(protocol.recordingsFileName).toContain('${taskIndex}');
          for (const t of protocol.tasks) expect(['VOCAL', 'QUESTIONNAIRE']).toContain(t.type);
        }
      });

      it('resolves every referenced key in every served language', () => {
        expect(Object.keys(config.strings).sort()).toEqual([...config.languages].sort());
        for (const lang of config.languages) {
          for (const key of referencedKeys(config)) expect(config.strings[lang], `${lang}:${key}`).toHaveProperty(key);
        }
      });

      it('leaks no internal ids, native fields or the site token', () => {
        const json = JSON.stringify(config);
        for (const forbidden of ['"id"', '"task_id"', '"language_id"', '"config_json"', '"access_token"', '"site"', '"global_contents"', '"randomization"', SAMPLE_TOKEN]) {
          expect(json).not.toContain(forbidden);
        }
      });
    });
  }
});

describe('buildExtConfig — case specifics', () => {
  it('single_en: subtypes, lengths, audio URL and settings', () => {
    const { config } = all.single_en;
    expect(config.languages).toEqual(['en']);
    expect(config).toMatchObject({ defaultMicName: 'USB audio CODEC', defaultMicGain: 0.8, enableEditor: true, useCalibration: true });
    const [protocol] = config.projects[0].protocols;
    expect(protocol.protocolInstructionsPdfUrl).toMatch(/^https:\/\//);
    expect(protocol.tasks.map((t) => t.subtype)).toEqual(['PHONATION', 'PATAKA', 'READING', 'MONOLOGUE', 'RETELLING']);
    expect(protocol.tasks[0]).toMatchObject({ length: 10, showIndicator: true, audioExamplePath: 'https://example.org/test/dist/audio/illustrations/phonation_a.wav' });
    expect(protocol.tasks[1]).toMatchObject({ length: 7, audioExamplePath: 'https://example.org/test/dist/audio/illustrations/syllableRepeating_pataka.wav' });
    expect(protocol.tasks[2].audioExamplePath).toBeUndefined(); // reading has no example
    expect(protocol.tasks[2].length).toBe(150); // minDuration 0 -> maxDuration
    // reading text is appended as the last paragraph
    const lastKey = protocol.tasks[2].instructionKeys.at(-1);
    expect(config.strings.en[lastKey]).toMatch(/North Wind/);
    expect(protocol.patientFields).toEqual([
      { name: 'patient_code', labelKey: 'p10_f_patient_code_label', helpKey: 'p10_f_patient_code_help', placeholder: 'HC001', regex: '[A-Za-z0-9_-]+', required: true },
    ]);
    expect(config.strings.en.p10_f_patient_code_label).toBe('Participant code');
  });

  it('multi_project: keeps the project → protocol hierarchy', () => {
    const { config } = all.multi_project;
    expect(config.projects.map((p) => p.name)).toEqual(['Project A', 'Project B']);
    expect(config.projects[0].protocols.map((p) => p.name)).toEqual(['Speech battery', 'Short screening']);
    expect(config.projects[1].protocols.map((p) => p.name)).toEqual(['Speech battery', 'Monologue only']);
    expect(config.projects[0].protocols[1].tasks[1].subtype).toBe('SYLLABLES');
    expect(config.projects[0].protocols[1].protocolInstructionsPdfUrl).toBeUndefined();
    // dynamic monologue: one topic paragraph per selected topic after the base instructions
    const dyn = config.projects[1].protocols[1].tasks[0];
    expect(dyn.subtype).toBe('MONOLOGUE');
    expect(dyn.instructionKeys.length).toBeGreaterThanOrEqual(3);
  });

  it('variants_en_cs: merges variants into one protocol with per-language strings', () => {
    const { config } = all.variants_en_cs;
    expect(config.languages).toEqual(['cs', 'en']);
    expect(config.defaultLanguage).toBe('cs');
    expect(config.useCalibration).toBe(false);
    expect(config.projects[0].protocols).toHaveLength(1);
    const [protocol] = config.projects[0].protocols;
    const q = protocol.tasks[2];
    expect(q.type).toBe('QUESTIONNAIRE');
    expect(config.strings.cs[q.titleKey]).toBe('Dotazník spokojenosti');
    expect(config.strings.en[q.titleKey]).toBe('Satisfaction questionnaire');
    expect(q.questions[0]).toMatchObject({ questionType: 'SINGLE_CHOICE', questionOptions: ['p40_t3_q1_o1', 'p40_t3_q1_o2'] });
    expect(config.strings.cs.p40_t3_q1_o1).toBe('Dobře');
    expect(config.strings.en.p40_t3_q1_o1).toBe('Good');
    expect(q.questions[1]).toMatchObject({ questionType: 'OPEN', questionRegex: '.*' });
    // phonation title resolved per language with the phoneme placeholder
    expect(config.strings.en[protocol.tasks[0].titleKey]).toContain('/eee/');
    expect(config.strings.cs[protocol.tasks[0].titleKey]).toBeTruthy();
  });

  it('skipped_vision: serves the protocol without the unsupported task', () => {
    const { config, skipped } = all.skipped_vision;
    expect(skipped.map((s) => s.category)).toEqual(['d15colour']);
    expect(config.projects[0].protocols[0].tasks).toHaveLength(1);
  });

  it('questionnaires: maps every web question type', () => {
    const { config } = all.questionnaires;
    const [protocol] = config.projects[0].protocols;
    expect(protocol.tasks.map((t) => t.type)).toEqual(['QUESTIONNAIRE', 'QUESTIONNAIRE', 'QUESTIONNAIRE']);
    expect(config.strings.en[protocol.tasks[0].titleKey]).toBe('RBD-SQ');
    expect(protocol.tasks[0].questions).toHaveLength(13);
    const custom = protocol.tasks[2];
    expect(custom).toMatchObject({ canRepeat: false, canSkip: true, length: 300, nrepetition: 1 });
    expect(custom.questions.map((q) => q.questionType)).toEqual(['OPEN', 'OPEN', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SINGLE_CHOICE', 'SINGLE_CHOICE']);
    expect(custom.questions[0].questionRegex).toBe('.+');
    expect(custom.questions[1].questionRegex).toBe('.*');
    expect(custom.questions[5].questionOptions).toEqual(['rating_1', 'rating_2', 'rating_3', 'rating_4', 'rating_5']);
    expect(config.strings.en.rating_5).toBe('Very good');
    expect(custom.questions[0].questionOptions).toBeUndefined();
  });

  it('identifiers_full: catalogue overrides, custom fields, legacy ids', () => {
    const { config } = all.identifiers_full;
    const [protocol] = config.projects[0].protocols;
    const names = protocol.patientFields.map((f) => f.name);
    // external_id -> patient_code duplicate of the catalogue entry is kept as-is (editor prevents this); first_name is dropped
    expect(names).toEqual(['current_date', 'sex', 'education', 'patient_code', 'surname', 'year_of_birth', 'visit_number', 'medication_state', 'patient_code']);
    expect(protocol.patientFields[2].required).toBe(true);
    expect(protocol.patientFields[3].placeholder).toBe('PD001');
    expect(protocol.patientFields[6]).toMatchObject({ regex: 'V\\d+', required: true, placeholder: 'V0' });
    expect(config.strings.en.p70_f_visit_number_label).toBe('Visit number');
    expect(config.strings.en.p70_f_visit_number_help).toMatch(/baseline/);
    expect(config.strings.en.p70_f_sex_label).toBe('Sex');
    expect(protocol.recordingsFileName).toContain('${field.surname}');
    for (const f of protocol.patientFields) expect(f).not.toHaveProperty('useInFilename');
  });

  it('empty_settings: falls back to defaults and still serves audio for allowlisted examples', () => {
    const { config } = all.empty_settings;
    expect(config).toMatchObject({ defaultLanguage: 'en', languages: ['en'], defaultMicName: '', defaultMicGain: 1, enableEditor: false, indicatorType: 'CIRCLE', useCalibration: true });
    const [protocol] = config.projects[0].protocols;
    expect(protocol.tasks[1].audioExamplePath).toMatch(/retelling_redRidingHood\.wav$/);
  });

  it('restricted_languages: site setting narrows the served languages', () => {
    const { config } = all.restricted_languages;
    expect(config.languages).toEqual(['cs']);
    expect(config.defaultLanguage).toBe('cs');
    expect(config.strings.en).toBeUndefined();
    expect(config.projects[0].protocols).toHaveLength(1);
  });

  it('legacy_protocol: default template, mapped legacy identifiers, string booleans', () => {
    const { config } = all.legacy_protocol;
    const [protocol] = config.projects[0].protocols;
    expect(protocol.recordingsFileName).toBe('${installationId}_${taskIndex}_${task.subtype}_Rep${repetition}');
    expect(protocol.patientFields.map((f) => f.name)).toEqual(['patient_code', 'sex', 'year_of_birth']);
    expect(protocol.patientFields[2]).toMatchObject({ regex: '\\d{4}', required: false });
    expect(protocol.tasks[0].subtype).toBe('SYLLABLES');
    expect(protocol.tasks[0].audioExamplePath).toBeUndefined();
  });

  it('serves a site with no protocols as an empty but valid config', () => {
    const { config } = buildExtConfig({ site: { name: 'Empty', config_json: { defaultLanguage: 'de' } }, projects: [], tasksById: {}, locales, now: new Date('2026-01-01T00:00:00Z') });
    expect(config).toMatchObject({ languages: ['de'], defaultLanguage: 'de', projects: [], strings: { de: {} }, configVersion: '2026-01-01.000000' });
  });

  it('omits audioExamplePath when ASSET_BASE_URL is not configured', () => {
    const { config } = buildExtConfig({ ...CASES.single_en(locales), locales, assetBaseUrl: '' });
    for (const t of config.projects[0].protocols[0].tasks) expect(t.audioExamplePath).toBeUndefined();
  });
});

describe('htmlToParagraphs', () => {
  it('converts Quill/tasks.json markup to ext inline markup and paragraphs', () => {
    expect(htmlToParagraphs('<p><strong>Start now.</strong> Press <em>START</em>.</p><p>Second&nbsp;para</p>'))
      .toEqual(['<bold>Start now.</bold> Press <italic>START</italic>.', 'Second para']);
    expect(htmlToParagraphs('Line one<br/>line two<br/><br/>Para two')).toEqual(['Line one\nline two', 'Para two']);
    expect(htmlToParagraphs('<span style="color:red">kept text</span> &amp; more')).toEqual(['kept text & more']);
    expect(htmlToParagraphs('')).toEqual([]);
  });
});

describe('resolveText', () => {
  it('substitutes translated param values and drops UI-only placeholders', () => {
    const out = resolveText('Say /{{phoneme}}/ for {{minDuration}} s. {{example}} Done.', { phoneme: 'a', minDuration: 10 }, 'phonation', 'en', locales);
    expect(out).toBe('Say /aaa/ for 10 s. Done.');
  });
  it('hoists object values (reading topic text) into the scope', () => {
    expect(resolveText('{{text}}', { topic: 'rainbow' }, 'reading', 'en', locales)).toMatch(/^When the sunlight/);
    expect(resolveText('Reading {{topic}}', { topic: 'rainbow' }, 'reading', 'en', locales)).toBe('Reading The Rainbow');
  });
});