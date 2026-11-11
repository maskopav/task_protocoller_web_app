// src/mcp/shape.js
//
// Allowlist shapers for MCP tool results (docs/mcp/01_spec.md section 5).
// Every key that leaves is named here. Never spread a controller result: a key
// that is not listed is dropped, so a column added later cannot leak.
// The only participant values that may leave are patient_code and visit_number.

const pick = (obj, keys) => {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
};
const list = (v) => (Array.isArray(v) ? v : []);
const participant = (p) => ({ patient_code: p?.patient_code ?? null, visit_number: p?.visit_number ?? null });

// --- studies ------------------------------------------------------------------------

export const study = (r) => ({
  id: Number(r.project_id ?? r.id),
  name: r.project_name ?? r.name,
  description: r.description ?? null,
  isActive: Number(r.project_is_active) === 1,
  startDate: r.start_date ?? null,
  endDate: r.end_date ?? null,
  countries: r.countries ?? null,
  contactPersons: r.contact_persons ?? null,
  contactEmails: r.contact_emails ?? null,
  creator: r.creator_name ?? null,
  clinicCount: r.site_count ?? null,
  visibleClinicCount: r.visible_site_count ?? null,
  protocolCount: r.protocol_count ?? null,
  unreviewedRecordings: r.unreviewed ?? null,
  canEdit: !!r.can_edit,
  isOwner: !!r.is_owner,
  // Owned (you may edit it) or received through one of your clinics (read-only).
  access: r.can_edit ? "owned" : "received",
});

// --- clinics (never access_token) ----------------------------------------------------

const CLINIC_KEYS = ["id", "name", "description", "country", "contact_persons", "contact_emails", "is_active", "project_count"];

export const clinic = (r) => ({
  ...pick(r, CLINIC_KEYS),
  is_active: r.is_active == null ? undefined : Number(r.is_active) === 1,
  project_count: r.project_count == null ? undefined : Number(r.project_count),
  can_edit: !!r.can_edit,
});

export const clinicDetail = (r) => ({
  ...clinic(r),
  studies: list(r.projects).map((p) => ({ id: p.id, name: p.name, isActive: Number(p.is_active) === 1, canEdit: !!p.can_edit })),
  receives: list(r.receives).map((s) => ({
    studyId: s.project_id,
    study: s.project_name,
    protocols: list(s.protocols).map((p) => ({ protocolId: p.protocol_id, name: p.name, version: p.version, languages: list(p.languages) })),
  })),
});

// --- protocols -------------------------------------------------------------------------

export const protocolSummary = (g) => ({
  id: g.id,
  groupId: g.protocol_group_id,
  studyId: g.project_id,
  name: g.name,
  description: g.description ?? null,
  version: g.version,
  isArchived: Number(g.is_archived) === 1,
  updatedAt: g.updated_at ?? null,
  tasks: Number(g.n_tasks) || 0,
  questionnaires: Number(g.n_quest) || 0,
  languages: list(g.languages).map((l) => ({ code: l.code, protocolId: l.protocol_id })),
  copiedFrom: g.copied_from_id ? { id: g.copied_from_id, name: g.copied_from_name ?? null, version: g.copied_from_version ?? null } : null,
  libraryEntryId: g.library_entry_id ?? null,
});

const protocolTask = (t) => ({
  id: t.id,
  taskId: t.task_id,
  order: t.task_order,
  params: t.params ?? {},
  contents: list(t.contents).map((c) => ({ type: c.type, html: c.html })),
});

// Protocol design only. required_identifiers are field names, recordings_file_name
// is the template: both describe the form, not a participant.
const PROTOCOL_KEYS = [
  "id", "protocol_group_id", "project_id", "name", "description", "version", "language",
  "is_current", "is_archived", "created_at", "updated_at",
  "randomization", "required_identifiers", "use_audio_guide", "recordings_file_name", "instructions_pdf_url",
  "info_text", "instructions_text", "consent_text",
];

export const protocol = (p) => ({
  ...pick(p, PROTOCOL_KEYS),
  global_contents: list(p.global_contents).map((c) => ({ type: c.type, html: c.html })),
  tasks: list(p.tasks).map(protocolTask),
  can_edit: !!p.can_edit,
});

