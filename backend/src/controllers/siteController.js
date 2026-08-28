// src/controllers/siteController.js
import { executeQuery } from "../db/queryHelper.js";
import { generateAccessToken } from "../utils/tokenGenerator.js";
import { logToFile } from "../utils/logger.js";
import { assembleProtocol } from "./protocolController.js";

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

const siteRow = (row) => ({ ...row, config_json: parseJson(row.config_json, null) });

// GET /sites                 — all sites with project counts
// GET /sites?project_id      — sites assigned to one project
// GET /sites?userId=&role=   — sites assigned to one admin (master sees all);
//                              scoped rows never include the access token
export const getSites = async (req, res) => {
  const { project_id, userId, role } = req.query;
  try {
    let rows;
    if (project_id) {
      rows = await executeQuery(
        `SELECT s.* FROM sites s
         JOIN site_projects sp ON sp.site_id = s.id
         WHERE sp.project_id = ?
         ORDER BY s.name`,
        [project_id]
      );
    } else if (userId && role !== "master") {
      rows = await executeQuery(
        `SELECT s.id, s.name, s.description, s.is_active, COUNT(sp.id) AS project_count
         FROM sites s
         JOIN user_sites us ON us.site_id = s.id
         LEFT JOIN site_projects sp ON sp.site_id = s.id
         WHERE us.user_id = ?
         GROUP BY s.id
         ORDER BY s.name`,
        [userId]
      );
    } else {
      rows = await executeQuery(
        `SELECT s.*, COUNT(sp.id) AS project_count FROM sites s
         LEFT JOIN site_projects sp ON sp.site_id = s.id
         GROUP BY s.id
         ORDER BY s.name`,
        []
      );
    }
    res.json(rows.map(siteRow));
  } catch (err) {
    logToFile("ERROR", "Failed to fetch sites", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to fetch sites" });
  }
};

// GET /sites/:id — site + assigned projects + inherited current protocols
export const getSiteById = async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await executeQuery(`SELECT * FROM sites WHERE id = ?`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Site not found" });
    }

    const projects = await executeQuery(
      `SELECT p.id, p.name, p.is_active, sp.assigned_at
       FROM site_projects sp
       JOIN projects p ON p.id = sp.project_id
       WHERE sp.site_id = ?
       ORDER BY p.name`,
      [id]
    );

    const protocols = await executeQuery(
      `SELECT project_id, project_name, protocol_id, protocol_name, protocol_version, language_code
       FROM v_site_protocols
       WHERE site_id = ?
       ORDER BY project_name, protocol_name`,
      [id]
    );

    res.json({ ...siteRow(rows[0]), projects, protocols });
  } catch (err) {
    logToFile("ERROR", "Failed to fetch site", { siteId: id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to fetch site" });
  }
};

// POST /sites/create
export const createSite = async (req, res) => {
  const { name, description, config_json } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Site name is required" });
  }

  const configToStore = normalizeConfigJson(config_json);
  if (configToStore === undefined) {
    return res.status(400).json({ error: "config_json is not valid JSON" });
  }

  try {
    const result = await executeQuery(
      `INSERT INTO sites (name, description, access_token, config_json, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), description || null, generateAccessToken(), configToStore, req.admin?.id ?? null]
    );
    res.json({ success: true, site_id: Number(result.insertId) });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "A site with this name already exists" });
    }
    logToFile("ERROR", "Failed to create site", { name, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to create site" });
  }
};

// PUT /sites/:id
export const updateSite = async (req, res) => {
  const { id } = req.params;
  const { name, description, config_json, is_active } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Site name is required" });
  }

  const configToStore = normalizeConfigJson(config_json);
  if (configToStore === undefined) {
    return res.status(400).json({ error: "config_json is not valid JSON" });
  }

  try {
    const result = await executeQuery(
      `UPDATE sites
       SET name = ?, description = ?, config_json = ?, is_active = ?,
           updated_at = UTC_TIMESTAMP(), updated_by = ?
       WHERE id = ?`,
      [name.trim(), description || null, configToStore, is_active ? 1 : 0, req.admin?.id ?? null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Site not found" });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "A site with this name already exists" });
    }
    logToFile("ERROR", "Failed to update site", { siteId: id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to update site" });
  }
};

// POST /sites/:id/projects  { project_id }
export const assignProjectToSite = async (req, res) => {
  const { id } = req.params;
  const { project_id } = req.body;
  if (!project_id) {
    return res.status(400).json({ error: "project_id is required" });
  }
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
  try {
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
