// src/controllers/participantProtocolController.js
import pool from "../db/connection.js";
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { logToFile } from "../utils/logger.js";
import { sendManualProtocolEmail } from "../utils/emailService.js";
import { assignProtocolToParticipant } from "../utils/assignmentHelper.js";

// GET /api/participant-protocol/:token
export async function resolveParticipantToken(req, res) {
  const { token } = req.params;
  logToFile(`🔍 resolveParticipantToken token=${token}`);

  try {
    // 1. Load from PARTICIPANT-PROTOCOLS table → get its id
    const rows = await executeQuery(
      `SELECT id FROM participant_protocols WHERE access_token = ?`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Invalid or expired token" });
    }

    const ppId = rows[0].id;

    // 2. Load full record from the VIEW
    const viewRows = await executeQuery(
      `SELECT * FROM v_participant_protocols WHERE participant_protocol_id = ?`,
      [ppId]
    );

    if (viewRows.length === 0) {
      return res.status(500).json({ error: "Invalid token." });
    }

    const view = viewRows[0];

    // Check if the protocol-participant assignment is active 
    if (Number(view.is_active) === 0) {
      return res.status(500).json({ error: "Protocol assignment for  given participant is not active!" });
    }

    // Check parent project status
    if (view.project_is_active === 0) {
      return res.status(403).json({ 
        error: "This project has been archived. Data collection is no longer possible." 
      });
    }

    // 3. Load tasks for the protocol
    const tasks = await executeQuery(
      `
        SELECT id, task_id, task_order, params
        FROM protocol_tasks
        WHERE protocol_id = ?
        ORDER BY task_order ASC
      `,
      [view.protocol_id]
    );

    const formattedTasks = tasks.map(t => ({
      protocol_task_id: t.id,
      task_id: t.task_id,
      task_order: t.task_order,
      params: typeof t.params === "string" ? JSON.parse(t.params) : t.params
    }));

    // 4. Response = view + tasks
    res.json({
      participant: {
        id: view.participant_id,
        full_name: view.full_name,
        birth_date: view.birth_date,
        sex: view.sex,
        contact_email: view.contact_email,
        contact_phone: view.contact_phone
      },
      project_protocol: {
        id: view.project_protocol_id,
        project_id: view.project_id,
        project_name: view.project_name,
        project_frequency: view.project_frequency
      },
      protocol: {
        id: view.protocol_id,
        name: view.protocol_name,
        version: view.protocol_version,
        language_id: view.language_id,
        tasks: formattedTasks
      }
    });

  } catch (err) {
    console.error("Error resolving participant token:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// GET /api/participant-protocol?project_id=1,participant_id=1
/// e.g. http://localhost:3000/participant-protocol?project_id=1
export const getParticipantProtocolView = async (req, res) => {
  logToFile("📘 getParticipantProtocolView called");

  const { project_id, participant_id } = req.query;

  try {
    let query = `SELECT * FROM v_participant_protocols WHERE 1=1 AND is_current_protocol = 1`;
    const params = [];

    if (project_id) {
      query += " AND project_id = ?";
      params.push(project_id);
    }

    if (participant_id) {
      query += " AND participant_id = ?";
      params.push(participant_id);
    }

    const rows = await executeQuery(query, params);
    res.json(rows);

  } catch (err) {
    logToFile(`❌ Error getParticipantProtocolView: ${err.stack || err}`);
    res.status(500).json({ error: "Failed to load participant-protocol view" });
  }
};

// GET /api/participant-protocol/:id
export const getParticipantProtocolViewById = async (req, res) => {
  const { id } = req.params;
  logToFile(`📘 getParticipantProtocolViewById id=${id}`);

  try {
    const rows = await executeQuery(
      `SELECT * FROM v_participant_protocols WHERE participant_protocol_id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Record not found" });
    }

    res.json(rows[0]);

  } catch (err) {
    logToFile(`❌ Error getParticipantProtocolViewById: ${err.stack || err}`);
    res.status(500).json({ error: "Failed to load participant-protocol" });
  }
};

// Set assignment active (start)
export async function activateParticipantProtocol(req, res) {
  try {
    const { participant_protocol_id } = req.body;
    if (!participant_protocol_id) {
      return res.status(400).json({ error: "Missing participant_protocol_id" });
    }

    const [rows] = await pool.query(
      `UPDATE participant_protocols 
       SET 
        is_active = 1, 
        start_date = IFNULL(start_date, NOW()),
        end_date = NULL
       WHERE id = ?`,
      [participant_protocol_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Activation error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

// End assignment
export async function deactivateParticipantProtocol(req, res) {
  try {
    const { participant_protocol_id } = req.body;
    if (!participant_protocol_id) {
      return res.status(400).json({ error: "Missing participant_protocol_id" });
    }

    await pool.query(
      `UPDATE participant_protocols 
       SET is_active = 0, end_date = NOW()
       WHERE id = ?`,
      [participant_protocol_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Deactivation error:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

// POST /api/participant-protocol/assign
export const assignProtocol = async (req, res) => {
  const { participant_id, project_id, protocol_id } = req.body;

  if (!participant_id || !project_id || !protocol_id) {
    return res.status(400).json({ error: "Missing required fields (participant_id, project_id, protocol_id)" });
  }

  logToFile(`🔗 Assigning protocol ${protocol_id} to participant ${participant_id}`);

  try {
    const result = await executeTransaction(async (conn) => {
      // Use the shared helper
      return await assignProtocolToParticipant(conn, participant_id, project_id, protocol_id);
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Assign protocol error:", err);
    res.status(500).json({ error: err.message || "Failed to assign protocol" });
  }
};

// POST /api/participant-protocol/send-manual-email
export const sendManualEmail = async (req, res) => {
  const { email, body, link, lang = "en" } = req.body;

  if (!email || !body || !link) {
    return res.status(400).json({ error: "Missing email, body, or link" });
  }

  try {
    const success = await sendManualProtocolEmail(email, { 
      customBody: body, 
      link 
    }, lang);

    if (success) {
      res.json({ success: true, message: "Email sent successfully" });
    } else {
      res.status(500).json({ error: "Failed to send email" });
    }
  } catch (err) {
    console.error("Manual email error:", err);
    res.status(500).json({ error: "Internal server error during email dispatch" });
  }
};