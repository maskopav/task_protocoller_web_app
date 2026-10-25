// src/routes/mappings.js
import express from "express";
import pool from "../db/connection.js";
import { getVisibleProjectIds } from "../utils/accessScope.js";

const router = express.Router();

// Behind requireAuth (see server.js). Each entry is dumped with `SELECT *`, so
// every column added to an allowlisted table becomes readable by every logged-in
// admin. `projects` and `protocols` are therefore scoped for non-masters below
// (studies they see, and those studies' protocols -- never library entries).
// Keep this to reference/lookup data: never add `users` (password hashes),
// `sites`/`site_projects` (access tokens), or the per-user-scoped views —
// `v_project_summary_stats` was listed here, which handed every admin the
// stats for projects that /projects/projects-list deliberately hides from
// them. The allowlist stays even with auth in
// front of it, because it is also what stops the SQL injection this route once
// had (see frontend/e2e/mappings-security.spec.ts).
const ALLOWED_TABLES = new Set([
  "projects",
  "protocols",
  "task_types",
  "languages",
  "tasks",
]);

// GET /api/mappings?tables=tasks,languages,protocols
router.get("/", async (req, res) => {
  try {
    const tables = (req.query.tables || "").split(",").filter(Boolean);

    if (tables.length === 0) {
      return res.status(400).json({ error: "No tables specified" });
    }

    const invalid = tables.filter((table) => !ALLOWED_TABLES.has(table));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Unknown table(s): ${invalid.join(", ")}` });
    }

    // Spec section 4: studies (and their protocols) are visible only through the
    // user's clinics or editor rights. Masters see everything.
    const scoped = req.admin?.role !== "master" && (tables.includes("projects") || tables.includes("protocols"));
    const visible = scoped ? await getVisibleProjectIds(req.admin?.id ?? null) : null;

    const results = {};
    for (const table of tables) {
      if (scoped && (table === "projects" || table === "protocols")) {
        if (visible.length === 0) { results[table] = []; continue; }
        const column = table === "projects" ? "id" : "project_id";
        const [rows] = await pool.query(`SELECT * FROM \`${table}\` WHERE \`${column}\` IN (?)`, [visible]);
        results[table] = rows;
        continue;
      }
      const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
      results[table] = rows;
    }

    res.json(results);
  } catch (err) {
    console.error("Error fetching mappings:", err);
    res.status(500).json({ error: "Failed to load mappings" });
  }
});

export default router;
