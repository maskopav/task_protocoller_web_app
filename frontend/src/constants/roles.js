// frontend/src/constants/roles.js
// Mirrors backend/src/config/roles.js -- role name strings must match the
// `role` field the backend puts on the JWT payload / user object.
export const ROLES = {
  MASTER: "master",
  ADMIN: "admin",
  SURVEY_AGENCY: "survey_agency",
};
