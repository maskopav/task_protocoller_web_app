import { describe, it, expect } from "vitest";
import { extractSession, needsAttention, toDbDate, taskInstances, str, MAX_REPETITION, MAX_TASK_INSTANCES } from "./sessionExtractor.js";
import { sessionParts, CONFIG_VERSION, PROTOCOL_NAME, PROTOCOL_PROJECT, LONG, snapshot } from "../../test/fixtures/buildSessionZip.js";

const SID = "a".repeat(32);
const PROJECTS = [
  { id: 7, name: "Other Study", protocols: [{ id: 70, name: PROTOCOL_NAME }] },
  { id: 8, name: PROTOCOL_PROJECT, protocols: [{ id: 80, name: "Something else" }, { id: 81, name: PROTOCOL_NAME }] },
];
const CTX = { receivedAt: "2026-10-13T09:00:00.000Z", currentConfigVersion: CONFIG_VERSION, projects: PROJECTS };

// Fresh, mutable copy of what the validator would hand over.
function parsedFor(variant = "valid", mutate) {
  const p = sessionParts({ sessionId: SID, variant });
  const parsed = {
    manifest: { sessionId: SID, configVersion: p.configVersion, files: [] },
    examination: structuredClone(p.examination),
    participant: structuredClone(p.participant),
    snapshot: structuredClone(p.snapshot),
    timelineOriginal: structuredClone(p.timelineOriginal),
    timelineEdited: p.files.has("timeline_edited.json") ? JSON.parse(p.files.get("timeline_edited.json")) : null,
  };
  mutate?.(parsed);
  return parsed;
}
const run = (variant, mutate, ctx = {}) => extractSession(parsedFor(variant, mutate), { ...CTX, ...ctx }).columns;

describe("extractSession: row fields", () => {
  it("fills the columns of a clean session", () => {
    const c = run("valid");
    expect(c).toMatchObject({
      project_id: 8, protocol_id: 81, protocol_name: PROTOCOL_NAME, protocol_project: PROTOCOL_PROJECT,
      config_version: CONFIG_VERSION,
      started_at: "2026-10-13 07:54:51.746", ended_at: "2026-10-13 08:10:00.000", processed_at: "2026-10-13 08:10:01.200",
      duration_s: 908, tasks_total: 5, tasks_done: 5, tasks_skipped: 0,
      audio_clips: 3, video_clips: 2, has_audio: true, recovered: false, interruptions: 0, timeline_used: "original",
      patient_code: "testx", visit_number: "1", flags: [],
    });
    expect(c.participant_fields).toEqual({ patient_code: "testx", visit_number: "1", sex: "female", year_of_birth: "1950" });
  });

  it("truncates (never rounds) fractional seconds to milliseconds and pads short ones", () => {
    expect(toDbDate("2026-10-13T07:54:51.746661100Z")).toBe("2026-10-13 07:54:51.746");
    expect(toDbDate("2026-10-13T07:54:51.9999999Z")).toBe("2026-10-13 07:54:51.999");
    expect(toDbDate("2026-10-13T07:54:51Z")).toBe("2026-10-13 07:54:51.000");
    expect(toDbDate("2026-10-13T07:54:51.2Z")).toBe("2026-10-13 07:54:51.200");
    expect(toDbDate("garbage")).toBeNull();
    expect(toDbDate(undefined)).toBeNull();
  });

  it("has_audio is false for a no-master session, and audio clips are 0", () => {
    const c = run("noMaster");
    expect(c.has_audio).toBe(false);
    expect(c.audio_clips).toBe(0);
    expect(c.video_clips).toBe(2);
    expect(c.tasks_done).toBe(5);
  });

  it("duration falls back to processedAt without endedAt", () => {
    const c = run("recoveredInterrupted");
    expect(c.ended_at).toBeNull();
    expect(c.duration_s).toBe(Math.round((Date.parse("2026-10-13T08:10:01.200Z") - Date.parse("2026-10-13T07:54:51.746Z")) / 1000));
  });

  it("applies the UD §6 defaults when fields are omitted", () => {
    const c = run("valid", (p) => {
      p.examination = { sessionId: SID, protocolName: PROTOCOL_NAME, startedAt: "2026-10-13T07:00:00Z",
        processing: { processedAt: "2026-10-13T07:10:00Z" }, tasks: [{ taskIndex: 0, type: "VOCAL", subtype: "PHONATION", repetition: 1 }] };
      p.participant = {};
      p.manifest = {};
      p.snapshot = null;
      p.timelineOriginal = null;
    });
    expect(c).toMatchObject({
      recovered: false, interruptions: 0, has_audio: false, timeline_used: "original", config_version: null,
      audio_clips: 0, video_clips: 0, tasks_total: 1, tasks_done: 1, tasks_skipped: 0,
      project_id: null, protocol_id: null, patient_code: null, visit_number: null, participant_fields: {}, ended_at: null,
    });
    expect(c.flags).toEqual([]);
    expect(c.exam_summary.interruptions).toEqual([]);
    expect(c.exam_summary.videoTakes).toEqual([]);
    expect(c.exam_summary.tasks[0].takes).toBe(0);
    expect(c.exam_summary.timeline).toEqual([]);
  });
});

