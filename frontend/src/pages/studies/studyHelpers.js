// src/pages/studies/studyHelpers.js — pure logic of the Studies screens (unit-tested).
import { catalogueField, NEW_PROTOCOL_FILE_NAME } from "../../components/Identifiers/IdentifierFields";

const norm = (s) => String(s ?? "").toLowerCase().trim();

/** A study counts as archived when its active flag is 0. */
export const isArchived = (study) => Number(study?.project_is_active ?? study?.is_active ?? 1) === 0;

/**
 * Splits the studies list into the groups of the list page.
 * A master gets one group ("all"); everyone else gets "yours" (editable) and "received".
 */
export function groupStudies(rows, { isMaster, showArchived = false, query = "" } = {}) {
  const q = norm(query);
  const shown = (rows || []).filter((s) => {
    if (!showArchived && isArchived(s)) return false;
    if (!q) return true;
    return norm(s.project_name).includes(q) || norm(s.description).includes(q);
  });
  if (isMaster) return { all: shown, yours: [], received: [] };
  return {
    all: [],
    yours: shown.filter((s) => s.can_edit),
    received: shown.filter((s) => !s.can_edit),
  };
}

/**
 * Clinic counts of a study: `total` is every clinic it runs at, `visible` the ones the caller can see.
 * An older backend sends no visible_site_count; then everything counts as visible.
 */
export function clinicCounts(study) {
  const total = Number(study?.site_count ?? 0);
  const raw = study?.visible_site_count;
  const visible = raw == null ? total : Number(raw);
  return { total, visible, partial: visible < total };
}

/** Unique language codes over protocol groups (the chips of a study). */
export function languageCodes(protocols) {
  const out = [];
  for (const p of protocols || []) {
    const langs = p.languages?.length ? p.languages.map((l) => l.code) : p.language_code ? [p.language_code] : [];
    for (const code of langs) if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** True when `name` is already used by one of `protocols` (case-insensitive, trimmed). */
export function protocolNameTaken(name, protocols) {
  const n = norm(name);
  return !!n && (protocols || []).some((p) => norm(p.name) === n);
}

/**
 * The unsaved protocol a new "Blank" protocol starts as (F-006): a required patient code
 * identifier and a file-name template that uses it.
 * @param {{name: string, description?: string, language: string}} input
 */
export function blankProtocolDraft({ name, description = "", language }) {
  return {
    name: String(name ?? "").trim(),
    description: String(description ?? "").trim(),
    language: [language || "en"],
    required_identifiers: [catalogueField("patient_code")],
    recordings_file_name: NEW_PROTOCOL_FILE_NAME,
    info_text: "",
    instructions_text: "",
    instructions_pdf_url: "",
    tasks: [],
  };
}

/** A copy of a loaded protocol, ready to be saved as a new protocol (Duplicate, Copy to another study). */
export function duplicateDraft(mapped, name) {
  return {
    ...mapped,
    id: undefined,
    protocol_group_id: undefined,
    version: 1,
    name,
    language: Array.isArray(mapped.language) ? mapped.language : [mapped.language || "en"],
  };
}

/** Picks the UI language when the protocol languages offer it, else the first language, else "en". */
export function defaultLanguage(uiLanguage, codes) {
  const list = codes?.length ? codes : [];
  const base = String(uiLanguage || "").slice(0, 2);
  if (list.includes(base)) return base;
  return list[0] || base || "en";
}

/**
 * Rows of the study's Clinics tab for RunsAtList: clinics it runs at first, then by name.
 * @param {Array<{id:number,name:string}>} clinics every clinic the caller sees
 * @param {Set<number>|number[]} onIds clinics the study runs at
 * @param {Record<number, number>} recordings recordings in the last 30 days per clinic
 */
export function clinicRows(clinics, onIds, recordings = {}, { subtitle, href } = {}) {
  const on = new Set(onIds);
  return [...(clinics || [])]
    .sort((a, b) => {
      const d = Number(on.has(b.id)) - Number(on.has(a.id));
      return d || String(a.name).localeCompare(String(b.name));
    })
    .map((c) => ({
      key: c.id,
      title: c.name,
      subtitle: subtitle ? subtitle(recordings[c.id] || 0) : undefined,
      on: on.has(c.id),
      href: href ? href(c) : undefined,
    }));
}

/** Whether an editor row may be removed: not the creator, and not the last editor. */
export const canRemoveEditor = (editor, editors) => !editor.is_creator && (editors?.length || 0) > 1;

/** A boolean parameter default as Yes/No (F-007); other values are returned as they are. */
export function yesNo(value, t) {
  if (value === true || value === "true") return t("yes");
  if (value === false || value === "false") return t("no");
  return value;
}
