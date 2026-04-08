// src/controllers/recordingController.js
import fs from "fs";
import path from "path";
import pool from "../db/connection.js";
import { exec } from "child_process";
import { promisify } from "util";
import ffmpegStatic from "ffmpeg-static";
import { logToFile } from '../utils/logger.js';
import { dateInYyyyMmDdHhMmSs } from "../utils/dateFormatter.js";

const execPromise = promisify(exec);

// Configuration for file storage
const UPLOAD_DIR = process.env.DATA_PATH; 

// Ensure directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const uploadRecording = async (req, res) => {
  const file = req.file;
  // 1. Get IDs directly from body
  const { sessionId, protocolTaskId, token, taskCategory, repeatIndex, taskOrder, duration } = req.body;

  if (!file || !token) {
    return res.status(400).json({ error: "Missing file or token" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 2. Generate Filename (Purely cosmetic now, logic simplified)
    const safeCat = (taskCategory || "task").replace(/[^a-z0-9]/gi, "");
    const safeRep = repeatIndex || "1";
    // Use the date helper (defaults to now if empty)
    const timestamp = dateInYyyyMmDdHhMmSs();
    const baseFilename = `S${sessionId}_O${taskOrder}_C${safeCat}_R${safeRep}_D${timestamp}`;
    
    // Process it, and get back either the .wav or .webm filename depending on success
    const finalFilename = await processAndSaveAudio(file.buffer, baseFilename);


    // 3. Insert directly using the IDs we received
    await connection.query(
      `INSERT INTO recordings 
      (session_id, protocol_task_id, recording_url, duration_seconds, repeat_index) 
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
      recording_url = VALUES(recording_url), 
      duration_seconds = VALUES(duration_seconds),
      created_at = CURRENT_TIMESTAMP`,
      [sessionId, protocolTaskId, finalFilename, Math.round(duration || 0), safeRep]
    );

    await connection.commit();
    logToFile(`✅ Saved recording: ${finalFilename}`);
    res.json({ success: true, filename: finalFilename });

  } catch (err) {
    await connection.rollback();
    logToFile("❌ Upload Error:", err);
    res.status(500).json({ error: "Failed to save recording" });
  } finally {
    connection.release();
  }
};


export const uploadMicCheck = async (req, res) => {
  const file = req.file;
  const { sessionId, token, snrScore, duration, speechSegments } = req.body;

  if (!file || !token || !sessionId) {
    return res.status(400).json({ error: "Missing file, token, or session ID" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Generate a unique filename for the mic check
    const timestamp = dateInYyyyMmDdHhMmSs();
    const baseFilename = `S${sessionId}_MICCHECK_D${timestamp}`;
  
    const finalFilename = await processAndSaveAudio(file.buffer, baseFilename);

    // Insert into the new session_mic_checks table
    await connection.query(
      `INSERT INTO session_mic_checks 
      (session_id, recording_url, snr_score, duration_seconds, speech_segments) 
      VALUES (?, ?, ?, ?, ?)`,
      [
        sessionId, 
        finalFilename, 
        parseFloat(snrScore) || null, 
        parseInt(duration) || null, 
        speechSegments ? speechSegments : null // Express receives this as a stringified JSON
      ]
    );

    await connection.commit();
    logToFile(`✅ Saved mic check recording: ${finalFilename}`);
    res.json({ success: true, filename: finalFilename });

  } catch (err) {
    await connection.rollback();
    logToFile("❌ Mic Check Upload Error:", err);
    res.status(500).json({ error: "Failed to save mic check" });
  } finally {
    connection.release();
  }
};

const processAndSaveAudio = async (buffer, baseFilename) => {
  const webmFilename = `${baseFilename}.webm`;
  const wavFilename = `${baseFilename}.wav`;
  
  const webmPath = path.join(UPLOAD_DIR, webmFilename);
  const wavPath = path.join(UPLOAD_DIR, wavFilename);

  // ALWAYS save the original .webm file first
  await fs.promises.writeFile(webmPath, buffer);

  try {
    // ffmpegStatic is just a string containing the direct path to the downloaded binary inside your node_modules!
    await execPromise(`"${ffmpegStatic}" -i "${webmPath}" -c:a pcm_s16le -f wav -y "${wavPath}"`);

    // If conversion succeeds, delete the .webm and return the .wav filename
    await fs.promises.unlink(webmPath);
    return wavFilename;

  } catch (error) {
    logToFile(`⚠️ Static FFmpeg conversion failed for ${baseFilename}. Falling back to .webm. Error:`, error.message);
    return webmFilename; 
  }
};