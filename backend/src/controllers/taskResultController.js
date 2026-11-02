// src/controllers/taskResultController.js
import { executeQuery } from "../db/queryHelper.js";
import { logToFile } from '../utils/logger.js';

const parsePayload = (p) => (typeof p === "string" ? JSON.parse(p) : p);

export const saveTaskResult = async (req, res) => {
  const { sessionId, protocolTaskId, repeatIndex = 1, payload, replace = false } = req.body;

  if (!sessionId || !protocolTaskId || !payload) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // replace: one row per session/task/repeat, overwritten on every save —
    // for tasks that save as they go (the smell test saves after each scent,
    // payload.completed false until its last Next). A partial save never
    // overwrites a finished result, in case a slow one lands after it.
    const [existing] = replace
      ? await executeQuery(
          `SELECT id, payload FROM task_results
           WHERE session_id = ? AND protocol_task_id = ? AND repeat_index = ?
           ORDER BY id DESC LIMIT 1`,
          [sessionId, protocolTaskId, repeatIndex]
        )
      : [];

    if (existing) {
      if (payload.completed === false && parsePayload(existing.payload)?.completed === true) {
        return res.json({ success: true, ignored: true });
      }
      // created_at becomes the time of the latest save
      await executeQuery(
        "UPDATE task_results SET payload = ?, created_at = UTC_TIMESTAMP() WHERE id = ?",
        [JSON.stringify(payload), existing.id]
      );
    } else {
      await executeQuery(
        "INSERT INTO task_results (session_id, protocol_task_id, repeat_index, payload, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())",
        [sessionId, protocolTaskId, repeatIndex, JSON.stringify(payload)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    logToFile("ERROR", "Failed to save task result", {
      sessionId,
      protocolTaskId,
      repeatIndex,
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: "Failed to save answers to database" });
  }
};
