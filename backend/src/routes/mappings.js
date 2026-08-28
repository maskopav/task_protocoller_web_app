// src/routes/mappings.js
import express from "express";
import pool from "../db/connection.js";

const router = express.Router();

// Behind requireAuth (see server.js). Each entry is dumped with `SELECT *`, so
// every column added to an allowlisted table becomes readable by every logged-in
// admin — including non-masters, who are otherwise scoped by user_projects.
// Keep this to reference/lookup data: never add `users` (password hashes) or
// `sites`/`site_projects` (access tokens). The allowlist stays even with auth in
// front of it, because it is also what stops the SQL injection this route once
// had (see frontend/e2e/mappings-security.spec.ts).
const ALLOWED_TABLES = new Set([
  "projects",
  "protocols",
  "task_types",
  "languages",
  "tasks",
  "v_project_summary_stats",
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

    const results = {};
    for (const table of tables) {
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
