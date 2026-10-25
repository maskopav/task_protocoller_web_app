// src/controllers/libraryController.js
//
// The protocol library (spec 4, 6.10, 8.3). A library entry is a protocol with
// project_id NULL. It is never linked to a study and never reaches a config.
// Every transfer is a COPY: a new protocol_group_id, version 1 (study copies),
// and copied_from_id pointing at the row it came from.
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import {
  canEditProject,
  canUseLibrary,
  getVisibleProjectIds,
} from "../utils/accessScope.js";
import { logToFile } from "../utils/logger.js";
import { assembleProtocol } from "./protocolController.js";

const isMaster = (req) => req.admin?.role === "master";
const userIdOf = (req) => req.admin?.id ?? null;

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const fail = (res, err, what, ctx = {}) => {
  logToFile("ERROR", `Failed to ${what}`, { ...ctx, error: err.message, stack: err.stack });
  res.status(500).json({ error: "internal" });
};

// Master, or anyone who may write protocols. Sends the 403 itself.
async function requireLibraryAccess(req, res) {
  if (isMaster(req) || (await canUseLibrary(userIdOf(req)))) return true;
  res.status(403).json({ error: "forbidden" });
  return false;
}

// Editing rights on a study; 404 when the study is out of scope, 403 when it is
// visible but not editable. Returns true when the caller may proceed.
async function requireEditableStudy(req, res, projectId) {
  if (isMaster(req)) return true;
  const userId = userIdOf(req);
  if (await canEditProject(userId, projectId)) return true;
  const visible = await getVisibleProjectIds(userId);
  if (visible.includes(projectId)) res.status(403).json({ error: "forbidden" });
  else res.status(404).json({ error: "not_found" });
  return false;
}

const cleanName = (v) => (typeof v === "string" ? v.trim() : "");
const NAME_MAX = 100;

/**
 * Copies one protocol row with its tasks and contents inside a transaction.
 * INSERT ... SELECT keeps the JSON columns byte-for-byte.
 * @returns {Promise<number>} the id of the new row
 */
export async function cloneProtocolRow(conn, sourceId, o) {
  const [ins] = await conn.query(
    `INSERT INTO protocols
       (protocol_group_id, name, language_id, description, version, is_current, created_by, updated_by,
        randomization, use_audio_guide, required_identifiers, recordings_file_name, instructions_pdf_url,
        project_id, copied_from_id, created_at, updated_at)
     SELECT ?, ?, language_id, description, ?, 1, ?, ?,
            randomization, use_audio_guide, required_identifiers, recordings_file_name, instructions_pdf_url,
            ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()
     FROM protocols WHERE id = ?`,
    [o.groupId, o.name, o.version, o.createdBy, o.updatedBy, o.projectId, o.copiedFromId, sourceId]
  );
  const newId = ins.insertId;

  const [tasks] = await conn.query(
    `SELECT id FROM protocol_tasks WHERE protocol_id = ? ORDER BY task_order`,
    [sourceId]
  );
  const taskMap = new Map();
  for (const t of tasks) {
    const [r] = await conn.query(
      `INSERT INTO protocol_tasks (protocol_id, task_id, task_order, params)
       SELECT ?, task_id, task_order, params FROM protocol_tasks WHERE id = ?`,
      [newId, t.id]
    );
    taskMap.set(t.id, r.insertId);
  }
  const [contents] = await conn.query(
    `SELECT protocol_task_id, content_type, text_html FROM protocol_contents WHERE protocol_id = ?`,
    [sourceId]
  );
  for (const c of contents) {
    await conn.query(
      `INSERT INTO protocol_contents (protocol_id, protocol_task_id, content_type, text_html) VALUES (?, ?, ?, ?)`,
      [newId, c.protocol_task_id == null ? null : taskMap.get(c.protocol_task_id) ?? null, c.content_type, c.text_html]
    );
  }
  return newId;
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (m) => "\\" + m);

