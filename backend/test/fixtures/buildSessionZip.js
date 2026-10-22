// test/fixtures/buildSessionZip.js
//
// Builds session archives exactly as the desktop app uploads them
// (NewShare/docs/dev/upload_data.md), plus the broken variants the server
// checks must catch. Everything that reads a ZIP is tested against these. If you
// need another shape, add a variant here instead of hand-building a ZIP.
//
// The session: protocol "Speech battery" (project "Speech Study") expands to
// five instances:
//   0 VOCAL PHONATION rep 1   clip
//   1 VOCAL PHONATION rep 2   clip
//   2 VOCAL READING   rep 1   clip + video (recordVideo)
//   3 QUESTIONNAIRE   rep 1   answers only
//   4 VIDEO           rep 1   video
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { writeZip } from "./zipWriter.js";

export const INSTALLATION_ID = "6f933f6e-c07a-414f-9800-47b37253d409";
export const CONFIG_VERSION = "2026-10-05.080231";
export const PROTOCOL_NAME = "Speech battery";
export const PROTOCOL_PROJECT = "Speech Study";
export const PATIENT_CODE = "testx";

export const VARIANTS = [
  "valid",
  "noMaster",                // questionnaire/video-only protocol: no master, no WAV clips
  "edited",                  // timeline_edited.json present, timelineUsed "edited"
  "manifestHashMismatch",    // a manifest sha256 does not match its entry
  "missingEntry",            // manifest lists a file the ZIP lacks
  "unlistedEntry",           // ZIP has a file the manifest does not list
  "idMismatch",              // examination.sessionId differs from the form/manifest
  "badJson",                 // examination.json is not JSON (manifest itself is consistent)
  "zipSlipName",             // an entry named ../evil.txt (listed, so only the name rule trips)
  "recoveredInterrupted",    // crash-recovered, mic lost once, no endedAt
  "nonstdMic",               // every mic use differs from the configured mic
  "oldConfig",               // recorded with an older configVersion (consistently)
];

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const json = (obj) => Buffer.from(JSON.stringify(obj), "utf8");

