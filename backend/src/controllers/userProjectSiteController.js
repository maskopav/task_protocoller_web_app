// backend/src/controllers/userProjectSiteController.js
// The per-(user, project) clinic whitelist behind the expandable clinic list on
// a project assignment. No rows for a pair means "all of that project's
// clinics"; see accessScope.js for how it is resolved.
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { logToFile } from "../utils/logger.js";

// GET /user-projects/:userId/:projectId/sites
// Every clinic on the project, each flagged with whether it is currently
// visible to this user and why — the UI needs "granted separately" to explain
// that unticking such a clinic here will not hide it.
export const getProjectSiteAccess = async (req, res) => {
  const { userId, projectId } = req.params;
  try {
    const rows = await executeQuery(
      `SELECT s.id, s.name,
              (r.site_id IS NOT NULL) AS restricted_to,
              (us.site_id IS NOT NULL) AS granted_directly
       FROM site_projects sp
       JOIN sites s ON s.id = sp.site_id
       LEFT JOIN user_project_sites r
              ON r.site_id = s.id AND r.project_id = sp.project_id AND r.user_id = ?
       LEFT JOIN user_sites us
              ON us.site_id = s.id AND us.user_id = ?
       WHERE sp.project_id = ?
       ORDER BY s.name`,
      [userId, userId, projectId]
    );

    // Asked separately, not derived from the rows above: those are joined
    // through site_projects, so a whitelist entry for a clinic since removed
    // from the project would not appear — and the panel would report "all
    // clinics" while the resolver still restricts the user to nothing.
    const [{ n }] = await executeQuery(
      `SELECT COUNT(*) AS n FROM user_project_sites WHERE user_id = ? AND project_id = ?`,
      [userId, projectId]
    );
    const restricted = Number(n) > 0;

    res.json({
      // false => no whitelist, so the user sees every clinic on the project,
      // including any added later.
      restricted,
      sites: rows.map((r) => ({
        id: r.id,
        name: r.name,
        selected: restricted ? Number(r.restricted_to) === 1 : true,
        granted_directly: Number(r.granted_directly) === 1,
      })),
    });
  } catch (err) {
    logToFile("ERROR", "Failed to fetch project site access", {
      userId, projectId, error: err.message, stack: err.stack,
    });
    res.status(500).json({ error: "Failed to fetch clinic access" });
  }
};

// PUT /user-projects/:userId/:projectId/sites   { site_ids: [...] | null }
//
// null clears the whitelist: the user sees every clinic on the project and any
// added later. A list stores exactly those.
//
// An EMPTY list is refused rather than stored. "No rows" already means "all",
// so an empty selection would silently widen access to everything — the same
// kind of quiet inversion that broke the earlier scoping. A master who wants to
// hand over nothing removes the project assignment instead.
export const setProjectSiteAccess = async (req, res) => {
  const { userId, projectId } = req.params;
  const { site_ids } = req.body;

  if (site_ids !== null && !Array.isArray(site_ids)) {
    return res.status(400).json({ error: "site_ids must be an array or null" });
  }
  if (Array.isArray(site_ids) && site_ids.length === 0) {
    return res.status(400).json({
      error: "Select at least one clinic, or remove the project assignment instead.",
    });
  }

  try {
    if (site_ids !== null) {
      const onProject = await executeQuery(
        `SELECT site_id FROM site_projects WHERE project_id = ?`,
        [projectId]
      );
      const allowed = new Set(onProject.map((r) => Number(r.site_id)));
      const stray = site_ids.map(Number).filter((id) => !allowed.has(id));
      if (stray.length > 0) {
        return res.status(400).json({
          error: "Those clinics are not on this project.",
        });
      }
    }

    await executeTransaction(async (conn) => {
      await conn.query(
        `DELETE FROM user_project_sites WHERE user_id = ? AND project_id = ?`,
        [userId, projectId]
      );
      if (site_ids !== null) {
        for (const siteId of site_ids) {
          await conn.query(
            `INSERT INTO user_project_sites (user_id, project_id, site_id) VALUES (?, ?, ?)`,
            [userId, projectId, siteId]
          );
        }
      }
    });

    res.json({ success: true });
  } catch (err) {
    logToFile("ERROR", "Failed to set project site access", {
      userId, projectId, error: err.message, stack: err.stack,
    });
    res.status(500).json({ error: "Failed to update clinic access" });
  }
};
