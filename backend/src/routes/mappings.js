// src/routes/mappings.js
import express from "express";
import pool from "../db/connection.js";

const router = express.Router();

// This endpoint is intentionally public (participant sessions load it via
// MappingProvider, see frontend/src/context/AppProvider.jsx), so it can't be
// closed off with auth. 
const ALLOWED_TABLES = new Set([
  "projects",
  "protocols",
  "task_types",
  "languages",
  "tasks",
  "v_project_summary_stats",
  "v_session_summary",
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
