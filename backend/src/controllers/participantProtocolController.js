// src/controllers/participantProtocolController.js
import pool from "../db/connection.js";
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { logToFile } from "../utils/logger.js";
import { sendManualProtocolEmail } from "../utils/emailService.js";
import { assignProtocolToParticipant } from "../utils/assignmentHelper.js";

// GET /api/participant-protocol/:token
export async function resolveParticipantToken(req, res) {
  const { token } = req.params;

  try {
    // 1. Load from PARTICIPANT-PROTOCOLS table → get its id
    const rows = await executeQuery(
      `SELECT id FROM participant_protocols WHERE access_token = ? and is_active = true`,
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

    // 3. Fetch Settings directly from protocols table
    const [protocolConfig] = await executeQuery(
      `SELECT * FROM protocols WHERE id = ?`,
      [view.protocol_id]
    );
    let randomizationSettings = {};
    let requiredIdentifiers = []; 

    if (protocolConfig) {
      // Parse Randomization
      if (protocolConfig.randomization) {
        try {
          const raw = protocolConfig.randomization;
          randomizationSettings = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e) {
          console.error("Error parsing randomization JSON:", e);
        }
      }

      // Parse Required Identifiers
      if (protocolConfig.required_identifiers) {
        try {
          const rawIden = protocolConfig.required_identifiers;
          requiredIdentifiers = typeof rawIden === 'string' ? JSON.parse(rawIden) : rawIden;
        } catch (e) {
          console.error("Error parsing required_identifiers JSON:", e);
        }
      }
    }

    // 4. Fetch all contents (Global and Task-specific)
    const contents = await executeQuery(
      `SELECT protocol_task_id, content_type, text_html 
       FROM protocol_contents 
       WHERE protocol_id = ?`,
      [view.protocol_id]
    );

    // Group contents by their level (global or task_id)
    const contentMap = contents.reduce((acc, c) => {
      const key = c.protocol_task_id || 'global';
      if (!acc[key]) acc[key] = [];
      acc[key].push({ type: c.content_type, html: c.text_html });
      return acc;
    }, {});

    // Helper for root level legacy support (frontend info_text/consent_text)
    const globalContentByRef = {};
    (contentMap['global'] || []).forEach(c => {
      globalContentByRef[`${c.type}_text`] = c.html;
    });

    // 5. Load tasks for the protocol
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
      params: typeof t.params === "string" ? JSON.parse(t.params) : t.params,
      contents: contentMap[t.id] || []
    }));

    // 6. Fetch Available Languages
    const siblingRows = await executeQuery(
      `SELECT pp.id AS project_protocol_id, p.language_id, l.code, l.name, l.native_name
       FROM project_protocols pp
       JOIN protocols p ON pp.protocol_id = p.id
       JOIN languages l ON p.language_id = l.id
       WHERE p.protocol_group_id = (SELECT protocol_group_id FROM protocols WHERE id = ?)
         AND p.is_current = 1
         AND pp.project_id = ?`,
      [view.protocol_id, view.project_id]
    );

    const available_languages = siblingRows.map(r => ({
      project_protocol_id: r.project_protocol_id,
      language_id: r.language_id,
      code: r.code,
      name: r.name,
      native_name: r.native_name
    }));

    // 7. Response = view + tasks + languages
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
        randomization: randomizationSettings,
        required_identifiers: requiredIdentifiers,
        use_audio_guide: protocolConfig?.use_audio_guide ?? 1,
        info_text: globalContentByRef.info_text || "",
        instructions_text: globalContentByRef.instructions_text || "",
        consent_text: globalContentByRef.consent_text || "",
        global_contents: contentMap['global'] || [],
        tasks: formattedTasks,
        available_languages: available_languages
      }
    });

  } catch (err) {
    logToFile("ERROR", "Error resolving participant token", { token, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal server error" });
  }
}

// GET /api/participant-protocol?project_id=1,participant_id=1
/// e.g. http://localhost:3000/participant-protocol?project_id=1
export const getParticipantProtocolView = async (req, res) => {

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
    logToFile("ERROR", "Failed to load participant-protocol view", { projectId: project_id, participantId: participant_id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to load participant-protocol view" });
  }
};

// GET /api/participant-protocol/:id
export const getParticipantProtocolViewById = async (req, res) => {
  const { id } = req.params;

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
    logToFile("ERROR", "Failed to load participant-protocol by ID", { id, error: err.message, stack: err.stack });
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
        start_date = IFNULL(start_date, UTC_TIMESTAMP()),
        end_date = NULL
       WHERE id = ?`,
      [participant_protocol_id]
    );

    res.json({ success: true });
  } catch (err) {
    logToFile("ERROR", "Failed to activate participant protocol", { participantProtocolId: participant_protocol_id, error: err.message, stack: err.stack });
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
       SET is_active = 0, end_date = UTC_TIMESTAMP()
       WHERE id = ?`,
      [participant_protocol_id]
    );

    res.json({ success: true });
  } catch (err) {
    logToFile("ERROR", "Failed to deactivate participant protocol", { participantProtocolId: participant_protocol_id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal error" });
  }
}

// A bare date or a date + time, space- or T-separated (e.g. "2026-09-01" or
// "2026-09-01 10:30" or "2026-09-01T10:30:00"). Stored as-is, no timezone
// reinterpretation — this is agency-supplied outreach metadata, not used in
// any resume-window/scheduling logic.
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(:\d{2})?)?$/;

function normalizeDateTime(raw) {
  const match = DATETIME_RE.exec((raw || "").trim());
  if (!match) return null;
  const [, datePart, hhmm, ss] = match;
  const time = hhmm ? `${hhmm}${ss || ":00"}` : "00:00:00";
  return `${datePart} ${time}`;
}

// One row per respondent, one column per outreach touchpoint — maps each
// CSV column directly onto a (contact_type, attempt_number) in
// participant_protocol_contacts. A blank cell just means "nothing to import
// for that touchpoint", not an error.
const CONTACT_FIELDS = [
  { column: "link_sent_at", contactType: "link_sent", attemptNumber: 1, notesColumn: null },
  { column: "call_1_at", contactType: "call", attemptNumber: 1, notesColumn: "call_1_notes" },
  { column: "call_2_at", contactType: "call", attemptNumber: 2, notesColumn: "call_2_notes" },
  { column: "call_3_at", contactType: "call", attemptNumber: 3, notesColumn: "call_3_notes" },
];

// POST /api/participant-protocol/import-contacts
// body: { project_id, rows: [{ external_id, link_sent_at, call_1_at, call_1_notes, call_2_at, call_2_notes, call_3_at, call_3_notes }] }
//
// One row per respondent covers every outreach touchpoint at once — the
// link send plus up to 3 follow-up calls — since that's how an agency
// actually tracks a respondent (one spreadsheet row each, not one file per
// touchpoint). Each populated column is matched to the participant's
// currently active assignment in this project (by participants.external_id)
// and upserted into participant_protocol_contacts, keyed on
// (participant_protocol_id, contact_type, attempt_number) — so re-importing
// a corrected CSV just overwrites the same cell instead of duplicating it.
//
// Judged per-row (and per-column within a row) rather than all-or-nothing:
// a survey agency's CSV routinely has a handful of typo'd IDs or bad dates,
// and rejecting the whole file over one bad cell would just bounce back and
// forth over email.
export async function importContactEvents(req, res) {
  const { project_id, rows } = req.body;

  if (!project_id || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "Missing project_id or rows" });
  }

  const skipped = [];
  let updated = 0;

  for (const row of rows) {
    const externalId = (row?.external_id ?? "").toString().trim();
    if (!externalId) {
      skipped.push({ external_id: row?.external_id ?? "", reason: "Missing ID" });
      continue;
    }

    let participantProtocolId;
    try {
      const matches = await executeQuery(
        `SELECT pp.id
         FROM participant_protocols pp
         JOIN participants part ON pp.participant_id = part.id
         JOIN project_protocols proj_p ON pp.project_protocol_id = proj_p.id
         WHERE part.external_id = ? AND proj_p.project_id = ? AND pp.is_active = 1`,
        [externalId, project_id]
      );

      if (matches.length === 0) {
        skipped.push({ external_id: externalId, reason: "No active assignment found in this project" });
        continue;
      }
      if (matches.length > 1) {
        skipped.push({ external_id: externalId, reason: "Multiple active assignments — ambiguous" });
        continue;
      }
      participantProtocolId = matches[0].id;
    } catch (err) {
      logToFile("ERROR", "Failed to look up participant for contact import", { externalId, projectId: project_id, error: err.message, stack: err.stack });
      skipped.push({ external_id: externalId, reason: "Unexpected error" });
      continue;
    }

    let rowUpdated = false;
    for (const field of CONTACT_FIELDS) {
      const raw = row?.[field.column];
      if (!raw) continue; // blank cell — nothing to import for this touchpoint

      const contactedAt = normalizeDateTime(raw);
      if (!contactedAt) {
        skipped.push({ external_id: externalId, reason: `Invalid date in ${field.column}` });
        continue;
      }
      const notes = field.notesColumn ? (row?.[field.notesColumn] ?? "").toString().trim() || null : null;

      try {
        await executeQuery(
          `INSERT INTO participant_protocol_contacts
             (participant_protocol_id, contact_type, attempt_number, contacted_at, notes)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE contacted_at = VALUES(contacted_at), notes = VALUES(notes)`,
          [participantProtocolId, field.contactType, field.attemptNumber, contactedAt, notes]
        );
        rowUpdated = true;
      } catch (err) {
        logToFile("ERROR", "Failed to import contact event field", { externalId, projectId: project_id, column: field.column, error: err.message, stack: err.stack });
        skipped.push({ external_id: externalId, reason: `Unexpected error saving ${field.column}` });
      }
    }

    if (rowUpdated) updated++;
  }

  res.json({ success: true, total: rows.length, updated, skipped });
}

