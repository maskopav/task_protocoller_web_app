// src/pages/users/userLogic.js — pure helpers for the Users pages.

export const isMasterUser = (u) => u?.role === "master";

/** Ids of the clinics a user is assigned to. */
export const clinicIds = (user) => (user?.sites || []).map((s) => s.id);

/** Adds or removes one clinic id and returns a new array (order kept, no duplicates). */
export function toggleClinic(ids, id) {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Case-insensitive name filter for the clinic checklist. */
export function filterClinics(sites, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return sites;
  return sites.filter((s) => String(s.name || "").toLowerCase().includes(q));
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Returns an error key ("nameRequired" | "emailInvalid") or "" when the profile is valid. */
export function profileError({ name, email }) {
  if (!String(name || "").trim()) return "nameRequired";
  if (!EMAIL.test(String(email || "").trim())) return "emailInvalid";
  return "";
}

export const profileChanged = (user, { name, email }) =>
  (user?.name || "") !== String(name || "").trim() || (user?.email || "") !== String(email || "").trim();
