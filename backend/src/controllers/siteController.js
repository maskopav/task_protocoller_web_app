// src/controllers/siteController.js
import { executeQuery } from "../db/queryHelper.js";
import { generateAccessToken } from "../utils/tokenGenerator.js";
import {
  firstInvalidEmail,
  isValidAccessToken,
  isValidSiteName,
  normalizeToken,
  normalizeSiteSettings,
} from "../utils/fieldValidation.js";
import { buildExtConfig, loadLocales } from "../utils/extConfig.js";
import { logToFile } from "../utils/logger.js";
import { registerDeviceFromConfig } from "./deviceController.js";
import { assembleProtocol } from "./protocolController.js";
import {
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

// Accepts an object or a JSON string holding the desktop-app settings.
// Returns { value } = the string to store (null for empty input) with unknown
// keys stripped, or { error } when the input is not valid JSON / badly typed.
const normalizeConfigJson = (input) => {
  if (input == null || input === "") return { value: null };
  let parsed = input;
  if (typeof input !== "object") {
    try { parsed = JSON.parse(input); } catch { return { error: "config_json is not valid JSON" }; }
  }
  const { value, error } = normalizeSiteSettings(parsed);
  if (error) return { error };
  return { value: value == null ? null : JSON.stringify(value) };
};

// sites has two UNIQUE columns, so "duplicate entry" alone is ambiguous. mysql
// names the index after the column, e.g.
//   Duplicate entry 'x' for key 'sites.access_token'
// ponytail: string-matching a driver message. The alternative is a
// SELECT-then-INSERT pre-check, which races. Revisit if mysql rewords it.
const dupEntryCode = (err) =>
  /access_token/.test(err.sqlMessage || err.message || "") ? "token_taken" : "name_taken";

// The access token is a site's only credential for the desktop app, so it
// leaves the API for the master role alone. Every other caller gets the row
// with that column stripped rather than a differently-shaped SELECT per branch.
// can_edit (settings tab) is master or the clinic's creator.
const siteRow = (row, isMaster = false, userId = null) => {
  const { access_token, created_by, ...rest } = row;
  const isOwner = created_by != null && userId != null && Number(created_by) === Number(userId);
  return {
    ...rest,
    ...(isMaster && access_token !== undefined ? { access_token } : {}),
    config_json: parseJson(row.config_json, null),
    is_owner: isOwner,
    can_edit: isMaster || isOwner,
  };
};

// GET /sites             — sites the caller may see, with project counts
// GET /sites?project_id  — the same, narrowed to one project
//
// Scoping comes from req.admin, which requireAuth re-reads from the DB on every
// request. Which sites a non-master may see is resolved by accessScope.js.
export const getSites = async (req, res) => {
  const { project_id } = req.query;
  const isMaster = req.admin?.role === "master";
  const userId = req.admin?.id ?? null;
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
            `SELECT s.*, COUNT(CASE WHEN p.is_active = 1 THEN sp.id END) AS project_count FROM sites s
             LEFT JOIN site_projects sp ON sp.site_id = s.id
             LEFT JOIN projects p ON p.id = sp.project_id
             GROUP BY s.id
             ORDER BY s.name`,
            []
          );
    } else {
      const [siteIds, projectIds] = await Promise.all([
        getVisibleSiteIds(userId),
        getVisibleProjectIds(userId),
      ]);
      if (siteIds.length === 0) return res.json([]);

      if (project_id) {
        // Asking for a study the caller cannot see yields nothing rather than
        // an error — the clinic list is simply empty for them.
        if (!projectIds.includes(Number(project_id))) return res.json([]);
        rows = await executeQuery(
          `SELECT s.id, s.name, s.description, s.country, s.contact_persons, s.contact_emails,
                  s.is_active, s.created_by
           FROM sites s
           JOIN site_projects sp ON sp.site_id = s.id
           WHERE sp.project_id = ? AND s.id IN (?)
           ORDER BY s.name`,
          [project_id, siteIds]
        );
      } else {
        // project_count must only count ACTIVE studies the caller may see,
        // otherwise the row advertises a number they can never drill into.
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
                  s.is_active, s.created_by, COUNT(CASE WHEN p.is_active = 1 THEN sp.id END) AS project_count
           FROM sites s
           LEFT JOIN site_projects sp ON ${joinCond}
           LEFT JOIN projects p ON p.id = sp.project_id
           WHERE s.id IN (?)
           GROUP BY s.id
           ORDER BY s.name`,
          params
        );
      }
    }

    res.json(rows.map((row) => siteRow(row, isMaster, userId)));
  } catch (err) {
    logToFile("ERROR", "Failed to fetch sites", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "internal" });
  }
};

// What a clinic's computers receive, grouped by study and then by protocol
// (language variants of one protocol collapse into one item with languages[]).
export function groupReceives(rows) {
  const studies = new Map();
  for (const r of rows) {
    let study = studies.get(r.project_id);
    if (!study) {
      study = { project_id: r.project_id, project_name: r.project_name, protocols: [], byName: new Map() };
      studies.set(r.project_id, study);
    }
    const key = `${r.protocol_name}\u0000${r.protocol_version}`;
    let p = study.byName.get(key);
    if (!p) {
      p = { protocol_id: r.protocol_id, name: r.protocol_name, version: r.protocol_version, languages: [] };
      study.byName.set(key, p);
      study.protocols.push(p);
    }
    if (!p.languages.includes(r.language_code)) p.languages.push(r.language_code);
  }
  return [...studies.values()].map(({ byName, ...s }) => s);
}

// GET /sites/:id — clinic + studies running here (with can_edit) + what its
// computers receive (receives[]).
export const getSiteById = async (req, res) => {
  const { id } = req.params;
  const isMaster = req.admin?.role === "master";
  const userId = req.admin?.id ?? null;
  try {
    const rows = await executeQuery(`SELECT * FROM sites WHERE id = ?`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    // 404 rather than 403 for an unreachable clinic: a 403 would confirm that a
    // clinic with this id exists, which is itself something they should not learn.
    let visibleProjectIds = null;
    let editableIds = null;
    if (!isMaster) {
      const siteIds = await getVisibleSiteIds(userId);
      if (!siteIds.includes(Number(id))) {
        return res.status(404).json({ error: "not_found" });
      }
      // The nested lists are narrowed the same way the studies list is, so a
      // clinic never exposes the names of studies the caller cannot see.
      [visibleProjectIds, editableIds] = await Promise.all([
        getVisibleProjectIds(userId),
        getEditableProjectIds(userId),
      ]);
    }

    const noProjectsVisible = visibleProjectIds !== null && visibleProjectIds.length === 0;

    const projectRows = noProjectsVisible ? [] : await executeQuery(
      `SELECT p.id, p.name, p.is_active, p.created_by, sp.assigned_at
       FROM site_projects sp
       JOIN projects p ON p.id = sp.project_id
       WHERE sp.site_id = ?${visibleProjectIds ? " AND p.id IN (?)" : ""}
       ORDER BY p.name`,
      visibleProjectIds ? [id, visibleProjectIds] : [id]
    );
    const projects = projectRows.map(({ created_by, ...p }) => ({
      ...p,
      can_edit: isMaster || editableIds.includes(Number(p.id)),
      is_owner: isMaster || (created_by != null && Number(created_by) === Number(userId)),
    }));

    const protocolRows = noProjectsVisible ? [] : await executeQuery(
      `SELECT project_id, project_name, protocol_id, protocol_name, protocol_version, language_code
       FROM v_site_protocols
       WHERE site_id = ?${visibleProjectIds ? " AND project_id IN (?)" : ""}
       ORDER BY project_name, protocol_name, language_code`,
      visibleProjectIds ? [id, visibleProjectIds] : [id]
    );

    res.json({
      ...siteRow(rows[0], isMaster, userId),
      projects,
      receives: groupReceives(protocolRows),
      // Kept for the clinic's "add a study" affordance: whoever may edit the
      // clinic's settings (master or creator).
      can_manage: isMaster || (await ownsRecord(userId, "sites", id)),
    });
  } catch (err) {
    logToFile("ERROR", "Failed to fetch site", { siteId: id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "internal" });
  }
};

// POST /sites
export const createSite = async (req, res) => {
  const {
    name, description, config_json, access_token, country, contact_persons, contact_emails,
  } = req.body ?? {};
  if (typeof name !== "string" || !isValidSiteName(name.trim())) {
    return res.status(400).json({ error: "invalid_name" });
  }

  const { value: configToStore, error: configError } = normalizeConfigJson(config_json);
  if (configError) return res.status(400).json({ error: "invalid_config", message: configError });

  const isMaster = req.admin?.role === "master";
  if (!isMaster && !(await canCreateSites(req.admin?.id ?? null))) {
    return res.status(403).json({ error: "forbidden" });
  }

  // Blank on create means "generate one for me".
  const token = normalizeToken(access_token) ?? generateAccessToken();
  if (!isValidAccessToken(token)) {
    return res.status(400).json({ error: "invalid_token" });
  }

  const badEmail = firstInvalidEmail(contact_emails);
  if (badEmail) return res.status(400).json({ error: "invalid_email", message: badEmail });

  try {
    const result = await executeQuery(
      `INSERT INTO sites (name, description, access_token, config_json, country, contact_persons, contact_emails, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), description || null, token, configToStore,
       country || null, contact_persons || null, contact_emails || null,
       req.admin?.id ?? null]
    );
    // The creator's access is a real row, not something inferred from
    // created_by, so it is visible and revocable.
    if (!isMaster && req.admin?.id != null) {
      await executeQuery(
        `INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)`,
        [req.admin.id, result.insertId]
      );
    }

    res.status(201).json({ success: true, site_id: Number(result.insertId) });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: dupEntryCode(err) });
    }
    logToFile("ERROR", "Failed to create site", { name, error: err.message, stack: err.stack });
    res.status(500).json({ error: "internal" });
  }
};

