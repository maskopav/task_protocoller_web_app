// src/mcp/protocolPreview.js
//
// Preview, then confirm, for protocol writes (docs/mcp/01_spec.md section 6).
// A preview runs exactly the checks of the real write (prepareProtocolSave /
// prepareLibraryCopy) and reads what would change. It writes nothing.
import { executeQuery } from "../db/queryHelper.js";
import { getVisibleSiteIds } from "../utils/accessScope.js";
import { prepareProtocolSave, assembleProtocol } from "../controllers/protocolController.js";
import { prepareLibraryCopy } from "../controllers/libraryController.js";

// Run a prepare* function as a controller: 200 with its context, or its own error.
const asHandler = (prepare) => async (req, res) => {
  const ctx = await prepare(req, res);
  if (ctx?.ok) res.status(200).json(ctx);
};

/** Clinics whose computers receive the study's protocols: the total, and the ones you can see by name. */
export async function affectedClinics(admin, projectId) {
  if (projectId == null) return { total: 0, visible: [], note: "Library entries are templates and never reach a computer." };
  const rows = await executeQuery(
    `SELECT s.id, s.name FROM site_projects sp JOIN sites s ON s.id = sp.site_id WHERE sp.project_id = ? ORDER BY s.name`,
    [projectId]
  );
  const mine = admin.role === "master" ? null : new Set(await getVisibleSiteIds(admin.id));
  return {
    total: rows.length,
    visible: rows.filter((r) => !mine || mine.has(Number(r.id))).map((r) => ({ id: Number(r.id), name: r.name })),
  };
}

const norm = (v) => JSON.stringify(v ?? null);
const bool = (v) => !!Number(v) || v === true;
const taskKey = (t) => norm({ task_id: Number(t.task_id), params: t.params ?? {}, contents: (t.contents ?? []).map((c) => ({ type: c.type, html: c.html })) });

/** What a save changes against the current version: changed fields and task positions. */
export function diffProtocol(current, body) {
  const p = current.protocol;
  const before = {
    name: p.name,
    description: p.description ?? null,
    randomization: p.randomization ?? {},
    required_identifiers: p.required_identifiers ?? [],
    use_audio_guide: bool(p.use_audio_guide),
    recordings_file_name: p.recordings_file_name ?? null,
    instructions_pdf_url: p.instructions_pdf_url ?? null,
    info_text: current.globalFields?.info_text ?? null,
    instructions_text: current.globalFields?.instructions_text ?? null,
  };
  const after = {
    name: body.name,
    description: body.description ?? null,
    randomization: body.randomization ?? {},
    required_identifiers: body.required_identifiers ?? [],
    use_audio_guide: !!body.use_audio_guide,
    recordings_file_name: body.recordings_file_name ?? null,
    instructions_pdf_url: body.instructions_pdf_url ?? null,
    info_text: body.info_text ?? null,
    instructions_text: body.instructions_text ?? null,
  };
  const fields = {};
  for (const k of Object.keys(before)) if (norm(before[k]) !== norm(after[k])) fields[k] = { from: before[k], to: after[k] };

  const old = current.tasks ?? [];
  const neu = body.tasks ?? [];
  const changedPositions = [];
  for (let i = 0; i < Math.max(old.length, neu.length); i++) {
    if (!old[i] || !neu[i] || taskKey(old[i]) !== taskKey(neu[i])) changedPositions.push(i + 1);
  }
  return {
    fields,
    tasks: {
      before: old.length,
      after: neu.length,
      changedPositions,
      taskIdsBefore: old.map((t) => Number(t.task_id)),
      taskIdsAfter: neu.map((t) => Number(t.task_id)),
    },
  };
}

async function groupState(groupId, sourceLanguageId) {
  const [v] = await executeQuery(`SELECT MAX(version) AS v FROM protocols WHERE protocol_group_id = ?`, [groupId]);
  const rows = await executeQuery(
    `SELECT p.id, l.code FROM protocols p JOIN languages l ON l.id = p.language_id
     WHERE p.protocol_group_id = ? AND p.is_current = 1 ORDER BY (p.language_id = ?) DESC, p.id`,
    [groupId, sourceLanguageId]
  );
  return { version: v?.v == null ? null : Number(v.v), currentId: rows[0]?.id ?? null, languages: rows.map((r) => r.code) };
}

/** @returns {Promise<{status, body}>} */
export async function previewProtocolSave(admin, body, call) {
  const r = await call(asHandler(prepareProtocolSave), { admin, body });
  if (r.status !== 200) return r;
  const { projectId, sourceLanguageId } = r.body;
  // The save checks a task id's shape; an id that is no task kind only fails
  // inside its transaction (foreign key). The preview says so up front.
  const taskIds = [...new Set(body.tasks.map((t) => Number(t.task_id)))];
  const known = new Set((await executeQuery(`SELECT id FROM tasks WHERE id IN (?)`, [taskIds])).map((t) => Number(t.id)));
  const unknown = body.tasks.findIndex((t) => !known.has(Number(t.task_id)));
  if (unknown !== -1) return { status: 400, body: { error: "task_invalid", index: unknown } };
  const editing = !!body.protocol_group_id;
  const state = editing ? await groupState(body.protocol_group_id, sourceLanguageId) : null;
  const current = state?.currentId ? await assembleProtocol(state.currentId) : null;
  return {
    status: 200,
    body: {
      preview: true,
      valid: true,
      mode: editing && state?.version != null ? "new_version" : "create",
      baseVersion: state?.version ?? null,
      newVersion: state?.version != null ? state.version + 1 : 1,
      // a new version is written for every active language of the group
      languagesUpdated: state?.languages ?? [],
      diff: current ? diffProtocol(current, body) : null,
      affectedClinics: await affectedClinics(admin, projectId),
      next: "Show this preview to the user. If they agree, call save_protocol again with the same arguments plus confirm: true"
        + (editing ? ` and base_version: ${state?.version ?? "null"}.` : "."),
    },
  };
}

/** The base_version check of a confirmed edit: null when fine, else the tool error. */
export async function checkBaseVersion(body, baseVersion) {
  if (!body.protocol_group_id) return null;
  const { version } = await groupState(body.protocol_group_id, null);
  if (version == null) return null;
  if (baseVersion !== version) return { status: 409, body: { error: "stale_version", currentVersion: version } };
  return null;
}

export async function previewLibraryCopy(admin, entryId, body, call) {
  const r = await call(asHandler(prepareLibraryCopy), { admin, params: { id: String(entryId) }, body });
  if (r.status !== 200) return r;
  const { entry, projectId, name, variants } = r.body;
  return {
    status: 200,
    body: {
      preview: true,
      valid: true,
      entry: { id: Number(entry.id), name: entry.name },
      studyId: projectId,
      name,
      languages: variants.length,
      affectedClinics: await affectedClinics(admin, projectId),
      next: "Show this preview to the user. If they agree, call copy_library_protocol again with the same arguments plus confirm: true.",
    },
  };
}
