// src/controllers/siteController.js
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { generateAccessToken } from "../utils/tokenGenerator.js";
import {
  firstInvalidEmail,
  isValidAccessToken,
  normalizeToken,
  TOKEN_FORMAT_ERROR,
} from "../utils/fieldValidation.js";
import { logToFile } from "../utils/logger.js";
import { assembleProtocol } from "./protocolController.js";
import {
  getVisibleScope,
  getVisibleSiteIds,
  getVisibleProjectIds,
  getEditableProjectIds,
  canCreateSites,
  ownsRecord,
} from "../utils/accessScope.js";

const parseJson = (raw, fallback) => {
  if (raw == null) return fallback;
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
};

// Accepts an object or a JSON string; returns the string to store,
// null for empty input, or undefined when the input is not valid JSON.
const normalizeConfigJson = (input) => {
  if (input == null || input === "") return null;
  if (typeof input === "object") return JSON.stringify(input);
  try {
    return JSON.stringify(JSON.parse(input));
  } catch {
    return undefined;
  }
};

// sites has two UNIQUE columns, so "duplicate entry" alone is ambiguous. mysql
// names the index after the column, e.g.
//   Duplicate entry 'x' for key 'sites.access_token'
// ponytail: string-matching a driver message. The alternative is a
// SELECT-then-INSERT pre-check, which races. Revisit if mysql rewords it.
const dupEntryMessage = (err) =>
  /access_token/.test(err.sqlMessage || err.message || "")
    ? "This access token is already used by another site"
    : "A site with this name already exists";

// The access token is a site's only credential for the desktop app, so it
// leaves the API for the master role alone. Every other caller gets the row
// with that column stripped rather than a differently-shaped SELECT per branch.
const siteRow = (row, isMaster = false) => {
  const { access_token, ...rest } = row;
  return {
    ...rest,
    ...(isMaster && access_token !== undefined ? { access_token } : {}),
    config_json: parseJson(row.config_json, null),
  };
};