// POST /api/participant-protocol/assign
export const assignProtocol = async (req, res) => {
  const { participant_id, project_id, protocol_id } = req.body;

  if (!participant_id || !project_id || !protocol_id) {
    return res.status(400).json({ error: "Missing required fields (participant_id, project_id, protocol_id)" });
  }

  logToFile("INFO", "Assigning protocol to participant", { participant_id, project_id, protocol_id });
  
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
  const { email, body, link, subject, lang = "en" } = req.body;

  if (!email || !body || !link) {
    return res.status(400).json({ error: "Missing email, body, or link" });
  }

  try {
    const success = await sendManualProtocolEmail(email, { 
      customBody: body, 
      link,
      subject
    }, lang);

    if (success) {
      res.json({ success: true, message: "Email sent successfully" });
    } else {
      res.status(500).json({ error: "Failed to send email" });
    }
  } catch (err) {
    logToFile("ERROR", "Manual email dispatch failed", { email, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal server error during email dispatch" });
  }
};

// PATCH /api/participant-protocol/:token/language
export async function swapParticipantProtocolLanguage(req, res) {
  const { token } = req.params;
  const { new_project_protocol_id } = req.body;

  // 1. Get a dedicated connection for the transaction
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 2. Find the current active assignment
    const [pp] = await connection.query(
      `SELECT * FROM participant_protocols WHERE access_token = ? AND is_active = true`,
      [token]
    );
    
    if (pp.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Invalid or inactive token" });
    }

    const currentProtocol = pp[0];

    // 3. ARCHIVE THE OLD ROW
    // Set token to NULL to free up the UNIQUE constraint, and set end_date
    await connection.query(
      `UPDATE participant_protocols 
       SET is_active = false, 
           end_date = UTC_TIMESTAMP(), 
           access_token = NULL 
       WHERE id = ?`,
      [currentProtocol.id]
    );

    // 4. CREATE THE NEW ROW
    // Re-use the token, set it to active, and point to the new language
    await connection.query(
      `INSERT INTO participant_protocols 
       (participant_id, project_protocol_id, access_token, start_date, is_active)
       VALUES (?, ?, ?, UTC_TIMESTAMP(), true)`,
      [currentProtocol.participant_id, new_project_protocol_id, token]
    );

    // 5. Commit the transaction
    await connection.commit();
    res.json({ success: true });

  } catch (err) {
    // If anything fails, revert all changes so data isn't corrupted
    await connection.rollback();
    logToFile("ERROR", "Failed to swap participant protocol language", { token, newProjectProtocolId: new_project_protocol_id, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal error while swapping language" });
  } finally {
    connection.release();
  }
}