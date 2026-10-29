// src/controllers/protocolController.js
import { executeTransaction, executeQuery } from '../db/queryHelper.js';
import { logToFile } from '../utils/logger.js';
import { toIso } from '../utils/dateIso.js';
import { bumpConfigVersionForProject } from '../utils/configVersionBump.js';
import { getVisibleProjectIds, getEditableProjectIds, canUseLibrary } from '../utils/accessScope.js';
import { isLegacyDescription, cleanDescription } from '../utils/legacyDescription.js';
import { validateFileNameTemplate, isValidHttpUrl, DEFAULT_RECORDINGS_FILE_NAME } from '../utils/fieldValidation.js';

// A protocol belongs to exactly one study (protocols.project_id). Library
// entries are the exception: project_id is NULL, they never reach a desktop
// config, and who may touch them follows the library rule (anyone who writes
// protocols may read, the author and master may change).
//
// Errors: 400 { error: "<snake_case>" } for validation, 403 for a visible but
// not editable record, 404 for a record out of scope.

const isMasterReq = (req) => req.admin?.role === 'master';

// tasks.id is a signed INT: anything above 2147483647 would be a MySQL out-of-range 500
const MAX_INT = 2147483647;
const isTaskId = (v) =>
  (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_INT) ||
  (typeof v === 'string' && /^[1-9]\d{0,9}$/.test(v) && Number(v) <= MAX_INT);

const normalizeProjectId = (v) => (v == null || v === '' ? null : Number(v));

// The author of a library entry group is whoever created its first version.
// Answers 404/403 itself when the caller may not change the group and returns
// false; true when it may.
async function requireLibraryWrite(req, res, groupId) {
  const rows = await executeQuery(
    `SELECT project_id, created_by FROM protocols WHERE protocol_group_id = ? ORDER BY version ASC, id ASC`,
    [groupId]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'protocol_not_found' });
    return false;
  }
  if (rows.some((r) => r.project_id != null)) {
    // A study's group passed as a library entry. Only a master learns it exists;
    // everyone else gets the same 404 as for a missing group (no id enumeration).
    res.status(isMasterReq(req) ? 403 : 404).json({ error: isMasterReq(req) ? 'wrong_project' : 'protocol_not_found' });
    return false;
  }
  if (isMasterReq(req)) return true;

  const userId = req.admin?.id ?? null;
  if (!(await canUseLibrary(userId))) {
    res.status(404).json({ error: 'protocol_not_found' });
    return false;
  }
  if (Number(rows[0].created_by) !== Number(userId)) {
    res.status(403).json({ error: 'not_author' });
    return false;
  }
  return true;
}

// Study side of the same: 404 when the caller cannot see the study, 403 when
// it is visible (received through a clinic) but not theirs to change.
async function requireStudyWrite(req, res, projectId) {
  const [project] = await executeQuery('SELECT is_active FROM projects WHERE id = ?', [projectId]);
  if (!project) {
    res.status(404).json({ error: 'project_not_found' });
    return false;
  }
  if (!isMasterReq(req)) {
    const userId = req.admin?.id ?? null;
    const visible = await getVisibleProjectIds(userId);
    if (!visible.includes(projectId)) {
      res.status(404).json({ error: 'project_not_found' });
      return false;
    }
    const editable = await getEditableProjectIds(userId);
    if (!editable.includes(projectId)) {
      res.status(403).json({ error: 'not_editor' });
      return false;
    }
  }
  if (project.is_active === 0) {
    res.status(403).json({ error: 'project_inactive' });
    return false;
  }
  return true;
}

// MySQL 1452 on protocol_tasks.task_id: the message names the `protocol_tasks` table and the
// FOREIGN KEY (`task_id`) column (the FK is unnamed in create_tables.sql, so only the column is stable).
const isTaskForeignKey = (err) =>
  /`protocol_tasks`[\s\S]*FOREIGN KEY \(`task_id`\)/.test(String(err.sqlMessage || err.message || ''));

