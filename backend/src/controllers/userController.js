// backend/src/controllers/userController.js
//
// User management, master only (the routes enforce it). Spec 8.3:
//   GET /users, POST /users, GET /users/:id, PATCH /users/:id
// Clinic assignment is PUT /users/:id/sites (userSiteController.js).
import { executeQuery } from "../db/queryHelper.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { logToFile } from "../utils/logger.js";
import { sendAdminWelcomeEmail } from "../utils/emailService.js";
import { frontendBaseUrl } from "../utils/frontendUrl.js";

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const isEmail = (v) => typeof v === "string" && v.length <= 255 && EMAIL.test(v.trim());

const userRow = (u, sites = []) => ({
  id: Number(u.id),
  name: u.full_name ?? null,
  email: u.email,
  role: u.role,
  is_active: Number(u.is_active) === 1,
  can_create_projects: Number(u.can_create_projects) === 1,
  can_create_sites: Number(u.can_create_sites) === 1,
  sites,
});

const USER_SQL = `SELECT u.id, u.email, u.full_name, r.name AS role, u.is_active,
                         u.can_create_projects, u.can_create_sites
                  FROM users u JOIN roles r ON r.id = u.role_id`;

// GET /users — everyone, with their clinics (a master sees all clinics, shown as "All" by the UI)
export const getAllUsers = async (req, res) => {
  try {
    const [users, assignments] = await Promise.all([
      executeQuery(`${USER_SQL} ORDER BY u.full_name, u.email`, []),
      executeQuery(
        `SELECT us.user_id, s.id, s.name FROM user_sites us JOIN sites s ON s.id = us.site_id ORDER BY s.name`,
        []
      ),
    ]);
    const byUser = new Map();
    for (const a of assignments) {
      const list = byUser.get(Number(a.user_id)) ?? [];
      list.push({ id: Number(a.id), name: a.name });
      byUser.set(Number(a.user_id), list);
    }
    res.json(users.map((u) => userRow(u, byUser.get(Number(u.id)) ?? [])));
  } catch (err) {
    logToFile("ERROR", "Failed to fetch all users", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "internal" });
  }
};

// GET /users/:id — plus the studies the user edits (read-only list)
export const getUserById = async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const users = id ? await executeQuery(`${USER_SQL} WHERE u.id = ?`, [id]) : [];
    if (users.length === 0) return res.status(404).json({ error: "not_found" });
    const [sites, studies] = await Promise.all([
      executeQuery(
        `SELECT s.id, s.name FROM user_sites us JOIN sites s ON s.id = us.site_id WHERE us.user_id = ? ORDER BY s.name`,
        [id]
      ),
      executeQuery(
        `SELECT p.id, p.name FROM project_editors pe JOIN projects p ON p.id = pe.project_id
         WHERE pe.user_id = ? ORDER BY p.name`,
        [id]
      ),
    ]);
    res.json({
      ...userRow(users[0], sites.map((s) => ({ id: Number(s.id), name: s.name }))),
      studies: studies.map((p) => ({ id: Number(p.id), name: p.name })),
    });
  } catch (err) {
    logToFile("ERROR", "Failed to fetch user", { userId: id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "internal" });
  }
};

// Masters are managed outside the app. These endpoints act on regular admins
// only, so no master can deactivate, re-email or re-flag another master — or
// lock themselves out. Returns null when the target is a regular admin.
export async function refuseUnlessAdminTarget(userId) {
  const rows = userId
    ? await executeQuery(
        "SELECT r.name AS role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?",
        [userId]
      )
    : [];
  if (rows.length === 0) return { status: 404, error: "not_found" };
  if (rows[0].role === "master") return { status: 403, error: "forbidden" };
  return null;
}

// POST /users
export const createAdmin = async (req, res) => {
  const body = req.body ?? {};
  const email = typeof body.email === "string" ? body.email.trim() : body.email;
  const fullName = body.name ?? body.full_name;
  const { site_ids, can_create_projects, can_create_sites, lang = "en" } = body;

  if (!isEmail(email)) return res.status(400).json({ error: "invalid_email" });
  if (typeof fullName !== "string" || fullName.trim() === "" || fullName.length > 255) {
    return res.status(400).json({ error: "invalid_name" });
  }
  if (site_ids !== undefined && (!Array.isArray(site_ids) || !site_ids.every((s) => parseId(s)))) {
    return res.status(400).json({ error: "invalid_site_ids" });
  }

  try {
    const existingUsers = await executeQuery("SELECT id FROM users WHERE email = ?", [email]);
    if (existingUsers.length > 0) return res.status(400).json({ error: "email_taken" });

    const roles = await executeQuery("SELECT id FROM roles WHERE name = 'admin'", []);
    if (roles.length === 0) return res.status(500).json({ error: "internal" });

    // CSPRNG, fixed length: Math.random() is predictable.
    const tempPassword = crypto.randomBytes(12).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const userResult = await executeQuery(
      `INSERT INTO users (email, password_hash, full_name, role_id, must_change_password, can_create_projects, can_create_sites)
       VALUES (?, ?, ?, ?, true, ?, ?)`,
      [email, passwordHash, fullName.trim(), roles[0].id, can_create_projects ? 1 : 0, can_create_sites ? 1 : 0]
    );
    const newUserId = Number(userResult.insertId);

    for (const sid of [...new Set((site_ids ?? []).map(Number))]) {
      await executeQuery("INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)", [newUserId, sid]);
    }

    // Link base from config, not Referer/Origin (see frontendUrl.js).
    // Not awaited, so the response does not wait for the mail server.
    sendAdminWelcomeEmail(email, {
      fullName,
      tempPassword,
      loginLink: frontendBaseUrl(),
    }, lang).catch((err) => logToFile("ERROR", "Failed to send admin welcome email", {
      email,
      error: err.message,
      stack: err.stack,
    }));

    res.status(201).json({ success: true, id: newUserId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(400).json({ error: "email_taken" });
    if (err.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "unknown_site" });
    logToFile("ERROR", "Failed to create admin", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "internal" });
  }
};

// PATCH /users/:id  { name, email, is_active, can_create_projects, can_create_sites }
// Absent fields stay as they are.
export const updateUser = async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body ?? {};
  try {
    const refusal = await refuseUnlessAdminTarget(id);
    if (refusal) return res.status(refusal.status).json({ error: refusal.error });

    const sets = [];
    const params = [];
    if (body.email !== undefined) {
      if (!isEmail(body.email)) return res.status(400).json({ error: "invalid_email" });
      sets.push("email = ?"); params.push(body.email.trim());
    }
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim() === "" || body.name.length > 255) {
        return res.status(400).json({ error: "invalid_name" });
      }
      sets.push("full_name = ?"); params.push(body.name.trim());
    }
    for (const key of ["is_active", "can_create_projects", "can_create_sites"]) {
      if (body[key] === undefined) continue;
      if (typeof body[key] !== "boolean") return res.status(400).json({ error: `invalid_${key}` });
      sets.push(`${key} = ?`); params.push(body[key] ? 1 : 0);
    }
    if (sets.length === 0) return res.status(400).json({ error: "no_changes" });

    await executeQuery(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(400).json({ error: "email_taken" });
    logToFile("ERROR", "Failed to update user", { userId: id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "internal" });
  }
};
