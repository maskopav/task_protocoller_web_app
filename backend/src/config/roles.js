// backend/src/config/roles.js
// Single source of truth for role name strings — see roles table
// (backend/scripts/schema/create_tables.sql) for the matching DB rows.
export const ROLES = {
  MASTER: "master",
  ADMIN: "admin",
  SURVEY_AGENCY: "survey_agency",
};

// Roles that POST /users/create (master-only) is allowed to hand out.
// "master" is deliberately excluded so this endpoint can't be used to
// create another full-access account.
export const CREATABLE_ROLES = [ROLES.ADMIN, ROLES.SURVEY_AGENCY];