// GET /library?q=&lang=&mine=1
export const listLibrary = async (req, res) => {
  try {
    if (!(await requireLibraryAccess(req, res))) return;
    const where = ["p.project_id IS NULL", "p.is_current = 1", "p.is_archived = 0"];
    const params = [];
    if (req.query?.mine === "1" || req.query?.mine === "true") {
      where.push("p.created_by = ?");
      params.push(userIdOf(req));
    }
    const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";
    if (q) {
      where.push("(p.name LIKE ? OR p.description LIKE ?)");
      params.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`);
    }
    const rows = await executeQuery(
      `SELECT p.id, p.protocol_group_id, p.name, p.description, p.version, p.updated_at, p.created_by,
              u.full_name AS author, l.code AS language_code,
              (SELECT COUNT(*) FROM protocol_tasks pt WHERE pt.protocol_id = p.id) AS n_tasks,
              (SELECT COUNT(DISTINCT c.project_id)
                 FROM protocols c JOIN protocols lib ON lib.id = c.copied_from_id
                WHERE lib.protocol_group_id = p.protocol_group_id AND lib.project_id IS NULL
                  AND c.project_id IS NOT NULL) AS used_in
       FROM protocols p
       JOIN languages l ON l.id = p.language_id
       LEFT JOIN users u ON u.id = p.created_by
       WHERE ${where.join(" AND ")}
       ORDER BY p.updated_at DESC, p.id`,
      params
    );

    const groups = new Map();
    for (const r of rows) {
      let g = groups.get(r.protocol_group_id);
      if (!g) {
        g = {
          id: r.id,
          protocol_group_id: r.protocol_group_id,
          name: r.name,
          description: r.description ?? null,
          version: r.version,
          languages: [],
          protocol_ids: {},
          n_tasks: Number(r.n_tasks) || 0,
          author: r.author ?? null,
          used_in: Number(r.used_in) || 0,
          updated_at: r.updated_at,
          is_author: r.created_by != null && Number(r.created_by) === userIdOf(req),
        };
        groups.set(r.protocol_group_id, g);
      }
      g.languages.push(r.language_code);
      g.protocol_ids[r.language_code] = r.id;
    }
    let list = [...groups.values()];
    const lang = typeof req.query?.lang === "string" ? req.query.lang : "";
    if (lang) list = list.filter((g) => g.languages.includes(lang));
    res.json(list);
  } catch (err) {
    fail(res, err, "list library");
  }
};

// Loads a live (not withdrawn) library row, or answers 404.
async function loadEntry(req, res) {
  const id = parseId(req.params.id);
  const rows = id
    ? await executeQuery(
        `SELECT id, protocol_group_id, name, created_by FROM protocols
         WHERE id = ? AND project_id IS NULL AND is_archived = 0`,
        [id]
      )
    : [];
  if (rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  return rows[0];
}

const isAuthor = (req, entry) =>
  isMaster(req) || (entry.created_by != null && Number(entry.created_by) === userIdOf(req));

// GET /library/:id
export const getLibraryEntry = async (req, res) => {
  try {
    if (!(await requireLibraryAccess(req, res))) return;
    const entry = await loadEntry(req, res);
    if (!entry) return;
    const assembled = await assembleProtocol(entry.id);
    if (!assembled) return res.status(404).json({ error: "not_found" });
    const { protocol, contentMap, globalFields, tasks } = assembled;

    const [siblings, meta] = await Promise.all([
      executeQuery(
        `SELECT l.code, p.id AS protocol_id FROM protocols p JOIN languages l ON l.id = p.language_id
         WHERE p.protocol_group_id = ? AND p.project_id IS NULL AND p.is_current = 1 AND p.is_archived = 0`,
        [entry.protocol_group_id]
      ),
      executeQuery(
        `SELECT u.full_name AS author,
                (SELECT COUNT(DISTINCT c.project_id)
                   FROM protocols c JOIN protocols lib ON lib.id = c.copied_from_id
                  WHERE lib.protocol_group_id = ? AND lib.project_id IS NULL
                    AND c.project_id IS NOT NULL) AS used_in
         FROM protocols p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = ?`,
        [entry.protocol_group_id, entry.id]
      ),
    ]);
    const own = siblings.find((s) => Number(s.protocol_id) === Number(entry.id));
    const codes = [own?.code, ...siblings.filter((s) => s !== own).map((s) => s.code)].filter(Boolean);

    res.json({
      ...protocol,
      language: codes,
      ...globalFields,
      global_contents: contentMap.global || [],
      tasks,
      author: meta[0]?.author ?? null,
      used_in: Number(meta[0]?.used_in) || 0,
      can_edit: isAuthor(req, entry),
    });
  } catch (err) {
    fail(res, err, "get library entry", { id: req.params.id });
  }
};

// POST /protocols/:id/share
export const shareProtocol = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const srcRows = id
      ? await executeQuery(
          `SELECT id, protocol_group_id, name, project_id FROM protocols WHERE id = ?`,
          [id]
        )
      : [];
    // A library entry is not a study protocol, so it cannot be shared again.
    if (srcRows.length === 0 || srcRows[0].project_id == null) {
      return res.status(404).json({ error: "not_found" });
    }
    const src = srcRows[0];
    const projectId = Number(src.project_id);
    if (!(await requireEditableStudy(req, res, projectId))) return;

    const variants = await executeQuery(
      `SELECT id FROM protocols
       WHERE protocol_group_id = ? AND project_id = ? AND is_current = 1 AND is_archived = 0
       ORDER BY id`,
      [src.protocol_group_id, projectId]
    );
    if (variants.length === 0) return res.status(404).json({ error: "not_found" });

    // Shared before? The entry points back at a protocol of this group.
    const prior = await executeQuery(
      `SELECT DISTINCT lib.protocol_group_id, lib.created_by
       FROM protocols lib JOIN protocols s ON s.id = lib.copied_from_id
       WHERE lib.project_id IS NULL AND lib.is_archived = 0 AND s.protocol_group_id = ?
       LIMIT 1`,
      [src.protocol_group_id]
    );
    const existing = prior[0] ?? null;
    if (existing && !isAuthor(req, existing)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const clash = await executeQuery(
      `SELECT id FROM protocols
       WHERE project_id IS NULL AND is_archived = 0 AND LOWER(name) = LOWER(?) AND protocol_group_id <> ?
       LIMIT 1`,
      [src.name, existing ? existing.protocol_group_id : 0]
    );
    if (clash.length > 0) return res.status(400).json({ error: "name_taken" });

    const userId = userIdOf(req);
    const out = await executeTransaction(async (conn) => {
      let groupId;
      let version = 1;
      if (existing) {
        groupId = existing.protocol_group_id;
        const [v] = await conn.query(
          `SELECT MAX(version) AS max_v FROM protocols WHERE protocol_group_id = ?`, [groupId]);
        version = (Number(v[0]?.max_v) || 0) + 1;
        await conn.query(
          `UPDATE protocols SET is_current = 0, updated_at = UTC_TIMESTAMP()
           WHERE protocol_group_id = ? AND project_id IS NULL AND is_current = 1`,
          [groupId]
        );
      } else {
        const [g] = await conn.query(`SELECT COALESCE(MAX(protocol_group_id), 0) + 1 AS next_id FROM protocols`);
        groupId = g[0].next_id;
      }
      let first = null;
      for (const v of variants) {
        const newId = await cloneProtocolRow(conn, v.id, {
          groupId, name: src.name, version, projectId: null, copiedFromId: v.id,
          createdBy: existing?.created_by ?? userId, updatedBy: userId,
        });
        if (first === null || Number(v.id) === Number(src.id)) first = newId;
      }
      return { protocol_id: first, protocol_group_id: groupId, version };
    });
    res.status(existing ? 200 : 201).json({ ...out, updated: !!existing });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(400).json({ error: "name_taken" });
    fail(res, err, "share protocol", { id: req.params.id });
  }
};

// POST /library/:id/copy  { project_id, name } -> { protocol_id }
export const copyFromLibrary = async (req, res) => {
  try {
    if (!(await requireLibraryAccess(req, res))) return;
    const entry = await loadEntry(req, res);
    if (!entry) return;

    const projectId = parseId(req.body?.project_id);
    if (!projectId) return res.status(400).json({ error: "invalid_project" });
    const name = cleanName(req.body?.name ?? entry.name);
    if (name === "" || name.length > NAME_MAX) return res.status(400).json({ error: "invalid_name" });

    const proj = await executeQuery(`SELECT id, is_active FROM projects WHERE id = ?`, [projectId]);
    if (proj.length === 0) return res.status(404).json({ error: "not_found" });
    if (!(await requireEditableStudy(req, res, projectId))) return;
    if (Number(proj[0].is_active) === 0) return res.status(403).json({ error: "project_inactive" });

    const taken = await executeQuery(
      `SELECT id FROM protocols WHERE project_id = ? AND LOWER(name) = LOWER(?) LIMIT 1`,
      [projectId, name]
    );
    if (taken.length > 0) return res.status(400).json({ error: "name_taken" });

    const variants = await executeQuery(
      `SELECT id FROM protocols
       WHERE protocol_group_id = ? AND project_id IS NULL AND is_current = 1 AND is_archived = 0
       ORDER BY id`,
      [entry.protocol_group_id]
    );
    if (variants.length === 0) return res.status(404).json({ error: "not_found" });

    const userId = userIdOf(req);
    const protocolId = await executeTransaction(async (conn) => {
      const [g] = await conn.query(`SELECT COALESCE(MAX(protocol_group_id), 0) + 1 AS next_id FROM protocols`);
      let first = null;
      for (const v of variants) {
        const newId = await cloneProtocolRow(conn, v.id, {
          groupId: g[0].next_id, name, version: 1, projectId, copiedFromId: v.id,
          createdBy: userId, updatedBy: userId,
        });
        if (first === null || Number(v.id) === Number(entry.id)) first = newId;
      }
      return first;
    });
    res.status(201).json({ protocol_id: protocolId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(400).json({ error: "name_taken" });
    fail(res, err, "copy library entry", { id: req.params.id });
  }
};

// POST /library/:id/withdraw — author or master. Copies in studies stay.
export const withdrawEntry = async (req, res) => {
  try {
    if (!(await requireLibraryAccess(req, res))) return;
    const entry = await loadEntry(req, res);
    if (!entry) return;
    if (!isAuthor(req, entry)) return res.status(403).json({ error: "forbidden" });
    await executeQuery(
      `UPDATE protocols SET is_archived = 1, updated_at = UTC_TIMESTAMP()
       WHERE protocol_group_id = ? AND project_id IS NULL`,
      [entry.protocol_group_id]
    );
    res.json({ success: true });
  } catch (err) {
    fail(res, err, "withdraw library entry", { id: req.params.id });
  }
};