describe("extractSession: project and protocol matching", () => {
  it("matches the project by name, then the protocol within that project", () => {
    const c = run("valid");
    expect([c.project_id, c.protocol_id]).toEqual([8, 81]); // not project 7's protocol of the same name
  });

  it("leaves the project NULL when it is not among the site's projects", () => {
    const c = run("valid", (p) => { p.examination.protocolProject = "Unknown Study"; });
    expect([c.project_id, c.protocol_id]).toEqual([null, null]);
    expect(c.protocol_project).toBe("Unknown Study");
  });

  it("leaves only the protocol NULL when the project matches but the name does not", () => {
    const c = run("valid", (p) => { p.examination.protocolName = "Renamed"; });
    expect([c.project_id, c.protocol_id]).toEqual([8, null]);
    expect(c.protocol_name).toBe("Renamed");
  });

  it("does not match anything for a quarantined session (no projects)", () => {
    const c = run("valid", null, { projects: [] });
    expect([c.project_id, c.protocol_id]).toEqual([null, null]);
  });
});

describe("extractSession: task results", () => {
  const byIndex = (c) => Object.fromEntries(c.exam_summary.tasks.map((t) => [t.taskIndex, t.result]));

  it("marks a skipped instance Skipped and counts it", () => {
    const c = run("valid", (p) => { p.examination.tasks[1].skipped = true; delete p.examination.tasks[1].clipFile; });
    expect(byIndex(c)).toEqual({ 0: "Done", 1: "Skipped", 2: "Done", 3: "Done", 4: "Done" });
    expect([c.tasks_total, c.tasks_done, c.tasks_skipped]).toEqual([5, 4, 1]);
    expect(c.flags).toContain("skipped");
  });

  it("marks an instance absent from examination.tasks Missing, with its type from the snapshot", () => {
    const c = run("valid", (p) => { p.examination.tasks = p.examination.tasks.filter((t) => t.taskIndex !== 2); });
    expect(byIndex(c)[2]).toBe("Missing");
    expect([c.tasks_total, c.tasks_done, c.tasks_skipped]).toEqual([5, 4, 0]);
    const missing = c.exam_summary.tasks[2];
    expect(missing).toMatchObject({ type: "VOCAL", subtype: "READING", repetition: 1, clipFile: null, takes: 0 });
  });

  it("expands nrepetition into consecutive instances", () => {
    const c = run("valid");
    expect(c.exam_summary.tasks.map((t) => [t.taskIndex, t.subtype ?? t.type, t.repetition]))
      .toEqual([[0, "PHONATION", 1], [1, "PHONATION", 2], [2, "READING", 1], [3, "QUESTIONNAIRE", 1], [4, "VIDEO", 1]]);
  });

  it("falls back to examination.tasks when the snapshot has no such protocol", () => {
    const c = run("valid", (p) => { p.snapshot.protocols[0].name = "Another"; });
    expect(c.tasks_total).toBe(5);
    expect(c.tasks_done).toBe(5);
  });

  it("falls back to examination.tasks when there is no snapshot", () => {
    const c = run("valid", (p) => { p.snapshot = null; p.examination.tasks.pop(); });
    expect(c.tasks_total).toBe(4);
  });

  it("carries clip, video and questionnaire data into exam_summary", () => {
    const t = run("valid").exam_summary.tasks;
    expect(t[2].clipFile).toMatch(/_2_READING_1\.wav$/);
    expect(t[2].videoFile).toMatch(/_2_READING_1\.mp4$/);
    expect(t[3].questionnaireAnswers).toEqual({ mood: ["good"], symptoms: ["tremor", "fatigue"] });
    expect(t[0].takes).toBe(1);
  });
});

