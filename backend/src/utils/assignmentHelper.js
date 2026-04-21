/* backend/src/utils/assignmentHelper.js */
import { generateAccessToken } from "./tokenGenerator.js";

/**
 * Shared logic to assign a protocol to a participant.
 * Uses an existing database connection (conn) to support transactions.
 */
export async function assignProtocolToParticipant(conn, participantId, projectId, protocolId) {
  // 1. Lookup Project Protocol ID
  const [ppRows] = await conn.query(
    `SELECT id FROM project_protocols WHERE project_id = ? AND protocol_id = ?`,
    [projectId, protocolId]
  );

  if (ppRows.length === 0) {
    throw new Error(`Protocol ${protocolId} is not assigned to project ${projectId}`);
  }
  const projectProtocolId = ppRows[0].id;

  // 2. Generate unique token
  let token = generateAccessToken();
  let unique = false;

  while (!unique) {
    const [rows] = await conn.query(
      `SELECT id FROM participant_protocols WHERE access_token = ?`,
      [token]
    );
    if (rows.length === 0) unique = true;
    else token = generateAccessToken();
  }

  // 3. Insert assignment
  const [result] = await conn.query(
    `INSERT INTO participant_protocols 
     (participant_id, project_protocol_id, access_token, start_date, is_active)
     VALUES (?, ?, ?, UTC_TIMESTAMP(), 1)`,
    [participantId, projectProtocolId, token]
  );

  return {
    participant_protocol_id: result.insertId,
    unique_token: token
  };
}