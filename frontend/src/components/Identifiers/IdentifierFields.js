// src/components/Identifiers/IdentifierFields.js
//
// Participant identifiers ("patientFields" in the desktop app's config).
// A protocol stores an array of field objects in protocols.required_identifiers:
//   { name, catalogue, label, help, placeholder, regex, required }
// Catalogue entries are picked by stable `name`; the desktop app attaches its
// own semantics to some of them (current_date is auto-filled, sex/education
// render fixed options). Custom fields carry plain-string label/help.
// The backend mirrors these constants in backend/src/utils/extConfig.js.

export const FIELD_NAME_RE = /^[a-z][a-z0-9_]*$/;

// Safe fallback (no identifier variables) used when a protocol has no template.
export const DEFAULT_RECORDINGS_FILE_NAME =
  '${installationId}_${taskIndex}_${task.subtype}_Rep${repetition}';
// Prefill for NEW protocols, paired with a prefilled patient_code identifier.
export const NEW_PROTOCOL_FILE_NAME = '${field.patient_code}_' + DEFAULT_RECORDINGS_FILE_NAME;

// Tokens the desktop app substitutes in the template, with the sample value
// used in the admin's preview. `key` points at admin.json fileName.vars.<key>.
export const FILE_NAME_TOKENS = [
  { token: '${installationId}', key: 'installationId', sample: 'CLINIC-01' },
  { token: '${taskIndex}',      key: 'taskIndex',      sample: '03' },
  { token: '${task.subtype}',   key: 'subtype',        sample: 'PHONATION' },
  { token: '${repetition}',     key: 'repetition',     sample: '1' },
];

export const fieldToken = (name) => '${field.' + name + '}';

// Labels/help come from common.json identifiers.catalogue.<name>.{label,help}.
export const IDENTIFIER_CATALOGUE = [
  { name: 'current_date',  placeholder: '',      regex: '',               required: true  },
  { name: 'sex',           placeholder: '',      regex: '',               required: true  },
  { name: 'education',     placeholder: '',      regex: '',               required: false },
  { name: 'patient_code',  placeholder: 'HC001', regex: '[A-Za-z0-9_-]+', required: true  },
  { name: 'surname',       placeholder: '',      regex: '',               required: false },
  { name: 'year_of_birth', placeholder: '1965',  regex: '\\d{4}',         required: false },
];

// Options the desktop app renders for fixed-choice catalogue fields. The web
// never emits these — they exist only for the in-browser protocol preview.
export const CATALOGUE_OPTIONS = {
  sex: ['male', 'female'],
  education: ['less than upper secondary', 'upper secondary and vocational', 'tertiary education'],
};

// Legacy string ids stored before the object shape existed. first_name has no
// catalogue equivalent and is dropped.
export const LEGACY_ID_MAP = {
  external_id: 'patient_code',
  last_name: 'surname',
  birth_year: 'year_of_birth',
  gender: 'sex',
};

export const catalogueField = (name, over = {}) => ({
  ...IDENTIFIER_CATALOGUE.find((f) => f.name === name),
  label: '',
  help: '',
  ...over,
  catalogue: true,
});

export const emptyCustomField = () => ({
  name: '', catalogue: false, label: '', help: '', placeholder: '', regex: '', required: false,
});

// Accepts the stored array in either shape and returns field objects only.
export const normalizeIdentifiers = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => (typeof x === 'string' ? (LEGACY_ID_MAP[x] ? catalogueField(LEGACY_ID_MAP[x]) : null) : x))
    .filter((x) => x && typeof x === 'object');

// Sample values for the filename preview. Custom fields fall back to their
// placeholder, then to their own name.
const IDENTIFIER_SAMPLES = {
  current_date: '2026-03-14',
  sex: 'male',
  education: 'tertiary',
  patient_code: 'HC001',
  surname: 'Novak',
  year_of_birth: '1965',
};

// Tokens a template uses, in order of appearance, duplicates dropped.
export const parseFileNameTokens = (template) =>
  [...new Set(String(template ?? '').match(/\$\{[^}]*\}/g) || [])];

// The template with every known token replaced by a sample value, so the admin
// sees what a real clip name will look like. Unknown tokens are left alone.
export const renderFileNameExample = (template, identifiers = []) => {
  const samples = Object.fromEntries(FILE_NAME_TOKENS.map((v) => [v.token, v.sample]));
  for (const f of normalizeIdentifiers(identifiers)) {
    samples[fieldToken(f.name)] = IDENTIFIER_SAMPLES[f.name] || f.placeholder || f.name;
  }
  return String(template ?? '').replace(/\$\{[^}]*\}/g, (m) => samples[m] ?? m) + '.wav';
};