// POST /protocols (create, and save a new version)
export const saveProtocol = async (req, res) => {
  const {
    protocol_group_id, name, language_id, description, version,
    created_by, updated_by, tasks, project_id, editingMode,
    randomization, required_identifiers, info_text,
    instructions_text, use_audio_guide,
    recordings_file_name, instructions_pdf_url
  } = req.body;

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: 'no_tasks' });
  }
  // protocol_tasks.task_id is NOT NULL with a foreign key; a task without a real
  // id would fail inside the transaction as a 500 (F-086).
  const badTask = tasks.findIndex((t) => !isTaskId(t?.task_id));
  if (badTask !== -1) return res.status(400).json({ error: 'task_invalid', index: badTask });

  // Desktop-app fields. Identifier names are accepted in both stored shapes
  // (objects, or legacy string ids) -- the mapping layer normalizes them.
  const identifierNames = (Array.isArray(required_identifiers) ? required_identifiers : [])
    .map((f) => (typeof f === 'string' ? f : f?.name))
    .filter(Boolean);
  const templateError = validateFileNameTemplate(
    recordings_file_name || DEFAULT_RECORDINGS_FILE_NAME, identifierNames
  );
  if (templateError) return res.status(400).json({ error: 'file_name_template_invalid', detail: templateError });
  if (instructions_pdf_url && !isValidHttpUrl(instructions_pdf_url)) {
    return res.status(400).json({ error: 'instructions_pdf_url_invalid' });
  }

  const projectId = normalizeProjectId(project_id);
  if (projectId !== null && !Number.isInteger(projectId)) {
    return res.status(400).json({ error: 'project_id_invalid' });
  }

  // Authorisation. A study protocol is shared by every clinic running the
  // study, so writing one needs an explicit project_editors row; read access
  // inherited through a clinic carries no right to change what the study's
  // other clinics run. A save without a project_id is only valid on an
  // existing library entry (entries are created by sharing, not here).
  if (projectId === null) {
    if (!protocol_group_id) return res.status(400).json({ error: 'project_required' });
    if (!(await requireLibraryWrite(req, res, protocol_group_id))) return;
  } else if (!(await requireStudyWrite(req, res, projectId))) {
    return;
  }

  // Authorship comes from the verified session, not from the payload, so a
  // change cannot be attributed to someone else.
  const authorId = req.admin?.id ?? created_by ?? updated_by ?? null;

  // Identify the primary language the admin was actually editing/creating in the UI
  const sourceLanguageId = Array.isArray(language_id) ? language_id[0] : (language_id || 1);
  // Ensure language_id is an array so we can process it
  const requestLangs = Array.isArray(language_id) ? language_id : [language_id || 1];

  // 1. UNIQUE NAME CHECK. Names are unique within a study (and among library
  // entries), no longer globally: uploads are matched by study name plus
  // protocol name.
  // Editing checks the current rows of every *other* group too, so a rename
  // can't collide (library entries have project_id NULL, which the unique index
  // can't police).
  {
    const placeholders = requestLangs.map(() => '?').join(',');
    const existing = await executeQuery(
      editingMode && protocol_group_id
        ? `SELECT id FROM protocols
           WHERE LOWER(name) = LOWER(?)
           AND project_id <=> ?
           AND is_current = 1 AND is_archived = 0
           AND protocol_group_id <> ?
           AND language_id IN (${placeholders})`
        : `SELECT id FROM protocols
           WHERE LOWER(name) = LOWER(?)
           AND project_id <=> ?
           AND version = 1
           AND language_id IN (${placeholders})`,
      editingMode && protocol_group_id
        ? [name, projectId, protocol_group_id, ...requestLangs]
        : [name, projectId, ...requestLangs]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'name_taken' });
    }
  }

  // 2. THE GROUP MUST BELONG TO THE PROJECT BEING SAVED TO.
  // Authorising project_id alone is not enough: the edit path below operates on
  // protocol_group_id, flipping is_current = 0 on whatever it finds there. A
  // caller with rights on one project could otherwise pass another project's
  // group and retire its live protocol -- which drops it out of v_site_protocols
  // and stops every clinic on that project from receiving it. This is an
  // integrity check as much as an authorisation one, so it applies to masters
  // too; a group with no rows yet is a new group and passes.
  if (protocol_group_id) {
    const groupRows = await executeQuery(
      `SELECT project_id, is_current, is_archived FROM protocols WHERE protocol_group_id = ?`,
      [protocol_group_id]
    );
    if (groupRows.some((r) => normalizeProjectId(r.project_id) !== projectId)) {
      // 404 for non-masters: the group belongs to a study they may not see.
      return isMasterReq(req)
        ? res.status(403).json({ error: 'wrong_project' })
        : res.status(404).json({ error: 'protocol_not_found' });
    }
    // Saving writes fresh rows with is_archived = 0, which would silently revive
    // an archived protocol or a withdrawn library entry. Restore it first.
    const current = groupRows.filter((r) => Number(r.is_current) === 1);
    if (current.length > 0 && current.every((r) => Number(r.is_archived) === 1)) {
      return res.status(400).json({ error: 'protocol_archived' });
    }
  }

  try {
    const primary_protocol_id = await executeTransaction(async (conn) => {
      let groupId = protocol_group_id;
      if (!groupId) {
        const [rows] = await conn.query(`SELECT COALESCE(MAX(protocol_group_id), 0) + 1 AS next_group_id FROM protocols`);
        groupId = rows[0].next_group_id || 1;
      }

      let newVersion = version || 1;
      let syncLangs = [...requestLangs];

      // A new version keeps the library link of the group: a study copy keeps
      // pointing at the library version it came from, a library entry at the
      // study protocol it was shared from.
      let copiedFromId = null;

      if (editingMode) {
        // Get absolute highest version for this group
        const [vRows] = await conn.query(`SELECT MAX(version) as max_v FROM protocols WHERE protocol_group_id = ?`, [groupId]);
        if (vRows[0].max_v) newVersion = vRows[0].max_v + 1;

        const [linkRows] = await conn.query(
          `SELECT copied_from_id FROM protocols WHERE protocol_group_id = ? ORDER BY version DESC, id DESC LIMIT 1`,
          [groupId]
        );
        copiedFromId = linkRows[0]?.copied_from_id ?? null;

        // SMART SYNC: Find ALL currently active languages for this group so we can sync their structure
        const [activeLangs] = await conn.query(
          `SELECT language_id FROM protocols WHERE protocol_group_id = ? AND is_current = 1`,
          [groupId]
        );
        // Merge existing active languages with any NEW languages the admin selected in the UI
        const activeLangIds = activeLangs.map(r => r.language_id);
        syncLangs = Array.from(new Set([...activeLangIds, ...requestLangs]));
      }

      let firstInsertedId = null;

      // 3. LOOP THROUGH EVERY LANGUAGE TO SYNC
      for (const langId of syncLangs) {
        let oldProtocolId = null;
        let oldGlobalContents = {};
        let oldTaskContents = {}; 

        if (editingMode) {
          // Find the old version of THIS SPECIFIC LANGUAGE
          const [currentRows] = await conn.query(
            `SELECT id FROM protocols WHERE protocol_group_id = ? AND language_id = ? AND is_current = 1`,
            [groupId, langId]
          );
          
          if (currentRows.length > 0) {
            oldProtocolId = currentRows[0].id;

            // RESCUE OLD TRANSLATIONS
            const [oldContents] = await conn.query(
              `SELECT pc.protocol_task_id, pc.content_type, pc.text_html, pt.task_id 
               FROM protocol_contents pc
               LEFT JOIN protocol_tasks pt ON pc.protocol_task_id = pt.id
               WHERE pc.protocol_id = ?`,
              [oldProtocolId]
            );

            for (const c of oldContents) {
              if (!c.protocol_task_id) {
                oldGlobalContents[c.content_type] = c.text_html;
              } else {
                if (!oldTaskContents[c.task_id]) oldTaskContents[c.task_id] = {};
                oldTaskContents[c.task_id][c.content_type] = c.text_html;
              }
            }

            // Archive the old version
            await conn.query(`UPDATE protocols SET is_current = 0, updated_at = UTC_TIMESTAMP() WHERE id = ?`, [oldProtocolId]);
          }
        }

        // Insert the new protocol record
        const [result] = await conn.query(
          `INSERT INTO protocols (protocol_group_id, project_id, copied_from_id, name, language_id, description, version, created_by, updated_by, randomization, required_identifiers, use_audio_guide, recordings_file_name, instructions_pdf_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          [groupId, projectId, copiedFromId, name || 'Placeholder Protocol', langId, (typeof description === 'string' && !isLegacyDescription(description) && description.trim()) || null, newVersion, authorId, authorId, JSON.stringify(randomization || {}), JSON.stringify(required_identifiers || []), (use_audio_guide ?? false) ? 1 : 0, recordings_file_name || null, instructions_pdf_url || null]
        );
        const newProtocolId = result.insertId;
        
        // Return the ID of the exact language the admin was actively editing/saving
        if (langId === sourceLanguageId) firstInsertedId = newProtocolId;
        if (!firstInsertedId) firstInsertedId = newProtocolId; // Fallback

        const isSourceLang = (langId === sourceLanguageId);

        // Save GLOBAL content (Rescue old translations if it's a sibling language)
        const finalInfoText = isSourceLang ? info_text : (oldGlobalContents['info'] !== undefined ? oldGlobalContents['info'] : info_text);
        const finalInstructionsText = isSourceLang ? instructions_text : (oldGlobalContents['instructions'] !== undefined ? oldGlobalContents['instructions'] : instructions_text);

        if (typeof finalInfoText === 'string' && finalInfoText.trim() !== '') {
          await conn.query(`INSERT INTO protocol_contents (protocol_id, protocol_task_id, content_type, text_html) VALUES (?, NULL, 'info', ?)`, [newProtocolId, finalInfoText]);
        }

        if (typeof finalInstructionsText === 'string' && finalInstructionsText.trim() !== '') {
          await conn.query(`INSERT INTO protocol_contents (protocol_id, protocol_task_id, content_type, text_html) VALUES (?, NULL, 'instructions', ?)`, [newProtocolId, finalInstructionsText]);
        }

        // Save TASK-SPECIFIC content (Syncing structure, rescuing translations)
        const insertTask = `INSERT INTO protocol_tasks (protocol_id, task_id, task_order, params) VALUES (?, ?, ?, ?)`;
        for (let i = 0; i < tasks.length; i++) {
          const t = tasks[i];
          
          const [taskResult] = await conn.query(insertTask, [newProtocolId, t.task_id, t.task_order || i + 1, JSON.stringify(t.params || {})]);
          const newProtocolTaskId = taskResult.insertId;

          if (t.contents && Array.isArray(t.contents)) {
            for (const content of t.contents) {
               if (content.html && content.html.trim() !== '') {
                  
                  // Translation Rescue Logic
                  let finalHtml = content.html; 
                  if (!isSourceLang && oldTaskContents[t.task_id] && oldTaskContents[t.task_id][content.type] !== undefined) {
                      finalHtml = oldTaskContents[t.task_id][content.type]; // Use old translation
                  }

                  await conn.query(`INSERT INTO protocol_contents (protocol_id, protocol_task_id, content_type, text_html) VALUES (?, ?, ?, ?)`, [newProtocolId, newProtocolTaskId, content.type, finalHtml]);
               }
            }
          }
        }
      }

      return firstInsertedId;
    });

    res.json({ success: true, protocol_id: primary_protocol_id });
  } catch (err) {
    logToFile("ERROR", "Failed to save protocol", {
      protocolName: name,
      protocolGroupId: protocol_group_id,
      error: err.message,
      stack: err.stack
    });
    if (err.errno === 1062 || err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'name_taken' });
    }
    // A task id that is no row in `tasks` (foreign key on protocol_tasks.task_id)
    // (other foreign keys, e.g. language_id, keep the generic 500 below)
    if ((err.errno === 1452 || err.code === 'ER_NO_REFERENCED_ROW_2') && isTaskForeignKey(err)) {
      return res.status(400).json({ error: 'task_invalid' });
    }
    res.status(500).json({ error: 'protocol_save_failed' });
 }
};

const parseJson = (raw, fallback) => {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
};

// Loads a protocol row plus its contents and ordered tasks — the common core
// shared by the admin editor fetch below and the site config endpoint
// (siteController.js). Returns null when the protocol doesn't exist.
export async function assembleProtocol(protocolId) {
  const protocolRows = await executeQuery(
    `SELECT * FROM protocols WHERE id = ?`,
    [protocolId]
  );
  if (protocolRows.length === 0) return null;

  const protocol = protocolRows[0];
  protocol.randomization = parseJson(protocol.randomization, {});
  protocol.required_identifiers = parseJson(protocol.required_identifiers, []) || [];

  const contents = await executeQuery(
    `SELECT protocol_task_id, content_type, text_html FROM protocol_contents WHERE protocol_id = ?`,
    [protocolId]
  );

  const contentMap = contents.reduce((acc, c) => {
    const key = c.protocol_task_id || 'global';
    if (!acc[key]) acc[key] = [];
    acc[key].push({ type: c.content_type, html: c.text_html });
    return acc;
  }, {});

  // Maps 'info' -> 'info_text' and 'consent' -> 'consent_text' (legacy root fields)
  const globalFields = {};
  (contentMap['global'] || []).forEach(c => {
    globalFields[`${c.type}_text`] = c.html;
  });

  const taskRows = await executeQuery(
    `SELECT id, task_id, task_order, params FROM protocol_tasks WHERE protocol_id = ? ORDER BY task_order ASC`,
    [protocolId]
  );

  const tasks = taskRows.map(t => ({
    ...t,
    params: parseJson(t.params, {}),
    contents: contentMap[t.id] || []
  }));

  return { protocol, contentMap, globalFields, tasks };
}

// Who may read a protocol row. Master always. A library entry follows the
// library rule (anyone who writes protocols, and withdrawn entries are gone for
// everyone but master). A study protocol follows study visibility. Out of scope
// is a 404, so a protocol's existence is not confirmed to people who cannot see
// it. assembleProtocol itself stays unscoped -- it is shared with the
// token-gated /site-config endpoint.
async function canReadProtocol(req, protocol) {
  if (isMasterReq(req)) return true;
  const userId = req.admin?.id ?? null;
  if (protocol.project_id == null) {
    return !protocol.is_archived && (await canUseLibrary(userId));
  }
  const visible = await getVisibleProjectIds(userId);
  return visible.includes(Number(protocol.project_id));
}

async function canWriteProtocol(req, protocol) {
  if (isMasterReq(req)) return true;
  const userId = req.admin?.id ?? null;
  if (protocol.project_id == null) {
    const [first] = await executeQuery(
      `SELECT created_by FROM protocols WHERE protocol_group_id = ? ORDER BY version ASC, id ASC LIMIT 1`,
      [protocol.protocol_group_id]
    );
    return first != null && Number(first.created_by) === Number(userId);
  }
  const editable = await getEditableProjectIds(userId);
  return editable.includes(Number(protocol.project_id));
}

// GET /protocols/:id
export const getProtocolById = async (req, res) => {
  const { id } = req.params;

  try {
    const assembled = await assembleProtocol(id);
    if (!assembled) {
      return res.status(404).json({ error: 'protocol_not_found' });
    }
    const { protocol, contentMap, globalFields, tasks } = assembled;

    if (!(await canReadProtocol(req, protocol))) {
      return res.status(404).json({ error: 'protocol_not_found' });
    }
    const canEdit = await canWriteProtocol(req, protocol);

    // Fetch all active sibling languages for this protocol group
    const siblingRows = await executeQuery(
      `SELECT l.code, p.id as protocol_id
       FROM protocols p
       JOIN languages l ON p.language_id = l.id
       WHERE p.protocol_group_id = ? AND p.is_current = 1`,
      [protocol.protocol_group_id]
    );

    // Sort the languages so the one we are actively fetching is first in the array
    const primaryLangRow = siblingRows.find(row => row.protocol_id === parseInt(id));
    const primaryCode = primaryLangRow ? primaryLangRow.code : 'en';
    const otherCodes = siblingRows.filter(row => row.protocol_id !== parseInt(id)).map(r => r.code);
    const finalLanguageArray = [primaryCode, ...otherCodes];

    // Spread globalFields into the result so the frontend sees .info_text
    res.json({
      ...protocol,
      description: cleanDescription(protocol.description) ?? null,
      created_at: toIso(protocol.created_at),
      updated_at: toIso(protocol.updated_at),
      language: finalLanguageArray,
      ...globalFields, // RESTORES info_text and consent_text
      global_contents: contentMap['global'] || [],
      tasks,
      can_edit: canEdit
    });

  } catch (err) {
    logToFile("ERROR", "Failed to fetch protocol by ID", {
      protocolId: id,
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'protocol_load_failed' });
  }
};

const truthyFlag = (v) => v === '1' || v === 1 || v === true || v === 'true';

// GET /projects/:id/protocols?archived=0|1
// One item per protocol group (the current version of each language variant),
// with languages[] listing the variants. Library entries (project_id NULL) are
// never included. The study id comes from the path; ?project_id= is read as a
// fallback until the route is rewired.
export const getProtocolsByProjectId = async (req, res) => {
  const projectId = normalizeProjectId(req.params?.id ?? req.query?.project_id);
  if (projectId === null || !Number.isInteger(projectId)) {
    return res.status(400).json({ error: 'project_required' });
  }
  const archived = truthyFlag(req.query?.archived) ? 1 : 0;

  try {
    if (!isMasterReq(req)) {
      const visible = await getVisibleProjectIds(req.admin?.id ?? null);
      if (!visible.includes(projectId)) {
        return res.status(404).json({ error: 'project_not_found' });
      }
    }

    const rows = await executeQuery(
      `SELECT
         p.id, p.protocol_group_id, p.project_id, p.name, p.language_id, l.code AS language_code,
         p.description, p.version, p.is_current, p.is_archived,
         p.created_at, p.created_by, p.updated_at, p.updated_by,
         p.copied_from_id, src.name AS copied_from_name, src.version AS copied_from_version,
         (SELECT lib.id FROM protocols lib
            JOIN protocols origin ON origin.id = lib.copied_from_id
           WHERE lib.project_id IS NULL AND lib.is_current = 1 AND lib.is_archived = 0
             AND origin.protocol_group_id = p.protocol_group_id
           ORDER BY lib.id DESC LIMIT 1) AS library_entry_id,
         COALESCE(agg.n_tasks, 0) AS n_tasks,
         COALESCE(agg.n_quest, 0) AS n_quest
       FROM protocols p
       JOIN languages l ON l.id = p.language_id
       LEFT JOIN protocols src ON src.id = p.copied_from_id
       LEFT JOIN (
         SELECT pt.protocol_id,
           SUM(IF(t.category != 'questionnaire', 1, 0)) AS n_tasks,
           SUM(IF(t.category = 'questionnaire', 1, 0)) AS n_quest
         FROM protocol_tasks pt
         JOIN tasks t ON pt.task_id = t.id
         GROUP BY pt.protocol_id
       ) agg ON agg.protocol_id = p.id
       WHERE p.project_id = ? AND p.is_current = 1 AND p.is_archived = ?
       ORDER BY p.protocol_group_id, p.language_id`,
      [projectId, archived]
    );

    const groups = new Map();
    for (const r of rows) {
      let g = groups.get(r.protocol_group_id);
      // DB datetimes are zoneless UTC strings; the API sends ISO-8601 UTC (F-067).
      const updatedAt = toIso(r.updated_at);
      if (!g) {
        g = { ...r, description: cleanDescription(r.description) ?? null, created_at: toIso(r.created_at), updated_at: updatedAt, languages: [] };
        groups.set(r.protocol_group_id, g);
      }
      g.languages.push({ language_id: r.language_id, code: r.language_code, protocol_id: r.id });
      if (updatedAt && (!g.updated_at || updatedAt > g.updated_at)) g.updated_at = updatedAt;
    }
    res.json([...groups.values()]);
  } catch (err) {
    logToFile("ERROR", "Failed to fetch protocols by projectId", {
      projectId,
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'protocols_load_failed' });
  }
};

// POST /protocols/:id/archive
// Archives every current-language variant of the protocol's group. The rows
// keep their project_id, but is_archived takes them out of v_site_protocols, so
// clinics stop receiving them. For a library entry this is the same switch the
// withdraw endpoint uses.
export const archiveProtocol = async (req, res) => {
  const { id } = req.params;

  try {
    const [protocol] = await executeQuery(
      "SELECT protocol_group_id, project_id, is_archived FROM protocols WHERE id = ?",
      [id]
    );
    if (!protocol) {
      return res.status(404).json({ error: 'protocol_not_found' });
    }

    // Unseen protocols get the 404 getProtocolById gives; visible but not
    // editable ones a 403.
    if (!(await canReadProtocol(req, protocol))) {
      return res.status(404).json({ error: 'protocol_not_found' });
    }
    if (!(await canWriteProtocol(req, protocol))) {
      return res.status(403).json({ error: protocol.project_id == null ? 'not_author' : 'not_editor' });
    }
    // An archived study is read-only, as in saveProtocol.
    if (protocol.project_id != null) {
      const [project] = await executeQuery('SELECT is_active FROM projects WHERE id = ?', [protocol.project_id]);
      if (project?.is_active === 0) return res.status(403).json({ error: 'project_inactive' });
    }

    await executeTransaction(async (conn) => {
      await conn.query(
        `UPDATE protocols SET is_archived = 1, updated_at = UTC_TIMESTAMP()
         WHERE protocol_group_id = ? AND is_current = 1`,
        [protocol.protocol_group_id]
      );
    });
    // Archived rows drop out of v_site_protocols, so their newer updated_at no longer counts.
    await bumpConfigVersionForProject(protocol.project_id);

    res.json({ success: true });
  } catch (err) {
    logToFile("ERROR", "Failed to archive protocol", {
      protocolId: id,
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'protocol_archive_failed' });
  }
};
