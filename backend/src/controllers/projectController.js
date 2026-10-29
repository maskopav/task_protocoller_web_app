// backend/src/controllers/projectController.js
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { firstInvalidEmail } from "../utils/fieldValidation.js";
import { bumpConfigVersionForProject } from "../utils/configVersionBump.js";
import {
  getVisibleProjectIds,
  getEditableProjectIds,
  canCreateProjects,
  ownsRecord,
  scopeWhereClause,
} from "../utils/accessScope.js";

// A "project" is a Study in the UI. Masters see every study; everyone else sees
// the ones accessScope.js resolves (studies they edit plus studies running at
// their clinics). The scope comes from req.admin, never from the client.
//
// Errors: 400 { error: "<snake_case>" } for validation, 403 for a visible study
// the caller may not change, 404 for a study out of scope (never 403, so its
// existence is not leaked).

const isMasterReq = (req) => req.admin?.role === "master";

const parseId = (raw) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// One row per study for the list and the detail read. The old summary-view
// column names stay (project_id, project_name, project_is_active ...) next to
// the new ones, so the pages that still read them keep working while the UI is
// rebuilt; decorate() drops the raw count_sites. site_count is every clinic the
// study runs at, visible_site_count only those the caller can see (F-097).
// Unreviewed counts recordings at clinics the caller sees, so it can never leak
// a clinic's numbers.
async function queryProjects(req, projectIds) {
  const scope = scopeWhereClause(req.admin, "us");
  const siteScope = scopeWhereClause(req.admin, "sp");
  const where = projectIds ? "WHERE s.project_id IN (?)" : "";
  // Placeholders appear in SELECT order: visible clinics, then unreviewed, then the id filter.
  const params = [...siteScope.params, ...scope.params, ...(projectIds ? [projectIds] : [])];

  return executeQuery(
    `SELECT s.*,
            p.id, p.name, p.end_date, p.contact_persons, p.contact_emails,
            p.created_by, u.full_name AS creator_name,
            s.count_sites AS site_count,
            (SELECT COUNT(*) FROM site_projects sp
              WHERE sp.project_id = p.id AND ${siteScope.sql}) AS visible_site_count,
            (SELECT COUNT(DISTINCT pr.protocol_group_id) FROM protocols pr
              WHERE pr.project_id = p.id AND pr.is_current = 1 AND pr.is_archived = 0) AS protocol_count,
            (SELECT COUNT(*) FROM upload_sessions us
              WHERE us.project_id = p.id AND us.qc = 'unreviewed' AND ${scope.sql}) AS unreviewed
     FROM v_project_summary_stats s
     JOIN projects p ON p.id = s.project_id
     LEFT JOIN users u ON u.id = p.created_by
     ${where}
     ORDER BY p.name`,
    params
  );
}

async function decorate(req, rows) {
  const isMaster = isMasterReq(req);
  const userId = req.admin?.id ?? null;
  const editable = isMaster ? [] : await getEditableProjectIds(userId);
  return rows.map(({ count_sites: _rawSiteCount, ...r }) => ({
    ...r,
    site_count: Number(r.site_count),
    visible_site_count: Number(r.visible_site_count),
    protocol_count: Number(r.protocol_count),
    unreviewed: Number(r.unreviewed),
    can_edit: isMaster || editable.includes(Number(r.project_id)),
    is_owner: userId != null && Number(r.created_by) === Number(userId),
  }));
}

// GET /projects
export const getProjectList = async (req, res) => {
  try {
    let ids = null;
    if (!isMasterReq(req)) {
      ids = await getVisibleProjectIds(req.admin?.id ?? null);
      if (ids.length === 0) return res.json([]);
    }
    res.json(await decorate(req, await queryProjects(req, ids)));
  } catch (err) {
    console.error("Error fetching project list:", err);
    res.status(500).json({ error: "projects_fetch_failed" });
  }
};

// GET /projects/:id
export const getProject = async (req, res) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(404).json({ error: "project_not_found" });

  try {
    if (!isMasterReq(req)) {
      const visible = await getVisibleProjectIds(req.admin?.id ?? null);
      if (!visible.includes(id)) return res.status(404).json({ error: "project_not_found" });
    }
    const [row] = await decorate(req, await queryProjects(req, [id]));
    if (!row) return res.status(404).json({ error: "project_not_found" });
    res.json(row);
  } catch (err) {
    console.error("Error fetching project:", err);
    res.status(500).json({ error: "project_fetch_failed" });
  }
};

const isDuplicate = (err) => err?.errno === 1062 || err?.code === "ER_DUP_ENTRY";

