/* backend/src/controllers/participantController.js */
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { logToFile } from "../utils/logger.js";
import { assignProtocolToParticipant } from "../utils/assignmentHelper.js";
import { parseExternalIdsCsv } from "../utils/csvParser.js";
import { buildCsv } from "../utils/csvBuilder.js";

// GET /api/participants?project_id=X
export const getParticipants = async (req, res) => {
  const { project_id } = req.query;
  try {
    let sql = `SELECT * FROM v_participant_protocols WHERE is_current_protocol = 1`;
    const params = [];

    // Only filter if project_id is provided
    if (project_id) {
      sql += ` AND project_id = ?`;
      params.push(project_id);
    }

    sql += ` ORDER BY full_name ASC`;

    const rows = await executeQuery(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch participants" });
  }
};

// POST /api/participants/create
export const createParticipant = async (req, res) => {
  const { 
    full_name, 
    external_id, 
    birth_date, 
    sex, 
    contact_email, 
    contact_phone,
    notes, 
    project_id, 
    protocol_id // The selected protocol to assign immediately
  } = req.body;

  // Verify project is active before allowing creation
  const [project] = await executeQuery("SELECT is_active FROM projects WHERE id = ?", [project_id]);
  if (project && project.is_active === 0) {
     return res.status(403).json({ error: "Cannot add participants to an inactive project." });
  }

  try {
    await executeTransaction(async (conn) => {
      // 1. Insert Participant
      const [pResult] = await conn.query(
        // Added 'contact_phone' and 'creation_source' columns
        `INSERT INTO participants (full_name, external_id, birth_date, sex, contact_email, contact_phone, notes, creation_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [full_name, external_id || null, birth_date, sex, contact_email, contact_phone || null, notes, 'admin']
      );
      const newParticipantId = pResult.insertId;

      // 2. Use the shared Helper for protocol assignment
      const assignment = await assignProtocolToParticipant(conn, newParticipantId, project_id, protocol_id);
      
      res.json({ 
        success: true,
        participant_id: newParticipantId,
        ...assignment
      });
      
    });
  } catch (err) {
    logToFile("ERROR", "Failed to fetch participants", { projectId: project_id, error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message || "Failed to create participant" });
  }
};

async function findOrCreateParticipant(conn, externalId) {
  const [existing] = await conn.query(`SELECT id FROM participants WHERE external_id = ?`, [externalId]);
  if (existing.length > 0) return existing[0].id;

  const [inserted] = await conn.query(
    `INSERT INTO participants (external_id, creation_source) VALUES (?, 'admin')`,
    [externalId]
  );
  return inserted.insertId;
}

// Reuses an existing assignment's token instead of minting a second one when
// the same participant+protocol pair is imported again (e.g. a corrected CSV
// re-upload). Only a still-usable token (access_token IS NOT NULL -- a token
// can be nulled out by swapParticipantProtocolLanguage) is eligible for reuse;
// otherwise this falls back to creating a fresh assignment, same as a single
// manual assignment would.
async function findOrAssignProtocol(conn, participantId, projectId, protocolId) {
  const [existing] = await conn.query(
    `SELECT pp.id, pp.access_token FROM participant_protocols pp
     JOIN project_protocols proj_p ON pp.project_protocol_id = proj_p.id
     WHERE pp.participant_id = ? AND proj_p.project_id = ? AND proj_p.protocol_id = ?
       AND pp.access_token IS NOT NULL
     ORDER BY pp.is_active DESC, pp.id DESC
     LIMIT 1`,
    [participantId, projectId, protocolId]
  );

  if (existing.length > 0) {
    const { id, access_token } = existing[0];
    await conn.query(
      `UPDATE participant_protocols SET is_active = 1, end_date = NULL WHERE id = ?`,
      [id]
    );
    return { participant_protocol_id: id, unique_token: access_token };
  }

  return assignProtocolToParticipant(conn, participantId, projectId, protocolId);
}

// POST /api/participants/bulk-import
// multipart/form-data: file (CSV, one external_id per row, optional header),
// project_id, protocol_id.
//
// Each row is looked up-or-created and assigned-or-reactivated in its own
// transaction, independently of the others -- one bad row (a duplicate ID, a
// DB error) can't roll back or block the rest of the batch, mirroring
// importContactEvents' per-row judgment in participantProtocolController.js.
// The response is itself a CSV, one output row per input row in the same
// order, so the admin can see exactly what happened to every ID they
// uploaded without cross-referencing a separate report.
export const bulkImportParticipants = async (req, res) => {
  const { project_id, protocol_id } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: "Missing CSV file" });
  }
  if (!project_id || !protocol_id) {
    return res.status(400).json({ error: "Missing project_id or protocol_id" });
  }

  const [project] = await executeQuery("SELECT is_active FROM projects WHERE id = ?", [project_id]);
  if (project && project.is_active === 0) {
    return res.status(403).json({ error: "Cannot add participants to an inactive project." });
  }

  const externalIds = parseExternalIdsCsv(req.file.buffer);
  if (externalIds.length === 0) {
    return res.status(400).json({ error: "CSV contains no external_id values" });
  }

  // Referer/origin, not an env var -- same approach authController.js's
  // signup flow already uses to build the participant link, since the
  // frontend's own base path/port isn't known to the backend otherwise.
  const baseUrl = req.headers.referer || req.headers.origin || "";
  const seen = new Set();
  const rows = [];

  for (const rawId of externalIds) {
    const externalId = rawId.trim();
    const row = { external_id: externalId, participant_id: "", unique_link: "", status: "skipped", error: "" };

    if (!externalId) {
      row.error = "Empty external_id";
    } else if (seen.has(externalId)) {
      row.error = "Duplicate external_id in file";
    } else {
      seen.add(externalId);
      try {
        const assignment = await executeTransaction(async (conn) => {
          const participantId = await findOrCreateParticipant(conn, externalId);
          const { unique_token } = await findOrAssignProtocol(conn, participantId, project_id, protocol_id);
          return { participant_id: participantId, unique_token };
        });

        row.participant_id = assignment.participant_id;
        row.unique_link = `${baseUrl}#/participant/${assignment.unique_token}`;
        row.status = "imported";
      } catch (err) {
        logToFile("ERROR", "Failed to bulk-import participant", { externalId, projectId: project_id, protocolId: protocol_id, error: err.message, stack: err.stack });
        row.error = err.message || "Unexpected error";
      }
    }
    rows.push(row);
  }

  const headers = ["external_id", "participant_id", "unique_link", "status", "error"];
  const csv = buildCsv(headers, rows.map((r) => [r.external_id, r.participant_id, r.unique_link, r.status, r.error]));

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="participants-import-result.csv"');
  res.send(csv);
};

// PUT /api/participants/:id
export const updateParticipant = async (req, res) => {
  const { id } = req.params;
  const { 
    full_name, 
    external_id, 
    birth_date, 
    sex, 
    contact_email, 
    contact_phone, 
    notes 
  } = req.body;

  try {
    // 1. Validation: Check for duplicates (excluding the current participant)
    const duplicateCheckSql = `
      SELECT id FROM participants 
      WHERE id != ? AND (
        (external_id = ? AND external_id IS NOT NULL AND external_id != '')
        OR (full_name = ? AND birth_date = ? AND sex = ?)
      )
      LIMIT 1
    `;
    
    // Ensure empty strings are treated as NULL for date/external_id
    const existing = await executeQuery(duplicateCheckSql, [
      id,
      external_id || null,
      full_name,
      birth_date || null, 
      sex
    ]);

    if (existing.length > 0) {
      return res.status(409).json({ 
        error: "Another participant with these details already exists." 
      });
    }

    // 2. Update
    const updateSql = `
      UPDATE participants 
      SET full_name=?, external_id=?, birth_date=?, sex=?, contact_email=?, contact_phone=?, notes=?, updated_at=UTC_TIMESTAMP()
      WHERE id=?
    `;

    await executeQuery(updateSql, [
      full_name, 
      external_id || null, 
      birth_date || null, 
      sex, 
      contact_email, 
      contact_phone, 
      notes, 
      id
    ]);

    res.json({ success: true });
  } catch (err) {
    logToFile("ERROR", "Failed to update participant", { participantId: id, error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message || "Failed to update participant" });
  }
};

// Search for a participant by External ID (Raw table lookup)
export const searchParticipant = async (req, res) => {
  const { external_id } = req.query;
  
  if (!external_id) {
    return res.status(400).json({ error: "Missing external_id parameter" });
  }

  try {
    // Query the raw participants table, not the view, to find anyone in the system
    const rows = await executeQuery(
      `SELECT * FROM participants WHERE external_id = ?`,
      [external_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Participant not found" });
    }

    // Return the first match (external_id should be unique)
    // Map 'id' to 'participant_id' to match the structure expected by the frontend modals
    const p = rows[0];
    const formatted = {
      ...p,
      participant_id: p.id 
    };

    res.json(formatted);
  } catch (err) {
    logToFile("ERROR", "Failed to search participant", { externalId: external_id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Search failed" });
  }
};