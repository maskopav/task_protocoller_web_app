// src/controllers/taskResultController.js
import { executeQuery } from "../db/queryHelper.js";
import { logToFile } from '../utils/logger.js';

export const saveTaskResult = async (req, res) => {
  const { sessionId, protocolTaskId, repeatIndex = 1, payload } = req.body;
  
  if (!sessionId || !protocolTaskId || !payload) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await executeQuery(
      "INSERT INTO task_results (session_id, protocol_task_id, repeat_index, payload, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())",
      [sessionId, protocolTaskId, repeatIndex, JSON.stringify(payload)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DB Error:", err);
    logToFile(`❌ Failed to save task result for session_id ${sessionId}, protocol_task_id ${protocolTaskId}, repeat_index ${repeatIndex}. Error: ${err.message}`);
    res.status(500).json({ error: "Failed to save answers to database" });
  }
};