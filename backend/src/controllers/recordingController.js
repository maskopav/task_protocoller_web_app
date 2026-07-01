// src/controllers/recordingController.js
import fs from "fs";
import path from "path";
import crypto from "crypto";
import pool from "../db/connection.js";
import { logToFile } from '../utils/logger.js';
import { dateInYyyyMmDdHhMmSs } from "../utils/dateFormatter.js";
import zlib from "zlib";
import { promisify } from "util";
const gunzip = promisify(zlib.gunzip);

// Configuration for file storage
const UPLOAD_DIR = process.env.DATA_PATH; 

// Ensure directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const uploadRecording = async (req, res) => {
  // 1. Get files from req.files (Multer's object for multiple fields)
  // We keep a fallback to req.file just in case you use this controller elsewhere with .single()
  const audioFile = req.files?.audio ? req.files.audio[0] : req.file;
  const coordsFile = req.files?.coordinates ? req.files.coordinates[0] : null;

  const { sessionId, protocolTaskId, token, taskCategory, repeatIndex, taskOrder, duration } = req.body;

  if (!audioFile || !token) {
    return res.status(400).json({ error: "Missing file or token" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 2. Generate Filename
    const safeCat = (taskCategory || "task").replace(/[^a-z0-9]/gi, "");
    const safeRep = repeatIndex || "1";
    const timestamp = dateInYyyyMmDdHhMmSs();
    const baseFilename = `S${sessionId}_O${taskOrder}_C${safeCat}_R${safeRep}_D${timestamp}`;
    
    // Save Audio using your existing helper
    const finalFilename = await processAndSaveAudio(audioFile.buffer, baseFilename);

    // Save Coordinates directly to the disk if they exist!
    if (coordsFile) {
      const isGzipped = req.body.coordinatesEncoding === "gzip";
      const jsonBuffer = isGzipped
        ? await gunzip(coordsFile.buffer)
        : coordsFile.buffer;

      const jsonPath = path.join(UPLOAD_DIR, `${baseFilename}.json`);
      await fs.promises.writeFile(jsonPath, jsonBuffer);
      logToFile(`✅ Saved coordinates: ${baseFilename}.json`);
    }

    // 3. Insert directly using the IDs we received
    // Notice we do NOT insert the coordinates into the DB. The DB stays clean!
    await connection.query(
      `INSERT INTO recordings 
      (session_id, protocol_task_id, recording_url, duration_seconds, repeat_index) 
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
      recording_url = VALUES(recording_url), 
      duration_seconds = VALUES(duration_seconds),
      created_at = UTC_TIMESTAMP()`,
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
  const { sessionId, token, snrScore, duration, speechSegments, attemptNumber } = req.body;

  if (!file || !token || !sessionId) {
    return res.status(400).json({ error: "Missing file, token, or session ID" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Generate a unique filename for the mic check.
    // The attempt number is included for human-readability when browsing
    // files on disk, but it is NOT what guarantees uniqueness — the client's
    // attempt counter can reset (page refresh, resumed session) or race
    // (parallel retries), so it can't be trusted as a collision guard on its
    // own. The random suffix is the actual safety net: it can't collide
    // regardless of what the client sends or gets wrong.
    const timestamp = dateInYyyyMmDdHhMmSs();
    const uniqueSuffix = crypto.randomBytes(4).toString("hex");
    const safeAttempt = parseInt(attemptNumber) || 1;
    const baseFilename = `S${sessionId}_MICCHECK_A${safeAttempt}_D${timestamp}_${uniqueSuffix}`;

    const finalFilename = await processAndSaveAudio(file.buffer, baseFilename);
    
    const parsedSnr = parseFloat(snrScore);
    const safeSnr = Number.isFinite(parsedSnr) ? parsedSnr : null;

    const parsedDuration = parseInt(duration);
    const safeDuration = Number.isFinite(parsedDuration) ? parsedDuration : null;

    // Insert into the new session_mic_checks table
    await connection.query(
      `INSERT INTO session_mic_checks 
      (session_id, recording_url, snr_score, duration_seconds, speech_segments, attempt_number) 
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        sessionId, 
        finalFilename, 
        safeSnr, 
        safeDuration, 
        speechSegments ? speechSegments : null, // Express receives this as a stringified JSON
        safeAttempt
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
  const wavFilename = `${baseFilename}.wav`;
  const wavPath = path.join(UPLOAD_DIR, wavFilename);

  await fs.promises.writeFile(wavPath, buffer);

  return wavFilename;

};