// src/upload/siteContext.js — CONTRACT STUB (wave 0). Implemented by task B.
//
// What validation needs to know about the session's site: the config version
// the site would get right now (for the `outdated` flag and the config_version
// check), and its projects and protocols (to match protocolProject and
// protocolName to ids). The version must come from the same derivation that
// GET /site-config uses (utils/extConfig.js, "newest updated_at across the site
// and every protocol row"), refactored into a shared helper, not re-implemented.

/**
 * @param {number|null} siteId   null (quarantine) → {currentConfigVersion: null, projects: []}
 * @returns {Promise<{currentConfigVersion: string|null,
 *                    projects: {id: number, name: string, protocols: {id: number, name: string}[]}[]}>}
 */
export async function loadSiteContext(siteId) {
  throw new Error("not implemented");
}