describe("extractSession: flags", () => {
  const flags = (variant, mutate, ctx) => run(variant, mutate, ctx).flags;

  it("a clean session has none", () => expect(flags("valid")).toEqual([]));

  it("recovered / interrupted", () => {
    expect(flags("recoveredInterrupted")).toEqual(expect.arrayContaining(["recovered", "interrupted", "device"]));
    expect(flags("valid")).not.toContain("recovered");
    expect(flags("valid")).not.toContain("interrupted");
  });

  it("skipped", () => {
    expect(flags("valid", (p) => { p.examination.tasks[0].skipped = true; })).toContain("skipped");
    expect(flags("valid", (p) => { p.examination.tasks[0].skipped = false; })).not.toContain("skipped");
  });

  it("retakes needs takes > 1", () => {
    expect(flags("valid", (p) => { p.examination.tasks[0].takes = 2; })).toContain("retakes");
    expect(flags("valid")).not.toContain("retakes");
  });

  it("edited follows processing.timelineUsed", () => {
    expect(flags("edited")).toContain("edited");
    expect(flags("valid")).not.toContain("edited");
  });

  it("outdated compares config versions as strings", () => {
    expect(flags("oldConfig")).toContain("outdated");
    expect(flags("valid")).not.toContain("outdated");
    expect(flags("oldConfig", null, { currentConfigVersion: null })).not.toContain("outdated");
    expect(flags("valid", null, { currentConfigVersion: "2026-10-05.080232" })).toContain("outdated");
    expect(flags("valid", null, { currentConfigVersion: "2026-10-05.080230" })).not.toContain("outdated");
  });

  it("late means more than 72 h after the end", () => {
    // endedAt is 2026-10-13T08:10:00Z
    expect(flags("valid", null, { receivedAt: "2026-10-16T08:10:00.001Z" })).toContain("late");
    expect(flags("valid", null, { receivedAt: "2026-10-16T08:10:00.000Z" })).not.toContain("late");
    expect(flags("valid", null, { receivedAt: "2026-10-14T08:10:00.000Z" })).not.toContain("late");
  });

  it("late falls back to processedAt without endedAt", () => {
    // processedAt is 2026-10-13T08:10:01.200Z
    expect(flags("recoveredInterrupted", null, { receivedAt: "2026-10-16T08:10:01.300Z" })).toContain("late");
    expect(flags("recoveredInterrupted", null, { receivedAt: "2026-10-16T08:10:01.100Z" })).not.toContain("late");
  });

  it("nonstdMic only when every use differs from the configured mic", () => {
    expect(flags("nonstdMic")).toContain("nonstdMic");
    expect(flags("valid")).not.toContain("nonstdMic");
    const second = (p) => { p.examination.hardware.micUses.push({ deviceId: "Mic A|Vendor|1" }); };
    expect(flags("nonstdMic", second)).not.toContain("nonstdMic");
    expect(flags("nonstdMic", (p) => { p.examination.hardware.micUses.push({ deviceId: "Other" }); })).toContain("nonstdMic");
    expect(flags("nonstdMic", (p) => { delete p.examination.hardware.configuredMicDeviceId; })).not.toContain("nonstdMic");
    expect(flags("nonstdMic", (p) => { p.examination.hardware.micUses = []; })).not.toContain("nonstdMic");
  });

  it("nonstdCam follows the same rule", () => {
    const f = (mutate) => flags("valid", (p) => mutate(p.examination.hardware));
    expect(f((h) => { h.cameraUses[0].deviceId = "dshow:1:USB Camera"; })).toContain("nonstdCam");
    expect(f(() => {})).not.toContain("nonstdCam");
    expect(f((h) => { h.cameraUses[0].deviceId = "x"; h.cameraUses.push({ deviceId: h.configuredCameraDeviceId }); })).not.toContain("nonstdCam");
    expect(f((h) => { h.cameraUses = []; })).not.toContain("nonstdCam");
    expect(f((h) => { delete h.configuredCameraDeviceId; h.cameraUses[0].deviceId = "x"; })).not.toContain("nonstdCam");
  });

  it("device flags interrupted and capture_failed hardware events only", () => {
    const ev = (event) => (p) => { p.examination.hardware.events = [{ at: "2026-10-13T08:00:00Z", device: "camera", event }]; };
    expect(flags("valid", ev("capture_failed"))).toContain("device");
    expect(flags("valid", ev("interrupted"))).toContain("device");
    expect(flags("valid", ev("gain_changed"))).not.toContain("device");
  });

  it("keeps existing flags such as duplicate, without duplicates", () => {
    const f = flags("recoveredInterrupted", null, { existingFlags: ["duplicate", "recovered"] });
    expect(f).toContain("duplicate");
    expect(f.filter((x) => x === "recovered")).toHaveLength(1);
    expect(new Set(f).size).toBe(f.length);
  });
});

