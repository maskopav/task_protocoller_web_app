// src/upload/siteContext.js
//
// What validation needs to know about the session's site: the config version
// the site would get right now (for the `outdated` flag and the config_version
// check), and its projects and protocols (to match protocolProject and
// protocolName to ids). The version comes from the same derivation that
// GET /site-config uses (utils/extConfig.js, "newest updated_at across the site
// and every protocol row").
import { executeQuery } from "../db/queryHelper.js";
import { deriveConfigVersion } from "../utils/extConfig.js";

/**
 * @param {number|null} siteId   null (quarantine) → {currentConfigVersion: null, projects: []}
 * @returns {Promise<{currentConfigVersion: string|null,
 *                    projects: {id: number, name: string, protocols: {id: number, name: string}[]}[]}>}
 */
export async function loadSiteContext(siteId) {
  if (siteId == null) return { currentConfigVersion: null, projects: [] };

  const sites = await executeQuery(`SELECT updated_at FROM sites WHERE id = ?`, [siteId]);
  if (sites.length === 0) return { currentConfigVersion: null, projects: [] };

  // The same spine getSiteConfig walks; protocols.updated_at is what feeds the version.
  const rows = await executeQuery(
    `SELECT v.project_id, v.project_name, v.protocol_id, v.protocol_name, p.updated_at
     FROM v_site_protocols v
     JOIN protocols p ON p.id = v.protocol_id
     WHERE v.site_id = ?
     ORDER BY v.project_id, v.protocol_id`,
    [siteId]
  );

  const projects = new Map();
  for (const r of rows) {
    if (!projects.has(r.project_id)) projects.set(r.project_id, { id: r.project_id, name: r.project_name, protocols: [] });
    projects.get(r.project_id).protocols.push({ id: r.protocol_id, name: r.protocol_name });
  }

  return {
    currentConfigVersion: deriveConfigVersion(sites[0].updated_at, rows.map((r) => r.updated_at)),
    projects: [...projects.values()],
  };
}