// POST /projects
export const createProject = async (req, res) => {
  const { name, description, countries, contact_persons, contact_emails } = req.body ?? {};

  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return res.status(400).json({ error: "name_required" });

  if (firstInvalidEmail(contact_emails)) return res.status(400).json({ error: "invalid_contact_email" });

  // Creating studies is a per-user right a master switches on; it is not
  // implied by editing any existing study.
  const authorId = req.admin?.id ?? null;
  if (!isMasterReq(req) && !(await canCreateProjects(authorId))) {
    return res.status(403).json({ error: "not_allowed" });
  }

  try {
    const id = await executeTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO projects (name, description, countries, contact_persons, contact_emails, created_by, updated_by, start_date, updated_at, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1)`,
        [trimmed, description, countries, contact_persons, contact_emails, authorId, authorId]
      );
      // The creator is the study's first editor, so the study never has none.
      if (authorId != null) {
        await conn.query("INSERT INTO project_editors (user_id, project_id) VALUES (?, ?)", [authorId, result.insertId]);
      }
      return result.insertId;
    });

    res.status(201).json({ success: true, id });
  } catch (err) {
    if (isDuplicate(err)) return res.status(400).json({ error: "name_taken" });
    console.error("Create project error:", err);
    res.status(500).json({ error: "project_create_failed" });
  }
};

// Checks the caller may write to the study. Answers the request itself (404
// out of scope, 403 visible but not allowed) and returns false when it did.
// creatorOnly is for archiving: it reaches every clinic running the study, so
// it is the creator's call (and master's), not any editor's.
async function requireWritableProject(req, res, id, { creatorOnly = false } = {}) {
  const [exists] = await executeQuery("SELECT id FROM projects WHERE id = ?", [id]);
  if (!exists) {
    res.status(404).json({ error: "project_not_found" });
    return false;
  }
  if (isMasterReq(req)) return true;

  const userId = req.admin?.id ?? null;
  const visible = await getVisibleProjectIds(userId);
  if (!visible.includes(id)) {
    res.status(404).json({ error: "project_not_found" });
    return false;
  }

  if (creatorOnly) {
    if (!(await ownsRecord(userId, "projects", id))) {
      res.status(403).json({ error: "creator_only" });
      return false;
    }
    return true;
  }

  const editable = await getEditableProjectIds(userId);
  if (!editable.includes(id)) {
    res.status(403).json({ error: "not_editor" });
    return false;
  }
  return true;
}

// IFNULL, not overwrite: omitted => unchanged, "" => cleared. Deactivating
// stamps end_date, reactivating clears it, anything else keeps it.
async function writeProject(id, authorId, f) {
  await executeQuery(
    `UPDATE projects
     SET name = IFNULL(?, name),
         description = IFNULL(?, description),
         countries = IFNULL(?, countries),
         contact_persons = IFNULL(?, contact_persons),
         contact_emails = IFNULL(?, contact_emails),
         is_active = IFNULL(?, is_active),
         end_date = CASE
            WHEN ? = 0 THEN UTC_DATE()
            WHEN ? = 1 THEN NULL
            ELSE end_date
         END,
         updated_at = UTC_TIMESTAMP(),
         updated_by = ?
     WHERE id = ?`,
    [
      f.name, f.description, f.countries, f.contact_persons, f.contact_emails,
      f.is_active, f.is_active, f.is_active, authorId, id,
    ].map((v) => v ?? null)
  );
}

// PATCH /projects/:id
export const updateProject = async (req, res) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(404).json({ error: "project_not_found" });

  const body = req.body ?? {};
  const { description, countries, contact_persons, contact_emails } = body;
  let { name, is_active } = body;

  if (name !== undefined && name !== null) {
    name = typeof name === "string" ? name.trim() : "";
    if (!name) return res.status(400).json({ error: "name_required" });
  }
  if (firstInvalidEmail(contact_emails)) return res.status(400).json({ error: "invalid_contact_email" });

  const touchesActive = is_active !== undefined && is_active !== null;
  if (touchesActive) is_active = is_active ? 1 : 0;

  try {
    if (!(await requireWritableProject(req, res, id, { creatorOnly: touchesActive }))) return;

    await writeProject(id, req.admin?.id ?? null, {
      name, description, countries, contact_persons, contact_emails,
      is_active: touchesActive ? is_active : null,
    });
    await bumpConfigVersionForProject(id); // the study name and active flag reach the desktop config
    res.json({ success: true });
  } catch (err) {
    if (isDuplicate(err)) return res.status(400).json({ error: "name_taken" });
    console.error("Update project error:", err);
    res.status(500).json({ error: "project_update_failed" });
  }
};

// POST /projects/:id/archive  { archived: boolean }
export const archiveProject = async (req, res) => {
  const id = parseId(req.params.id);
  if (id == null) return res.status(404).json({ error: "project_not_found" });

  const archived = req.body?.archived;
  if (typeof archived !== "boolean") return res.status(400).json({ error: "archived_required" });

  try {
    if (!(await requireWritableProject(req, res, id, { creatorOnly: true }))) return;
    await writeProject(id, req.admin?.id ?? null, { is_active: archived ? 0 : 1 });
    await bumpConfigVersionForProject(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Archive project error:", err);
    res.status(500).json({ error: "project_archive_failed" });
  }
};
