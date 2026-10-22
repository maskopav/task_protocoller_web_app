// src/utils/accessScope.js
//
// Resolves what a non-master admin may see and change. Masters never reach this
// module — callers short-circuit on req.admin.role === "master".
//
// THREE TABLES, THREE DISTINCT CLAIMS
//   user_projects       "you have this project"        (+ can_edit: may change it)
//   user_sites          "you have this clinic"
//   user_project_sites  "through THIS project you see only THESE of its clinics"
//
// Everything is a union. There is no "an empty axis means not specified"
// rule any more: narrowing is never inferred from the absence of rows, it is
// stated in user_project_sites and applies only inside its own project. Three
// earlier versions inferred it, and each one broke somewhere else — creating a
// clinic silently hid the clinics reachable through your projects, or a master
// could not narrow you away from a clinic you had created.
//
//   projects you see   = granted projects (editable per can_edit)
//                      + projects of your granted clinics (read-only)
//
//   clinics you see    = granted clinics
//                      + per granted project: its whitelist, or all its clinics
//
// A project reached only through a clinic is never editable: a protocol is
// shared by every clinic on its project, so inherited access must not rewrite
// what the other clinics run.
//
// Because "all its clinics" is resolved live from site_projects, a clinic added
// to an unrestricted project shows up on its own; a restricted one is a
// whitelist and does not grow by itself.
import { executeQuery } from "../db/queryHelper.js";

const union = (...lists) => [...new Set(lists.flat())];
const toIds = (rows) => rows.map((r) => Number(r.id));

export async function getEditableProjectIds(userId) {
  if (userId == null) return [];

  const rows = await executeQuery(
    `SELECT project_id AS id FROM user_projects WHERE user_id = ? AND can_edit = 1`,
    [userId]
  );
  return toIds(rows);
}

export async function getVisibleProjectIds(userId) {
  if (userId == null) return [];

  // Deliberately ignores can_edit: a read-only assignment still grants sight.
  const [granted, viaClinics] = await Promise.all([
    executeQuery(
      `SELECT project_id AS id FROM user_projects WHERE user_id = ?`,
      [userId]
    ),
    executeQuery(
      `SELECT DISTINCT sp.project_id AS id
       FROM user_sites us
       JOIN site_projects sp ON sp.site_id = us.site_id
       WHERE us.user_id = ?`,
      [userId]
    ),
  ]);
  return union(toIds(granted), toIds(viaClinics));
}

export async function getVisibleSiteIds(userId) {
  if (userId == null) return [];

  const [granted, viaProjects] = await Promise.all([
    executeQuery(
      `SELECT site_id AS id FROM user_sites WHERE user_id = ?`,
      [userId]
    ),
    // NOT EXISTS / EXISTS rather than a LEFT JOIN: "this project has no
    // whitelist" and "this clinic is not on the whitelist" both surface as a
    // NULL in a join and have to stay distinguishable.
    executeQuery(
      `SELECT DISTINCT sp.site_id AS id
       FROM user_projects up
       JOIN site_projects sp ON sp.project_id = up.project_id
       WHERE up.user_id = ?
         AND (
           NOT EXISTS (
             SELECT 1 FROM user_project_sites r
             WHERE r.user_id = up.user_id AND r.project_id = up.project_id
           )
           OR EXISTS (
             SELECT 1 FROM user_project_sites r
             WHERE r.user_id = up.user_id AND r.project_id = up.project_id
               AND r.site_id = sp.site_id
           )
         )`,
      [userId]
    ),
  ]);
  return union(toIds(granted), toIds(viaProjects));
}

// The two creation rights. Both are switched on per user by a master and are
// independent of any assignment: holding a project says what you may change,
// these say what you may bring into existence.
async function hasUserFlag(userId, column) {
  if (userId == null) return false;

  const rows = await executeQuery(
    `SELECT \`${column}\` AS flag FROM users WHERE id = ?`,
    [userId]
  );
  return rows.length > 0 && Number(rows[0].flag) === 1;
}