describe("extractSession: hostile input", () => {
  it("clamps nrepetition to 100 and caps the expected instances at 2000, quickly", () => {
    const t0 = Date.now();
    const list = taskInstances(parsedFor("hugeRepetition").examination, parsedFor("hugeRepetition").snapshot);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(list).toHaveLength(MAX_TASK_INSTANCES);
    expect(list.capped).toBe(true);
    // Instances 5..99 have no exam task, so their type comes from the snapshot.
    expect(list.slice(5, 100).every((i) => i.subtype === "PHONATION" && i.result === "Missing")).toBe(true);
    expect(list[99].repetition).toBe(100);
    expect(list[100].subtype).toBe("READING"); // the first task stopped at 100 repetitions
    expect(run("hugeRepetition").tasks_total).toBe(MAX_TASK_INSTANCES);
  });

  it("clamps a single huge nrepetition without hitting the total cap", () => {
    const snap = snapshot();
    snap.protocols[0].tasks[0].nrepetition = 1e9;
    const list = taskInstances(parsedFor().examination, snap);
    expect(list).toHaveLength(MAX_REPETITION + 3);
    expect(list.capped).toBe(true);
    expect(taskInstances(parsedFor().examination, snapshot()).capped).toBe(false);
  });

  it("caps the fallback to examination.tasks too", () => {
    const exam = { tasks: Array.from({ length: MAX_TASK_INSTANCES + 5 }, (_, i) => ({ taskIndex: i })) };
    const list = taskInstances(exam, null);
    expect(list).toHaveLength(MAX_TASK_INSTANCES);
    expect(list.capped).toBe(true);
  });

  it("skips null and non-object elements in tasks, events and segments", () => {
    const c = run("nullTask", (p) => {
      p.examination.tasks.push(7, "x", [1]);
      p.examination.processing.timelineUsed = "edited";
      p.timelineEdited = { segments: [null, 3, { taskIndex: 0, startSample: 1, stopSample: 2 }] };
      p.timelineOriginal.events.push(5, [], { type: "START_BUTTON_PRESSED", taskIndex: { toString: 1 }, take: 1 });
      p.snapshot.protocols[0].tasks.unshift(null);
    });
    expect(c).toMatchObject({ tasks_total: 5, tasks_done: 5, audio_clips: 3, video_clips: 2 });
    expect(c.exam_summary.timeline.find((s) => s.taskIndex === 0).kept).toEqual({ take: 1, startSample: 1, stopSample: 2 });
  });

  it("does not throw on a null task with no snapshot either", () => {
    expect(run("nullTask", (p) => { p.snapshot = null; }).tasks_total).toBe(5);
  });

  it("truncates string columns to their lengths", () => {
    const c = run("longStrings");
    expect(c.protocol_name).toBe(LONG.protocolName.slice(0, 100));
    expect(c.protocol_project).toBe(LONG.protocolProject.slice(0, 255));
    expect(c.config_version).toBe(LONG.configVersion.slice(0, 32));
    expect(c.patient_code).toBe(LONG.patientCode.slice(0, 255));
    expect(c.visit_number).toBe(LONG.visitNumber.slice(0, 64));
    expect(c.participant_fields.patient_code).toBe(LONG.patientCode); // the JSON keeps it whole
    expect(c.project_id).toBeNull(); // a truncated name never matches
  });

  it("truncates by code point, never splitting a surrogate pair", () => {
    expect(str("😀".repeat(70), 64)).toBe("😀".repeat(64));
  });

  it("coerces non-string scalars and drops objects and arrays", () => {
    const c = run("valid", (p) => {
      p.examination.protocolName = ["a", "b"];
      p.examination.protocolProject = { toString: 1 };
      p.examination.configVersion = 2026;
      p.manifest.configVersion = 2026;
      p.participant.fields.patient_code = 12345;
      p.participant.fields.visit_number = { v: 1 };
    });
    expect(c).toMatchObject({ protocol_name: null, protocol_project: null, config_version: "2026",
      patient_code: "12345", visit_number: null, project_id: null });
  });

  it("drops dates outside the DATETIME range and a duration beyond INT", () => {
    expect(toDbDate("0999-12-31T23:00:00Z")).toBeNull();
    expect(toDbDate("9999-12-31T23:00:00-05:00")).toBeNull();
    expect(toDbDate("1000-01-01T00:00:00Z")).toBe("1000-01-01 00:00:00.000");
    const c = run("valid", (p) => { p.examination.startedAt = "1000-01-01T00:00:00Z"; });
    expect(c.duration_s).toBeNull();
  });
});

