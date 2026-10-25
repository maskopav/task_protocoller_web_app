// src/controllers/projectEditorController.js
//
// Who may edit a study (project_editors) and where it runs (site_projects).
// Error semantics (spec 8.3): 404 for anything out of the caller's scope,
// 403 for a visible record the caller may not change, 400 for bad input.
import { executeQuery } from "../db/queryHelper.js";
import {
  canEditProject,
  getVisibleProjectIds,
  getVisibleSiteIds,
} from "../utils/accessScope.js";
import { logToFile } from "../utils/logger.js";
import { bumpSiteConfigVersion } from "../utils/configVersionBump.js";

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const isMaster = (req) => req.admin?.role === "master";

/**
 * Resolves the study named by :id for this caller.
 * Returns { id, createdBy } when the caller may edit it; otherwise sends the
 * 404 (out of scope) or 403 (visible, not editable) and returns null.
 */
async function requireEditableProject(req, res) {
  const id = parseId(req.params.id);
  const rows = id ? await executeQuery(`SELECT id, created_by FROM projects WHERE id = ?`, [id]) : [];
  if (rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const project = { id, createdBy: rows[0].created_by == null ? null : Number(rows[0].created_by) };
  if (isMaster(req)) return project;

  const userId = req.admin?.id ?? null;
  if (await canEditProject(userId, id)) return project;
  const visible = await getVisibleProjectIds(userId);
  if (!visible.includes(id)) {
    res.status(404).json({ error: "not_found" });
  } else {
    res.status(403).json({ error: "forbidden" });
  }
  return null;
}

const fail = (res, err, what, ctx = {}) => {
  logToFile("ERROR", `Failed to ${what}`, { ...ctx, error: err.message, stack: err.stack });
  res.status(500).json({ error: "internal" });
};

const editorRow = (r, createdBy) => ({
  user_id: Number(r.user_id),
  name: r.full_name ?? null,
  email: r.email,
  is_creator: createdBy != null && Number(r.user_id) === createdBy,
  added_at: r.created_at ?? null,
});

const EDITORS_SQL = `SELECT pe.user_id, pe.created_at, u.full_name, u.email
                     FROM project_editors pe JOIN users u ON u.id = pe.user_id
                     WHERE pe.project_id = ?
                     ORDER BY pe.created_at, pe.user_id`;

// GET /projects/:id/editors
export const listEditors = async (req, res) => {
  try {
    const project = await requireEditableProject(req, res);
    if (!project) return;
    const rows = await executeQuery(EDITORS_SQL, [project.id]);
    res.json(rows.map((r) => editorRow(r, project.createdBy)));
  } catch (err) {
    fail(res, err, "list editors");
  }
};

// POST /projects/:id/editors  { email }  — users are found by exact email
export const addEditor = async (req, res) => {
  try {
    const project = await requireEditableProject(req, res);
    if (!project) return;
    const email = req.body?.email;
    if (typeof email !== "string" || email.trim() === "" || email.length > 255) {
      return res.status(400).json({ error: "invalid_email" });
    }
    const users = await executeQuery(
      `SELECT id, full_name, email FROM users WHERE email = ? AND is_active = 1`,
      [email.trim()]
    );
    if (users.length === 0) return res.status(404).json({ error: "user_not_found" });

    // Idempotent: adding someone who already edits the study changes nothing.
    await executeQuery(
      `INSERT IGNORE INTO project_editors (user_id, project_id) VALUES (?, ?)`,
      [users[0].id, project.id]
    );
    res.status(201).json(editorRow({ user_id: users[0].id, full_name: users[0].full_name, email: users[0].email }, project.createdBy));
  } catch (err) {
    fail(res, err, "add editor");
  }
};

// DELETE /projects/:id/editors/:userId
export const removeEditor = async (req, res) => {
  try {
    const project = await requireEditableProject(req, res);
    if (!project) return;
    const userId = parseId(req.params.userId);
    const editors = await executeQuery(`SELECT user_id FROM project_editors WHERE project_id = ?`, [project.id]);
    if (!userId || !editors.some((e) => Number(e.user_id) === userId)) {
      return res.status(404).json({ error: "not_found" });
    }
    if (project.createdBy !== null && userId === project.createdBy) {
      return res.status(400).json({ error: "cannot_remove_creator" });
    }
    if (editors.length <= 1) return res.status(400).json({ error: "last_editor" });

    await executeQuery(`DELETE FROM project_editors WHERE project_id = ? AND user_id = ?`, [project.id, userId]);
    res.json({ success: true });
  } catch (err) {
    fail(res, err, "remove editor");
  }
};

// Runs-at: master, or an editor of the study who also sees the clinic.
async function requireRunsAtRights(req, res) {
  const project = await requireEditableProject(req, res);
  if (!project) return null;
  const siteId = parseId(req.params.siteId);
  let ok = false;
  if (siteId) {
    ok = isMaster(req)
      ? (await executeQuery(`SELECT id FROM sites WHERE id = ?`, [siteId])).length > 0
      : (await getVisibleSiteIds(req.admin?.id ?? null)).includes(siteId);
  }
  if (!ok) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  return { projectId: project.id, siteId };
}

// PUT /projects/:id/sites/:siteId
export const putRunsAt = async (req, res) => {
  try {
    const t = await requireRunsAtRights(req, res);
    if (!t) return;
    await executeQuery(`INSERT IGNORE INTO site_projects (site_id, project_id) VALUES (?, ?)`, [t.siteId, t.projectId]);
    await bumpSiteConfigVersion(t.siteId);
    res.json({ success: true, runs_at: true });
  } catch (err) {
    fail(res, err, "set runs-at");
  }
};

// DELETE /projects/:id/sites/:siteId
export const deleteRunsAt = async (req, res) => {
  try {
    const t = await requireRunsAtRights(req, res);
    if (!t) return;
    await executeQuery(`DELETE FROM site_projects WHERE site_id = ? AND project_id = ?`, [t.siteId, t.projectId]);
    await bumpSiteConfigVersion(t.siteId);
    res.json({ success: true, runs_at: false });
  } catch (err) {
    fail(res, err, "remove runs-at");
  }
};
