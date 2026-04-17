/* backend/src/controllers/participantController.js */
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { logToFile } from "../utils/logger.js";
import { assignProtocolToParticipant } from "../utils/assignmentHelper.js";

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

  logToFile(`👤 Creating participant: ${full_name},${external_id} for project ${project_id}`);

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
      
      logToFile(`✅ Created participant ${newParticipantId} & assigned protocol.`);
    });
  } catch (err) {
    console.error("Create participant error:", err);
    res.status(500).json({ error: err.message || "Failed to create participant" });
  }
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
    console.error("Update participant error:", err);
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
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
};