// GET /sites             — sites the caller may see, with project counts
// GET /sites?project_id  — the same, narrowed to one project
//
// Scoping comes from req.admin, which requireAuth re-reads from the DB on every
// request. It used to come from ?userId=&role=, i.e. the client declaring whose
// data it wanted — which any admin could simply lie about. Which sites a
// non-master may see is resolved by accessScope.js, so an admin granted only a
// project still sees that project's clinics.
export const getSites = async (req, res) => {
  const { project_id } = req.query;
  const isMaster = req.admin?.role === "master";
  try {
    let rows;

    if (isMaster) {
      rows = project_id
        ? await executeQuery(
            `SELECT s.* FROM sites s
             JOIN site_projects sp ON sp.site_id = s.id
             WHERE sp.project_id = ?
             ORDER BY s.name`,
            [project_id]
          )
        : await executeQuery(
            `SELECT s.*, COUNT(sp.id) AS project_count FROM sites s
             LEFT JOIN site_projects sp ON sp.site_id = s.id
             GROUP BY s.id
             ORDER BY s.name`,
            []
          );
    } else {
      const { projectIds, siteIds } = await getVisibleScope(req.admin?.id ?? null);
      if (siteIds.length === 0) return res.json([]);

      if (project_id) {
        // Asking for a project the caller cannot see yields nothing rather than
        // an error — the site list is simply empty for them.
        if (!projectIds.includes(Number(project_id))) return res.json([]);
        rows = await executeQuery(
          `SELECT s.id, s.name, s.description, s.country, s.contact_persons, s.contact_emails,
                  s.is_active
           FROM sites s
           JOIN site_projects sp ON sp.site_id = s.id
           WHERE sp.project_id = ? AND s.id IN (?)
           ORDER BY s.name`,
          [project_id, siteIds]
        );
      } else {
        // project_count must only count projects the caller may see, otherwise
        // the card advertises a number they can never drill into.
        const params = [];
        let joinCond = "sp.site_id = s.id";
        if (projectIds.length > 0) {
          joinCond += " AND sp.project_id IN (?)";
          params.push(projectIds);
        } else {
          joinCond += " AND 1 = 0";
        }
        params.push(siteIds);

        rows = await executeQuery(
          `SELECT s.id, s.name, s.description, s.country, s.contact_persons, s.contact_emails,
                  s.is_active, COUNT(sp.id) AS project_count
           FROM sites s
           LEFT JOIN site_projects sp ON ${joinCond}
           WHERE s.id IN (?)
           GROUP BY s.id
           ORDER BY s.name`,
          params
        );
      }
    }

    res.json(rows.map((row) => siteRow(row, isMaster)));
  } catch (err) {
    logToFile("ERROR", "Failed to fetch sites", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to fetch sites" });
  }
};

// GET /sites/:id — site + assigned projects + inherited current protocols
export const getSiteById = async (req, res) => {
  const { id } = req.params;
  const isMaster = req.admin?.role === "master";
  try {
    const rows = await executeQuery(`SELECT * FROM sites WHERE id = ?`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Site not found" });
    }

    // 404 rather than 403 for an unreachable site: a 403 would confirm that a
    // site with this id exists, which is itself something they should not learn.
    let visibleProjectIds = null;
    if (!isMaster) {
      const userId = req.admin?.id ?? null;
      const siteIds = await getVisibleSiteIds(userId);
      if (!siteIds.includes(Number(id))) {
        return res.status(404).json({ error: "Site not found" });
      }
      // The nested lists are narrowed the same way the dashboard is, so a site
      // never exposes the names of projects or protocols the caller cannot see.
      visibleProjectIds = await getVisibleProjectIds(userId);
    }

    const noProjectsVisible = visibleProjectIds !== null && visibleProjectIds.length === 0;

    const projects = noProjectsVisible ? [] : await executeQuery(
      `SELECT p.id, p.name, p.is_active, sp.assigned_at
       FROM site_projects sp
       JOIN projects p ON p.id = sp.project_id
       WHERE sp.site_id = ?${visibleProjectIds ? " AND p.id IN (?)" : ""}
       ORDER BY p.name`,
      visibleProjectIds ? [id, visibleProjectIds] : [id]
    );

    const protocols = noProjectsVisible ? [] : await executeQuery(
      `SELECT project_id, project_name, protocol_id, protocol_name, protocol_version, language_code
       FROM v_site_protocols
       WHERE site_id = ?${visibleProjectIds ? " AND project_id IN (?)" : ""}
       ORDER BY project_name, protocol_name`,
      visibleProjectIds ? [id, visibleProjectIds] : [id]
    );

    // Drives the "manage projects" affordance: assigning one needs both an
    // editable project and ownership of the clinic, so the UI should not offer
    // it to someone who would only be refused.
    const canManage = isMaster || (await ownsRecord(req.admin?.id ?? null, "sites", id));

    res.json({ ...siteRow(rows[0], isMaster), projects, protocols, can_manage: canManage });
  } catch (err) {
    logToFile("ERROR", "Failed to fetch site", { siteId: id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to fetch site" });
  }
};

// POST /sites/create
export const createSite = async (req, res) => {
  const {
    name, description, config_json, access_token, country, contact_persons, contact_emails,
  } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Site name is required" });
  }

  const configToStore = normalizeConfigJson(config_json);
  if (configToStore === undefined) {
    return res.status(400).json({ error: "config_json is not valid JSON" });
  }

  // Creating a clinic follows from being able to edit a project: a clinic with
  // no project on it does nothing, so there is no separate right for it.
  const isMaster = req.admin?.role === "master";
  if (!isMaster && !(await canCreateSites(req.admin?.id ?? null))) {
    return res.status(403).json({ error: "You are not allowed to create sites." });
  }

  // Blank on create means "generate one for me".
  const token = normalizeToken(access_token) ?? generateAccessToken();
  if (!isValidAccessToken(token)) {
    return res.status(400).json({ error: TOKEN_FORMAT_ERROR });
  }

  const badEmail = firstInvalidEmail(contact_emails);
  if (badEmail) return res.status(400).json({ error: `Not a valid email address: ${badEmail}` });

  try {
    const result = await executeQuery(
      `INSERT INTO sites (name, description, access_token, config_json, country, contact_persons, contact_emails, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), description || null, token, configToStore,
       country || null, contact_persons || null, contact_emails || null,
       req.admin?.id ?? null]
    );
    // Same as createProject: the creator's access is a real row, not something
    // inferred from created_by, so it is visible and revocable.
    if (!isMaster && req.admin?.id != null) {
      await executeQuery(
        `INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)`,
        [req.admin.id, result.insertId]
      );
    }

    res.json({ success: true, site_id: Number(result.insertId) });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: dupEntryMessage(err) });
    }
    logToFile("ERROR", "Failed to create site", { name, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to create site" });
  }
};

// PUT /sites/:id
export const updateSite = async (req, res) => {
  const { id } = req.params;
  const callerIsMaster = req.admin?.role === "master";
  const {
    name, description, config_json, is_active, access_token, country, contact_persons, contact_emails,
  } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Site name is required" });
  }

  const configToStore = normalizeConfigJson(config_json);
  if (configToStore === undefined) {
    return res.status(400).json({ error: "config_json is not valid JSON" });
  }

  // A non-master may maintain and archive a clinic they created themselves —
  // that is what "archive instead of delete" means here — but never one that
  // was already there, and never the access token, which they are not even
  // shown. IFNULL on the column turns a null into "leave it alone".
  const token = callerIsMaster ? normalizeToken(access_token) : null;
  if (token !== null && !isValidAccessToken(token)) {
    return res.status(400).json({ error: TOKEN_FORMAT_ERROR });
  }

  if (!callerIsMaster && !(await ownsRecord(req.admin?.id ?? null, "sites", id))) {
    return res.status(403).json({ error: "You can only edit sites you created." });
  }

  const badEmail = firstInvalidEmail(contact_emails);
  if (badEmail) return res.status(400).json({ error: `Not a valid email address: ${badEmail}` });

  try {
    const result = await executeQuery(
      `UPDATE sites
       SET name = ?, description = ?, config_json = ?, is_active = ?,
           /* IFNULL, not overwrite: callers that re-post a partial payload
              (SiteManagementPage's activate/deactivate button) must not be able
              to null the site's credential or silently drop its contacts.
              access_token is NOT NULL UNIQUE and is the only credential each
              desktop install has, so "absent => unchanged" has to be a property
              of the endpoint rather than of every caller. */
           access_token = IFNULL(?, access_token),
           country = IFNULL(?, country),
           contact_persons = IFNULL(?, contact_persons),
           contact_emails = IFNULL(?, contact_emails),
           updated_at = UTC_TIMESTAMP(), updated_by = ?
       WHERE id = ?`,
      [name.trim(), description || null, configToStore, is_active ? 1 : 0,
       token, country ?? null, contact_persons ?? null, contact_emails ?? null,
       req.admin?.id ?? null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Site not found" });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: dupEntryMessage(err) });
    }
    logToFile("ERROR", "Failed to update site", { siteId: id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to update site" });
  }
};

// POST /sites/:id/projects  { project_id }
// A non-master may wire up only their own clinics, and only to projects they
// have authorship on. That is what keeps "can add clinics" from turning into
// "can quietly attach someone else's clinic to my study", and it is why a
// pre-existing clinic can never be detached by anyone but a master.
async function mayWireSiteToProject(req, siteId, projectId) {
  if (req.admin?.role === "master") return null;

  const userId = req.admin?.id ?? null;
  const editable = await getEditableProjectIds(userId);
  if (!editable.includes(Number(projectId))) {
    return "You do not have edit rights on this project.";
  }
  if (!(await ownsRecord(userId, "sites", siteId))) {
    return "You can only assign projects to sites you created.";
  }
  return null;
}

export const assignProjectToSite = async (req, res) => {
  const { id } = req.params;
  const { project_id } = req.body;
  if (!project_id) {
    return res.status(400).json({ error: "project_id is required" });
  }

  const refusal = await mayWireSiteToProject(req, id, project_id);
  if (refusal) return res.status(403).json({ error: refusal });

  try {
    await executeQuery(
      `INSERT INTO site_projects (site_id, project_id) VALUES (?, ?)`,
      [id, project_id]
    );
    res.json({ success: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Site is already assigned to this project." });
    }
    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(404).json({ error: "Site or project not found" });
    }
    logToFile("ERROR", "Failed to assign project to site", { siteId: id, projectId: project_id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to assign project" });
  }
};

// DELETE /sites/:id/projects/:projectId
export const removeProjectFromSite = async (req, res) => {
  const { id, projectId } = req.params;

  const refusal = await mayWireSiteToProject(req, id, projectId);
  if (refusal) return res.status(403).json({ error: refusal });

  try {
    // user_project_sites rows are deliberately left alone. Deleting them would
    // empty someone's whitelist, and an empty whitelist means "all" — so
    // unassigning the one clinic a user was restricted to would hand them every
    // other clinic on the project instead. The rows stay, stop matching (the
    // resolver joins them against site_projects), and come back into effect if
    // the clinic is re-assigned. getProjectSiteAccess reports them regardless of
    // whether they still point at something on the project.
    await executeQuery(
      `DELETE FROM site_projects WHERE site_id = ? AND project_id = ?`,
      [id, projectId]
    );
    res.json({ success: true });
  } catch (err) {
    logToFile("ERROR", "Failed to remove project from site", { siteId: id, projectId, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to remove assignment" });
  }
};

// GET /site-config/:token — PUBLIC, gated by the site's access token.
// Returns everything the site inherits through its projects; the external
// desktop app decides which protocol(s) to use. The response never contains
// the access token itself.
export const getSiteConfig = async (req, res) => {
  const { token } = req.params;
  try {
    const rows = await executeQuery(
      `SELECT id, name, config_json, is_active FROM sites WHERE access_token = ?`,
      [token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Invalid token" });
    }
    const site = rows[0];
    if (Number(site.is_active) === 0) {
      return res.status(403).json({ error: "This site has been deactivated." });
    }

    const spine = await executeQuery(
      `SELECT project_id, project_name, protocol_id, language_code
       FROM v_site_protocols
       WHERE site_id = ?
       ORDER BY project_id, protocol_id`,
      [site.id]
    );

    // Group protocol ids by project, then assemble each protocol once.
    const projectMap = new Map();
    for (const row of spine) {
      if (!projectMap.has(row.project_id)) {
        projectMap.set(row.project_id, { id: row.project_id, name: row.project_name, protocols: [] });
      }
      projectMap.get(row.project_id).protocols.push(row);
    }

    const projects = [];
    for (const project of projectMap.values()) {
      const protocols = [];
      for (const { protocol_id, language_code } of project.protocols) {
        const assembled = await assembleProtocol(protocol_id);
        if (!assembled) continue;
        const { protocol, contentMap, globalFields, tasks } = assembled;
        protocols.push({
          id: protocol.id,
          name: protocol.name,
          version: protocol.version,
          language_id: protocol.language_id,
          language_code,
          randomization: protocol.randomization,
          required_identifiers: protocol.required_identifiers,
          use_audio_guide: protocol.use_audio_guide,
          info_text: globalFields.info_text || "",
          instructions_text: globalFields.instructions_text || "",
          consent_text: globalFields.consent_text || "",
          global_contents: contentMap["global"] || [],
          tasks
        });
      }
      projects.push({ id: project.id, name: project.name, protocols });
    }

    res.json({
      site: { name: site.name, config_json: parseJson(site.config_json, null) },
      projects
    });
  } catch (err) {
    logToFile("ERROR", "Failed to resolve site config", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal server error" });
  }
};