describe("extractSession: exam_summary", () => {
  it("carries capture format, hardware, interruptions, videoTakes and sampleRate", () => {
    const s = run("recoveredInterrupted").exam_summary;
    expect(s.captureFormat).toEqual({ sampleRate: 48000, bits: 16, channels: 1 });
    expect(s.hardware.configuredMicDeviceId).toBe("Mic A|Vendor|1");
    expect(s.interruptions).toHaveLength(1);
    expect(s.videoTakes).toHaveLength(2);
    expect(s.sampleRate).toBe(48000);
  });

  it("builds the kept take per instance from timeline_original", () => {
    const s = run("valid").exam_summary;
    expect(s.timelineUsed).toBe("original");
    expect(s.timeline[0]).toEqual({ taskIndex: 0, repetition: 1, kept: { take: 1, startSample: 48000, stopSample: 144000 }, rejected: [] });
    // the questionnaire has no take
    expect(s.timeline.find((t) => t.taskIndex === 3)).toBeUndefined();
  });

  it("lists rejected takes with their reason and keeps the last take that was not rejected", () => {
    const s = run("valid", (p) => {
      const ev = (type, off, take, reason) => ({ type, sampleOffset: off, wallClock: "2026-10-13T08:00:00Z", taskIndex: 0, repetition: 1, take, ...(reason ? { reason } : {}) });
      p.timelineOriginal.events = [
        ev("START_BUTTON_PRESSED", 100, 1), ev("STOP_BUTTON_PRESSED", 200, 1), ev("TAKE_REJECTED", 210, 1, "EXAMINER_REPEAT"),
        ev("START_BUTTON_PRESSED", 300, 2), ev("STOP_BUTTON_PRESSED", 500, 2),
      ];
    }).exam_summary;
    expect(s.timeline).toEqual([{
      taskIndex: 0, repetition: 1,
      kept: { take: 2, startSample: 300, stopSample: 500 },
      rejected: [{ take: 1, startSample: 100, stopSample: 200, reason: "EXAMINER_REPEAT" }],
    }]);
  });

  it("uses the segments of timeline_edited when timelineUsed is edited", () => {
    const s = run("edited").exam_summary;
    expect(s.timelineUsed).toBe("edited");
    expect(s.timeline[0].kept).toEqual({ take: 1, startSample: 40000, stopSample: 150000 });
    // the instances without an edited segment keep the original boundaries
    expect(s.timeline[1].kept).toEqual({ take: 1, startSample: 48000 + 240000, stopSample: 144000 + 240000 });
  });

  it("ignores timeline_edited unless it was the one used", () => {
    const s = run("edited", (p) => { p.examination.processing.timelineUsed = "original"; }).exam_summary;
    expect(s.timeline[0].kept.startSample).toBe(48000);
  });

  it("works for a no-master session: null sample offsets", () => {
    const s = run("noMaster").exam_summary;
    expect(s.captureFormat).toBeNull();
    expect(s.timeline[0].kept).toEqual({ take: 1, startSample: null, stopSample: null });
    expect(s.tasks.every((t) => t.clipFile === null)).toBe(true);
  });
});

describe("needsAttention", () => {
  const base = { status: "valid", qc: "unreviewed", flags: [] };
  it("is false for a clean valid session", () => expect(needsAttention(base)).toBe(false));
  it("is true for invalid", () => expect(needsAttention({ ...base, status: "invalid" })).toBe(true));
  it("is true for qc review, false for other qc values", () => {
    expect(needsAttention({ ...base, qc: "review" })).toBe(true);
    for (const qc of ["ok", "excluded", "unreviewed"]) expect(needsAttention({ ...base, qc })).toBe(false);
  });
  it.each(["recovered", "interrupted", "nonstdMic", "nonstdCam"])("is true for flag %s", (f) => {
    expect(needsAttention({ ...base, flags: [f] })).toBe(true);
  });
  it.each(["skipped", "retakes", "edited", "outdated", "late", "duplicate", "device"])("is false for flag %s alone", (f) => {
    expect(needsAttention({ ...base, flags: [f] })).toBe(false);
  });
  it("validating sessions are not flagged by status alone", () => {
    expect(needsAttention({ ...base, status: "validating" })).toBe(false);
  });
});