// PATCH /sites/:id — partial update: absent fields stay as they are, an empty
// string clears a text field. access_token is accepted from master only (that
// is how "rotate" works); from anyone else it is ignored.
export const updateSite = async (req, res) => {
  const { id } = req.params;
  const callerIsMaster = req.admin?.role === "master";
  const userId = req.admin?.id ?? null;
  const body = req.body ?? {};

  try {
    if (!callerIsMaster) {
      // Out of scope is a 404, visible but not theirs to edit is a 403.
      const visible = await getVisibleSiteIds(userId);
      if (!visible.includes(Number(id))) return res.status(404).json({ error: "not_found" });
      if (!(await ownsRecord(userId, "sites", id))) return res.status(403).json({ error: "forbidden" });
    }

    const sets = [];
    const params = [];
    const text = (v) => (v === "" || v == null ? null : v);

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !isValidSiteName(body.name.trim())) {
        return res.status(400).json({ error: "invalid_name" });
      }
      sets.push("name = ?"); params.push(body.name.trim());
    }
    if (body.description !== undefined) { sets.push("description = ?"); params.push(text(body.description)); }
    if (body.config_json !== undefined) {
      const { value, error } = normalizeConfigJson(body.config_json);
      if (error) return res.status(400).json({ error: "invalid_config", message: error });
      sets.push("config_json = ?"); params.push(value);
    }
    if (body.is_active !== undefined) { sets.push("is_active = ?"); params.push(body.is_active ? 1 : 0); }
    if (callerIsMaster && body.access_token !== undefined) {
      const token = normalizeToken(body.access_token);
      if (token !== null) {
        if (!isValidAccessToken(token)) return res.status(400).json({ error: "invalid_token" });
        sets.push("access_token = ?"); params.push(token);
      }
    }
    if (body.country !== undefined) { sets.push("country = ?"); params.push(text(body.country)); }
    if (body.contact_persons !== undefined) { sets.push("contact_persons = ?"); params.push(text(body.contact_persons)); }
    if (body.contact_emails !== undefined) {
      const badEmail = firstInvalidEmail(body.contact_emails);
      if (badEmail) return res.status(400).json({ error: "invalid_email", message: badEmail });
      sets.push("contact_emails = ?"); params.push(text(body.contact_emails));
    }
    if (sets.length === 0) return res.status(400).json({ error: "no_changes" });

    const result = await executeQuery(
      `UPDATE sites SET ${sets.join(", ")}, updated_at = UTC_TIMESTAMP(), updated_by = ? WHERE id = ?`,
      [...params, userId, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: dupEntryCode(err) });
    }
    logToFile("ERROR", "Failed to update site", { siteId: id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "internal" });
  }
};

