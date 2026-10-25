// src/utils/configVersionBump.js
//
// A clinic's desktop configVersion is the newest updated_at across its site row
// and the protocol rows it serves (extConfig.js deriveConfigVersion). Changes
// that alter what a clinic receives without writing a newer protocol row --
// runs-at on/off, archiving a protocol or study, renaming or (de)activating a
// study -- would otherwise leave the version unchanged or even lower it, and
// the computers would never refresh. Touching sites.updated_at fixes that.
import { executeQuery } from "../db/queryHelper.js";

export async function bumpSiteConfigVersion(siteId) {
  await executeQuery(`UPDATE sites SET updated_at = UTC_TIMESTAMP() WHERE id = ?`, [siteId]);
}

// Every clinic the study runs at.
export async function bumpConfigVersionForProject(projectId) {
  if (projectId == null) return; // library entries reach no clinic
  await executeQuery(
    `UPDATE sites SET updated_at = UTC_TIMESTAMP()
      WHERE id IN (SELECT site_id FROM site_projects WHERE project_id = ?)`,
    [projectId]
  );
}
