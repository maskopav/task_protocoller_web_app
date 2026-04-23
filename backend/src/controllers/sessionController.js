// src/controllers/sessionController.js
import pool from "../db/connection.js";
import { executeQuery } from "../db/queryHelper.js";
import { logToFile } from '../utils/logger.js';

// POST /api/sessions/init
export const initSession = async (req, res) => {
  const { token, deviceMetadata, taskOrder } = req.body;
  const userAgent = req.headers["user-agent"];
  // Get IP (handles proxies like Nginx/Cloudflare if configured, or direct)
  const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  try {
    // 1. Resolve Token to Participant Protocol ID
    const [ppRow] = await executeQuery(
      `SELECT id FROM participant_protocols WHERE access_token = ?`,
      [token]
    );

    if (!ppRow) {
      return res.status(404).json({ error: "Invalid token" });
    }
    const participantProtocolId = ppRow.id;

    // 2. Check for an existing incomplete session for today (last 12 hours))
    const [existingSession] = await executeQuery(
      `SELECT id, current_task_index, progress, task_order 
       FROM sessions 
       WHERE participant_protocol_id = ? 
         AND completed = false 
         AND last_activity_at >= UTC_TIMESTAMP() - INTERVAL 12 HOUR 
       ORDER BY last_activity_at DESC 
       LIMIT 1`,
      [participantProtocolId]
    );

    // If an active session exists, return it to resume!
    if (existingSession) {
      // Log the new environment they are using to resume
      await pool.query(
        `INSERT INTO session_environments (session_id, ip_address, user_agent, device_metadata) 
         VALUES (?, ?, ?, ?)`,
        [existingSession.id, ipAddress, userAgent, JSON.stringify(deviceMetadata || {})]
      );
      logToFile(`Resuming session: ID ${existingSession.id} for PP_ID ${participantProtocolId}. Jumping to task index: ${existingSession.current_task_index}`);
      
      return res.json({ 
        success: true, 
        sessionId: existingSession.id,
        currentTaskIndex: existingSession.current_task_index, // Frontend will use this to skip previous tasks
        taskOrder: typeof existingSession.task_order === 'string' ? JSON.parse(existingSession.task_order) : existingSession.task_order,
        progress: typeof existingSession.progress === 'string' ? JSON.parse(existingSession.progress) : (existingSession.progress || []),
        resumed: true // Flag so frontend knows it's a resumed session
      });
    }
    
    // 3. Insert New Session
    const connection = await pool.getConnection(); 
    try {
      await connection.beginTransaction();
      const [insertResult] = await pool.query(
        `INSERT INTO sessions 
        (participant_protocol_id, session_date, last_activity_at, current_task_index, task_order) 
        VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1, ?)`,
        [
          participantProtocolId, 
          JSON.stringify(taskOrder || [])
        ]
      );

      const newSessionId = insertResult.insertId;
      // Log the initial environment
      await connection.query(
          `INSERT INTO session_environments (session_id, ip_address, user_agent, device_metadata) 
          VALUES (?, ?, ?, ?)`,
          [newSessionId, ipAddress, userAgent, JSON.stringify(deviceMetadata || {})]
      );

      await connection.commit();
      logToFile(`✅ Session initialized: ID ${newSessionId} for PP_ID ${participantProtocolId}`);

      res.json({ success: true, sessionId: newSessionId });
    } catch (dbErr) {
      await connection.rollback(); // Undo if anything failed
      throw dbErr; // Throw to the outer catch block to log it
    } finally {
      connection.release(); // ALWAYS release the connection back to the pool
    }
  } catch (err) {
    logToFile("❌ Session Init Error:", err);
    res.status(500).json({ error: "Failed to initialize session" });
  }
};

// POST /api/sessions/progress
export const updateProgress = async (req, res) => {
  const { sessionId, event, markCompleted } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing session ID" });
  }

  try {
    const connection = await pool.getConnection();
    try {
      // 1. Append Event to Progress Log
      if (event) {
        let taskIndexQuery = "";
        let queryParams = [JSON.stringify(event)];

        // If a task is completely saved, update the pointer to the NEXT task
        // We ensure event.taskIndex is provided in the JSON to avoid errors
        if (event.action === 'task_saved' && event.taskIndex !== undefined) {
          taskIndexQuery = ", current_task_index = ?";
          // We set it to the NEXT task index so when they resume, they start fresh on the next one
          queryParams.push(event.taskIndex + 1); 
        }

        queryParams.push(sessionId);
        // Update last_activity_at will as well
        await connection.query(
          `UPDATE sessions 
           SET progress = JSON_ARRAY_APPEND(COALESCE(progress, JSON_ARRAY()), '$', JSON_EXTRACT(?, '$')),
            last_activity_at = UTC_TIMESTAMP()
            ${taskIndexQuery}
           WHERE id = ?`,
         queryParams
        );
      }

      // 2. Mark as Completed
      if (markCompleted) {
        await connection.query(
          `UPDATE sessions SET completed = 1 WHERE id = ?`,
          [sessionId]
        );
      }

      res.json({ success: true });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("❌ Progress Update Error:", err);
    logToFile(`❌ Progress Update Error for Session ${sessionId}:`, err);
    res.status(200).json({ warning: "Logging failed", error: err.message });
  }
};

export const saveQuestionnaireResponse = async (req, res) => {
  const { sessionId, protocolTaskId, answers } = req.body;
  
  if (!sessionId || !protocolTaskId || !answers) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await executeQuery(
      "INSERT INTO questionnaire_responses (session_id, protocol_task_id, answers) VALUES (?, ?, ?)",
      [sessionId, protocolTaskId, JSON.stringify(answers)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DB Error:", err);
    res.status(500).json({ error: "Failed to save answers to database" });
  }
};