// GET /site-config/:token — PUBLIC, gated by the site's access token.
// Returns everything the site inherits through its projects in the desktop
// app's config format (see docs/ext_app_Task_Configuration_JSON_Spec.md and
// docs/config_alignment_decision_table.md). The transform is pure and lives in
// utils/extConfig.js; this handler only gathers the native rows. The response
// never contains the access token itself.
export const getSiteConfig = async (req, res) => {
  const { token } = req.params;
  try {
    const rows = await executeQuery(
      `SELECT id, name, config_json, is_active, updated_at FROM sites WHERE access_token = ?`,
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
    const taskRows = await executeQuery(
      `SELECT t.id, t.category, tt.type FROM tasks t JOIN task_types tt ON tt.id = t.type_id`
    );
    const tasksById = Object.fromEntries(taskRows.map((r) => [r.id, { category: r.category, type: r.type }]));

    // Group by project; assemble each protocol once even if several projects
    // of this site link to it.
    const projectMap = new Map();
    const assembledById = new Map();
    for (const row of spine) {
      if (!projectMap.has(row.project_id)) {
        projectMap.set(row.project_id, { name: row.project_name, protocols: [] });
      }
      if (!assembledById.has(row.protocol_id)) {
        const assembled = await assembleProtocol(row.protocol_id);
        if (assembled) assembled.protocol.language_code = row.language_code;
        assembledById.set(row.protocol_id, assembled);
      }
      const assembled = assembledById.get(row.protocol_id);
      if (assembled) projectMap.get(row.project_id).protocols.push(assembled);
    }

    const { config, skipped } = buildExtConfig({
      site: { name: site.name, config_json: parseJson(site.config_json, null), updated_at: site.updated_at },
      projects: [...projectMap.values()],
      tasksById,
      locales: loadLocales(),
      assetBaseUrl: process.env.ASSET_BASE_URL || "",
      now: new Date(),
    });
    for (const s of skipped) {
      logToFile("WARN", "site-config: task skipped (unsupported by the desktop app)", { site: site.name, ...s });
    }

    // Implicit device registration; swallows its own errors.
    await registerDeviceFromConfig({
      installationId: req.query?.installationId,
      appVersion: req.query?.appVersion,
      siteId: site.id,
      configVersion: config.configVersion,
    });

    res.json(config);
  } catch (err) {
    logToFile("ERROR", "Failed to resolve site config", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal server error" });
  }
};
