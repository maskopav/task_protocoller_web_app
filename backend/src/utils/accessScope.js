// src/utils/accessScope.js
//
// Resolves what a non-master admin may see and change. Masters never reach this
// module -- callers short-circuit on req.admin.role === "master".
//
// TWO TABLES, TWO CLAIMS (docs/ui_redesign/02_spec.md section 4)
//   user_sites       "you have this clinic"
//   project_editors  "you may change this study and its protocols"
//
//   clinics you see   = user_sites
//   studies you edit  = project_editors
//   studies you see   = studies running at your clinics + studies you edit
//   recordings you see/review = recordings whose clinic you see (strict:
//                       editing a study does not widen it)
//
// A study reached only through a clinic is *received*: visible, never editable.
// A protocol is shared by every clinic running its study, so inherited access
// must not rewrite what the other clinics run.
import { executeQuery } from "../db/queryHelper.js";

const union = (...lists) => [...new Set(lists.flat())];
const toIds = (rows) => rows.map((r) => Number(r.id));

export async function getEditableProjectIds(userId) {
  if (userId == null) return [];

  const rows = await executeQuery(
    `SELECT project_id AS id FROM project_editors WHERE user_id = ?`,
    [userId]
  );
  return toIds(rows);
}

export async function getVisibleSiteIds(userId) {
  if (userId == null) return [];

  const rows = await executeQuery(
    `SELECT site_id AS id FROM user_sites WHERE user_id = ?`,
    [userId]
  );
  return toIds(rows);
}

export async function getVisibleProjectIds(userId) {
  if (userId == null) return [];

  const [edited, viaClinics] = await Promise.all([
    getEditableProjectIds(userId),
    executeQuery(
      `SELECT DISTINCT sp.project_id AS id
       FROM user_sites us
       JOIN site_projects sp ON sp.site_id = us.site_id
       WHERE us.user_id = ?`,
      [userId]
    ),
  ]);
  return union(edited, toIds(viaClinics));
}

export async function canEditProject(userId, projectId) {
  if (userId == null || projectId == null) return false;

  const rows = await executeQuery(
    `SELECT 1 FROM project_editors WHERE user_id = ? AND project_id = ? LIMIT 1`,
    [userId, projectId]
  );
  return rows.length > 0;
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

// Who may browse the protocol library and add entries to a study: anyone who
// writes protocols. Masters are short-circuited by the caller.
export async function canUseLibrary(userId) {
  if (userId == null) return false;
  if (await canCreateProjects(userId)) return true;
  return (await getEditableProjectIds(userId)).length > 0;
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
// A session belongs to one clinic, and the rule is the clinic rule and nothing
// else: you see and review (QC, comments, participant edits) a session when its
// clinic is one of yours. Editing a study never widens this.
//
// Quarantined sessions (site_id NULL, unknown device) are master-only.
//
// The rule exists exactly once, as a SQL predicate over an upload_sessions
// alias. Lists and aggregates filter with it, and the per-row checks evaluate
// the same predicate, so a session can never show up in a list yet 404 on open
// (or the reverse). `editable` is accepted for the callers that distinguish
// see from edit; both are the same rule now.
const SQL_ALIAS = /^[a-z_][a-z0-9_]*$/;

export function scopeWhereClause(admin, alias = "us") {
  if (!SQL_ALIAS.test(alias)) throw new Error(`scopeWhereClause: bad alias ${alias}`);
  if (admin?.role === "master") return { sql: "1=1", params: [] };
  const userId = admin?.id ?? null;
  if (userId == null) return { sql: "1=0", params: [] };

  const sql = `(${alias}.site_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_sites usx
    WHERE usx.user_id = ? AND usx.site_id = ${alias}.site_id
  ))`;
  return { sql, params: [userId] };
}

// row: an upload_sessions row, or anything carrying its primary key as `id`.
async function sessionMatches(admin, row) {
  if (row?.id == null) return false;
  if (admin?.role === "master") return true;
  const scope = scopeWhereClause(admin, "us");
  const rows = await executeQuery(
    `SELECT 1 FROM upload_sessions us WHERE us.id = ? AND ${scope.sql}`,
    [row.id, ...scope.params]
  );
  return rows.length > 0;
}

export const canSeeSession = (admin, row) => sessionMatches(admin, row);
export const canEditSession = (admin, row) => sessionMatches(admin, row);