export const canCreateSites = (userId) => hasUserFlag(userId, "can_create_sites");
export const canCreateProjects = (userId) => hasUserFlag(userId, "can_create_projects");

// True when the user created this record. Ownership is what lets a non-master
// archive a project or maintain a clinic without touching anything that was
// already there before them. It grants no visibility of its own — that is what
// the assignment rows are for. The table name is whitelist-checked because it
// is interpolated into the SQL.
export async function ownsRecord(userId, table, id) {
  if (userId == null) return false;
  if (table !== "projects" && table !== "sites") {
    throw new Error(`ownsRecord: unsupported table ${table}`);
  }

  const rows = await executeQuery(
    `SELECT 1 FROM \`${table}\` WHERE id = ? AND created_by = ?`,
    [id, userId]
  );
  return rows.length > 0;
}

// Convenience for the endpoints that need both axes at once.
export async function getVisibleScope(userId) {
  const [projectIds, siteIds] = await Promise.all([
    getVisibleProjectIds(userId),
    getVisibleSiteIds(userId),
  ]);
  return { projectIds, siteIds };
}

// --- Uploaded sessions (phase B) ---------------------------------------------
//
// A session belongs to one (site, project) pair, and the rule is the same one
// as above, applied to that pair instead of to lists of ids:
//
//   see   = site in user_sites
//         OR project granted AND the site is allowed through that grant
//            (on the project's site_projects, and on its whitelist if it has one)
//   edit  = site in user_sites (clinic staff correct their own recordings)
//         OR the grant above carries can_edit
//
// Quarantined sessions (site_id NULL, unknown device) are master-only.
//
// The rule exists exactly once, as a SQL predicate over an upload_sessions
// alias. Lists and aggregates filter with it, and the per-row checks evaluate
// the same predicate, so a session can never show up in a list yet 404 on open
// (or the reverse).
const SQL_ALIAS = /^[a-z_][a-z0-9_]*$/;

export function scopeWhereClause(admin, alias = "us", { editable = false } = {}) {
  if (!SQL_ALIAS.test(alias)) throw new Error(`scopeWhereClause: bad alias ${alias}`);
  if (admin?.role === "master") return { sql: "1=1", params: [] };
  const userId = admin?.id ?? null;
  if (userId == null) return { sql: "1=0", params: [] };

  const sql = `(${alias}.site_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM user_sites usx
            WHERE usx.user_id = ? AND usx.site_id = ${alias}.site_id)
    OR EXISTS (
      SELECT 1 FROM user_projects upx
      JOIN site_projects spx ON spx.project_id = upx.project_id AND spx.site_id = ${alias}.site_id
      WHERE upx.user_id = ? AND upx.project_id = ${alias}.project_id${editable ? " AND upx.can_edit = 1" : ""}
        AND (
          NOT EXISTS (SELECT 1 FROM user_project_sites r
                      WHERE r.user_id = upx.user_id AND r.project_id = upx.project_id)
          OR EXISTS (SELECT 1 FROM user_project_sites r
                     WHERE r.user_id = upx.user_id AND r.project_id = upx.project_id
                       AND r.site_id = ${alias}.site_id)
        )
    )
  ))`;
  return { sql, params: [userId, userId] };
}

// row: an upload_sessions row, or anything carrying its primary key as `id`.
async function sessionMatches(admin, row, opts) {
  if (row?.id == null) return false;
  if (admin?.role === "master") return true;
  const scope = scopeWhereClause(admin, "us", opts);
  const rows = await executeQuery(
    `SELECT 1 FROM upload_sessions us WHERE us.id = ? AND ${scope.sql}`,
    [row.id, ...scope.params]
  );
  return rows.length > 0;
}

export const canSeeSession = (admin, row) => sessionMatches(admin, row, { editable: false });
export const canEditSession = (admin, row) => sessionMatches(admin, row, { editable: true });