// 48 kHz / 16-bit / mono PCM WAV of `ms` milliseconds of silence.
export function wav(ms = 100) {
  const samples = Math.round((48000 * ms) / 1000);
  const data = Buffer.alloc(samples * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(96000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Not a playable MP4, just recognisable bytes. Nothing on the server decodes video.
export const mp4 = (tag) => Buffer.concat([Buffer.from("\0\0\0\x18ftypisom"), Buffer.from(`fixture:${tag}`)]);

export function snapshot(configVersion = CONFIG_VERSION) {
  return {
    schemaVersion: 1,
    configVersion,
    siteName: "Fixture_Site",
    protocols: [{
      name: PROTOCOL_NAME,
      version: 1,
      project: PROTOCOL_PROJECT,
      recordingsFileName: "${installationId}_${field.patient_code}_${taskIndex}_${task.subtype}_${repetition}",
      patientFields: [
        { name: "patient_code", required: true },
        { name: "visit_number", required: true },
        { name: "sex" },
        { name: "year_of_birth" },
      ],
      tasks: [
        { type: "VOCAL", subtype: "PHONATION", nrepetition: 2, recordVideo: false },
        { type: "VOCAL", subtype: "READING", nrepetition: 1, recordVideo: true },
        { type: "QUESTIONNAIRE", nrepetition: 1 },
        { type: "VIDEO", nrepetition: 1 },
      ],
    }],
  };
}

/**
 * The parsed contents of one session, before any variant breaks the archive.
 * Extractor tests use this directly, without a ZIP.
 */
export function sessionParts({ sessionId, installationId = INSTALLATION_ID, variant = "valid" } = {}) {
  sessionId ??= crypto.randomBytes(16).toString("hex");
  const noMaster = variant === "noMaster";
  const configVersion = variant === "oldConfig" ? "2025-01-01.000000" : CONFIG_VERSION;
  const base = `clips/${installationId}_${PATIENT_CODE}`;
  const capture = { sampleRate: 48000, bits: 16, channels: 1 };

  const tasks = [
    { taskIndex: 0, type: "VOCAL", subtype: "PHONATION", repetition: 1, takes: 1, clipFile: `${base}_0_PHONATION_1.wav` },
    { taskIndex: 1, type: "VOCAL", subtype: "PHONATION", repetition: 2, takes: 1, clipFile: `${base}_1_PHONATION_2.wav` },
    { taskIndex: 2, type: "VOCAL", subtype: "READING", repetition: 1, takes: 1,
      clipFile: `${base}_2_READING_1.wav`, videoFile: `${base}_2_READING_1.mp4` },
    { taskIndex: 3, type: "QUESTIONNAIRE", repetition: 1, takes: 0,
      questionnaireAnswers: { mood: ["good"], symptoms: ["tremor", "fatigue"] } },
    { taskIndex: 4, type: "VIDEO", repetition: 1, takes: 1, videoFile: `${base}_4_null_1.mp4` },
  ];
  if (noMaster) for (const t of tasks) delete t.clipFile;

  const examination = {
    sessionId,
    installationId,
    protocolName: PROTOCOL_NAME,
    protocolProject: PROTOCOL_PROJECT,
    configVersion,
    startedAt: "2026-10-13T07:54:51.746661100Z",
    endedAt: "2026-10-13T08:10:00.000Z",
    ...(noMaster ? {} : { captureFormat: capture }),
    tasks,
    videoTakes: [
      { file: "video/task02_rep01_take01.mjpeg", taskIndex: 2, repetition: 1, take: 1, captureFormat: { width: 1920, height: 1080, fps: 30 } },
      { file: "video/task04_rep01_take01.mjpeg", taskIndex: 4, repetition: 1, take: 1, captureFormat: { width: 1920, height: 1080, fps: 30 } },
    ],
    hardware: {
      configuredMicDeviceId: "Mic A|Vendor|1",
      configuredCameraDeviceId: "dshow:0:Integrated Camera",
      micUses: [{ openedAt: "2026-10-13T07:54:51.298Z", deviceId: "Mic A|Vendor|1", deviceName: "Mic A",
        description: "Direct Audio Device", inputGainPercent: 80, captureFormat: capture }],
      cameraUses: [{ openedAt: "2026-10-13T07:55:39.684Z", deviceId: "dshow:0:Integrated Camera", deviceName: "Integrated Camera",
        nameOrdinal: 0, platformIndex: 0, captureFormat: { width: 1920, height: 1080, fps: 30 } }],
    },
    processing: { status: "Done", processedAt: "2026-10-13T08:10:01.200Z", timelineUsed: "original" },
  };
  if (noMaster) delete examination.hardware.micUses;

  if (variant === "edited") examination.processing.timelineUsed = "edited";
  if (variant === "recoveredInterrupted") {
    examination.recovered = true;
    delete examination.endedAt;
    examination.interruptions = [{ sampleOffset: 1_000_000, start: "2026-10-13T07:58:00Z", end: "2026-10-13T07:58:20Z",
      oldDevice: "Mic A", newDevice: "Mic B", partFile: "session_master.part2.wav", captureFormat: capture }];
    examination.hardware.events = [{ at: "2026-10-13T07:58:00Z", device: "microphone", event: "interrupted" }];
  }
  if (variant === "nonstdMic") {
    examination.hardware.micUses[0].deviceId = "USB Headset|Vendor|2";
    examination.hardware.micUses[0].deviceName = "USB Headset";
  }
  if (variant === "idMismatch") examination.sessionId = "f".repeat(32);

  const participant = {
    fields: { patient_code: PATIENT_CODE, visit_number: "1", sex: "female", year_of_birth: "1950" },
    createdAt: examination.startedAt,
  };

  // One kept take per recorded instance, 2 s apart, offsets in master samples.
  const ev = (type, offset, taskIndex = null, repetition = null, take = null) =>
    ({ type, sampleOffset: noMaster ? null : offset, wallClock: "2026-10-13T08:00:00Z", taskIndex, repetition, take });
  const events = [ev("SESSION_RECORDING_STARTED", 0)];
  let at = 0;
  for (const t of tasks) {
    events.push(ev("TASK_SCREEN_ENTERED", at, t.taskIndex, t.repetition));
    if (t.takes > 0) {
      events.push(ev("START_BUTTON_PRESSED", at + 48000, t.taskIndex, t.repetition, 1));
      events.push(ev("STOP_BUTTON_PRESSED", at + 144000, t.taskIndex, t.repetition, 1));
    }
    events.push(ev("TASK_COMPLETED", at + 192000, t.taskIndex, t.repetition, t.takes > 0 ? 1 : null));
    at += 240000;
  }
  events.push(ev("SESSION_RECORDING_STOPPED", at));
  const timelineOriginal = { sessionId, sampleRate: 48000, events };

  const files = new Map();
  if (!noMaster) files.set("master/session_master.wav", wav(300));
  for (const t of tasks) {
    if (t.clipFile) files.set(t.clipFile, wav(50));
    if (t.videoFile) files.set(t.videoFile, mp4(t.taskIndex));
  }
  files.set("examination.json", variant === "badJson" ? Buffer.from("{not json") : json(examination));
  files.set("participant.json", json(participant));
  files.set("task_configuration_snapshot.json", Buffer.from(JSON.stringify(snapshot(configVersion), null, 2)));
  files.set("timeline_original.json", json(timelineOriginal));
  if (variant === "edited") {
    files.set("timeline_edited.json", json({ sessionId, sampleRate: 48000,
      segments: [{ taskIndex: 0, repetition: 1, startSample: 40000, stopSample: 150000 }] }));
  }
  if (variant === "zipSlipName") files.set("../evil.txt", Buffer.from("x"));

  return { sessionId, installationId, configVersion, examination, participant, timelineOriginal, files };
}

/**
 * Writes a session ZIP to disk.
 * @returns {{path, sha256, bytes, sessionId, installationId, parts}}
 */
export function buildSessionZip({ variant = "valid", sessionId, installationId, dir } = {}) {
  if (!VARIANTS.includes(variant)) throw new Error(`unknown fixture variant ${variant}`);
  const parts = sessionParts({ sessionId, installationId, variant });

  const manifestFiles = [...parts.files].map(([p, data]) => ({ path: p, sha256: sha256(data) }));
  const entries = [...parts.files].map(([name, data]) => ({ name, data }));

  if (variant === "manifestHashMismatch") manifestFiles[0].sha256 = "0".repeat(64);
  if (variant === "missingEntry") manifestFiles.push({ path: "clips/ghost.wav", sha256: "1".repeat(64) });
  if (variant === "unlistedEntry") entries.push({ name: "clips/stowaway.wav", data: wav(10) });

  const manifest = { sessionId: parts.sessionId, configVersion: parts.configVersion,
    generatedAt: "2026-10-13T08:10:02.000Z", files: manifestFiles };
  entries.push({ name: "manifest.json", data: json(manifest) });

  const zip = writeZip(entries);
  dir ??= fs.mkdtempSync(path.join(os.tmpdir(), "session-fixture-"));
  const file = path.join(dir, `${PATIENT_CODE}_${parts.sessionId}.zip`);
  fs.writeFileSync(file, zip);
  return { path: file, sha256: sha256(zip), bytes: zip.length,
    sessionId: parts.sessionId, installationId: parts.installationId, parts };
}