export const libraryEntry = (g) => ({
  ...pick(g, ["id", "protocol_group_id", "name", "description", "version", "languages", "protocol_ids", "n_tasks", "author", "used_in", "updated_at"]),
  is_author: !!g.is_author,
});

export const libraryDetail = (p) => ({ ...protocol(p), author: p.author ?? null, used_in: p.used_in ?? 0 });

// --- recordings ----------------------------------------------------------------------

const RECORDING_ROW_KEYS = [
  "id", "siteId", "site", "deviceLabel", "protocol", "projectId", "project",
  "startedAt", "endedAt", "processedAt", "receivedAt", "durationS", "bytes",
  "status", "invalidReason", "qc", "issues", "needsAttention",
  "tasksTotal", "tasksDone", "tasksSkipped", "hasAudio", "audioClips", "videoClips",
  "canEdit", "commentCount",
];

export const recordingRow = (r) => ({ ...pick(r, RECORDING_ROW_KEYS), participant: participant(r.participant) });

export const recordingList = (b) => ({
  rows: list(b.rows).map(recordingRow),
  total: b.total,
  page: b.page,
  pageSize: b.pageSize,
  kpis: pick(b.kpis, ["received7d", "valid", "invalid", "attention", "unreviewed"]),
  facets: {
    sites: list(b.facets?.sites).map((s) => pick(s, ["id", "name", "count"])),
    flags: list(b.facets?.flags).map((f) => pick(f, ["key", "count"])),
    video: b.facets?.video ?? 0,
  },
});

// File names (built from a template that can embed identifiers) and
// questionnaire answers never leave; only that they exist.
const recordingTask = (t) => ({
  ...pick(t, ["taskIndex", "type", "subtype", "repetition", "result", "takes", "videoComplete", "videoDurationMs", "audioDurationMs"]),
  hasClip: !!t?.clipFile,
  hasVideo: !!t?.videoFile,
  hasAnswers: !!t?.questionnaireAnswers,
});

// Staff comments, plus QC system notes. Any other system note (a participant
// edit names the edited fields) is dropped.
const QC_NOTE = /^set review to /;
export const comments = (rows) =>
  list(rows)
    .filter((c) => !c.system || QC_NOTE.test(String(c.text ?? "")))
    .map((c) => ({ id: c.id, author: c.name ?? null, at: c.at ?? null, text: c.text, kind: c.system ? "qc" : "comment" }));

const TECHNICAL_KEYS = ["deviceId", "appVersion", "configVersion"];

export const recordingDetail = (d) => ({
  ...pick(d, RECORDING_ROW_KEYS),
  ...pick(d, ["recovered", "interruptions", "timelineUsed", "captureFormat", "sampleRate"]),
  participant: participant(d.participant),
  tasks: list(d.tasks).map(recordingTask),
  comments: comments(d.comments),
  // Technical details only for users the master picked, as on the recording page.
  ...(d.showTechnical
    ? { ...pick(d, TECHNICAL_KEYS), checks: list(d.checks).map((c) => pick(c, ["key", "result"])) }
    : {}),
});

export const summary = (s) => ({
  ...pick(s, ["week", "last30", "total", "invalid", "needsReview", "attention", "unreviewed", "lastUpload", "days", "unassigned_devices"]),
  perDay: list(s.perDay).map((d) => pick(d, ["date", "count", "invalid"])),
  byProtocol: list(s.byProtocol).map((p) => pick(p, ["protocol", "count"])),
  byClinic: list(s.bySite).map((c) => pick(c, ["id", "name", "count"])),
});

// --- computers ---------------------------------------------------------------------

export const computers = (b) => ({
  computers: list(b.devices).map((d) => ({
    ...pick(d, ["id", "installationId", "label", "siteId", "siteName", "appVersion", "lastConfigVersion", "lastConfigAt",
      "lastSeenAt", "pending", "failed", "backlogHidden", "lastUpload", "uploads30", "neverUploaded"]),
    health: pick(d.health, ["key", "label", "reason"]),
  })),
  stats: pick(b.stats, ["devices", "healthy", "silent", "unassigned", "waiting", "failed"]),
});
