/* Mock data for the Upload Monitoring previews.
   Shapes follow what the server can know about a session upload:
   - multipart form: installationId, sessionId, zipSha256, zip   (+ siteToken, appVersion = phase B)
   - ZIP: examination.json, participant.json, manifest.json, timeline_*.json, clips/
   - device check-in (phase B): lastSeen, localPending, localFailed
   "Today" in the mock is 2026-10-12. */
(function () {
  const NOW = new Date("2026-10-12T14:20:00Z");
  const CURRENT_CONFIG = "2026-10-01.081500";
  const CURRENT_APP = "1.4.2";

  const sites = [
    { id: "paris", dbId: 1, name: "Paris", country: "France", contact: "Alice Martin", projects: ["Test Study 001", "Test Study 002"] },
    { id: "london", dbId: 2, name: "London", country: "United Kingdom", contact: "Oliver Brown", projects: ["Test Study 001"] },
    { id: "prague", dbId: 12, name: "Prague", country: "Czechia", contact: "Jana Dvořáková", projects: ["Czech Clinic Study", "Test Study 002"] },
  ];

  // Protocol task lists, as the desktop app expands them (one entry per repetition).
  const protocols = {
    "PD-battery": {
      project: "Test Study 001",
      tasks: [
        { type: "VOCAL", subtype: "PHONATION", len: 8 },
        { type: "VOCAL", subtype: "PHONATION", len: 8, rep: 2 },
        { type: "VOCAL", subtype: "PATAKA", len: 10 },
        { type: "VOCAL", subtype: "SYLLABLES", len: 10 },
        { type: "VOCAL", subtype: "READING", len: 45 },
        { type: "VOCAL", subtype: "MONOLOGUE", len: 90, video: true },
        { type: "VOCAL", subtype: "PICTURE_DESCRIPTION", len: 60, video: true },
        { type: "QUESTIONNAIRE", subtype: "VHI-10", len: 120 },
      ],
    },
    "Speech baseline": {
      project: "Test Study 002",
      tasks: [
        { type: "INFO", subtype: null, len: 20 },
        { type: "VOCAL", subtype: "PHONATION", len: 8 },
        { type: "VOCAL", subtype: "READING", len: 45 },
        { type: "VOCAL", subtype: "RETELLING", len: 60 },
        { type: "QUESTIONNAIRE", subtype: "PHQ-9", len: 150 },
      ],
    },
    "Clinic questionnaires": {
      project: "Czech Clinic Study",
      tasks: [
        { type: "INFO", subtype: null, len: 30 },
        { type: "QUESTIONNAIRE", subtype: "PHQ-9", len: 150 },
        { type: "QUESTIONNAIRE", subtype: "GAD-7", len: 110 },
      ],
    },
  };
  const protocolsBySite = {
    paris: ["PD-battery", "PD-battery", "Speech baseline"],
    london: ["PD-battery"],
    prague: ["Clinic questionnaires", "Speech baseline", "Speech baseline"],
  };

  const devices = [
    { id: "8f3c2a1e-4b7d-4c19-9a2e-61d0f5b3c7a4", label: "PAR-Neuro-1", site: "paris", appVersion: CURRENT_APP, lastConfig: "2026-10-12T07:58:00Z", lastSeen: "2026-10-12T13:41:00Z", localPending: 0, localFailed: 0 },
    { id: "c41d7e90-2f6a-4d3b-8e15-0b9a7c2e5f18", label: "PAR-Speech-2", site: "paris", appVersion: CURRENT_APP, lastConfig: "2026-10-11T08:10:00Z", lastSeen: "2026-10-11T16:02:00Z", localPending: 3, localFailed: 1 },
    { id: "DEMO-002", label: "LON-Clinic-A", site: "london", appVersion: "1.3.0", lastConfig: "2026-09-22T09:00:00Z", lastSeen: "2026-10-03T10:15:00Z", localPending: 2, localFailed: 0 },
    { id: "5b0e9d3c-7a21-4f8e-b6c4-3d2a1f9e8b70", label: "LON-Clinic-B", site: "london", appVersion: CURRENT_APP, lastConfig: "2026-10-10T08:30:00Z", lastSeen: "2026-10-12T09:12:00Z", localPending: 0, localFailed: 0 },
    { id: "e7a94c02-1d5b-4a6f-93c8-2b4e6f0d1a95", label: "PRG-Ambulance", site: "prague", appVersion: CURRENT_APP, lastConfig: "2026-10-12T06:45:00Z", lastSeen: "2026-10-12T12:30:00Z", localPending: 0, localFailed: 0 },
    { id: "a03f6b8d-9c2e-4e71-a5d4-8f1b0c3e7d26", label: "PRG-Ward-3", site: "prague", appVersion: CURRENT_APP, lastConfig: "2026-10-09T07:20:00Z", lastSeen: "2026-10-09T07:21:00Z", localPending: 0, localFailed: 0, neverUploaded: true },
  ];

  // deterministic PRNG so every preview shows the same data
  let seed = 20261012;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const hex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join("");

  const examiners = { paris: ["AM", "LD"], london: ["OB", "SK"], prague: ["JD", "PN"] };
  const people = { AM: "Alice Martin", LD: "Luc Durand", OB: "Oliver Brown", SK: "Sara Khan", JD: "Jana Dvořáková", PN: "Petr Novák", MS: "System Master" };

  // hand-placed situations that the UI must make visible
  const scripted = {
    3: { status: "invalid", invalidReason: "checksum", attemptsExtra: ["bad400"] },
    7: { recovered: true, qc: "review", comment: "App crashed after the reading task; session rebuilt on restart. Check the last two clips." },
    9: { interruptions: 1, qc: "review", comment: "Mic unplugged during PATAKA, take was redone." },
    12: { status: "invalid", invalidReason: "manifest" },
    14: { duplicates: 2 },
    16: { edited: true, qc: "ok" },
    18: { lateDays: 9 },
    21: { status: "validating" },
    22: { qc: "excluded", comment: "Wrong participant code entered at the clinic. Re-recorded as PD2340." },
    25: { status: "invalid", invalidReason: "unknown_device" },
  };

  const sessions = [];
  const siteCycle = ["paris", "prague", "london", "paris", "prague", "paris", "london"];
  for (let i = 0; i < 34; i++) {
    const sc = scripted[i] || {};
    const site = siteCycle[i % siteCycle.length];
    const siteDevices = devices.filter((d) => d.site === site && !d.neverUploaded);
    const dev = siteDevices[i % siteDevices.length];
    const protocolName = pick(protocolsBySite[site]);
    const proto = protocols[protocolName];

    // received times spread over the last ~20 days, newest first
    const received = new Date(NOW.getTime() - (i * 13.7 + rnd() * 6) * 3600e3);
    const lagH = sc.lateDays ? sc.lateDays * 24 : 0.2 + rnd() * (rnd() < 0.25 ? 50 : 4);
    const ended = new Date(received.getTime() - lagH * 3600e3);

    // tasks
    const tasks = proto.tasks.map((t, idx) => {
      const skipped = !sc.recovered && t.type !== "INFO" && rnd() < 0.07;
      const takes = skipped ? 0 : t.type === "VOCAL" ? (rnd() < 0.07 ? 2 : 1) : 1;
      return { taskIndex: idx, type: t.type, subtype: t.subtype, repetition: t.rep || 1, takes, skipped, len: t.len, video: !!t.video };
    });
    if (sc.recovered) { tasks[tasks.length - 1].missing = true; tasks[tasks.length - 2].missing = true; }
    const durS = tasks.reduce((a, t) => a + (t.skipped || t.missing ? 4 : t.len * t.takes + 25), 0) + 60;
    const started = new Date(ended.getTime() - durS * 1000);

    const hasAudio = tasks.some((t) => t.type === "VOCAL");
    const audioClips = tasks.filter((t) => t.type === "VOCAL" && !t.skipped && !t.missing).length;
    const videoClips = tasks.filter((t) => t.video && !t.skipped && !t.missing).length;
    const bytes = hasAudio ? Math.round((durS * 96000 * 1.9 + videoClips * 38e6 * (0.7 + rnd() * 0.6))) : Math.round(18000 + rnd() * 9000);

    const prefix = protocolName === "PD-battery" ? (rnd() < 0.65 ? "PD" : "HC") : protocolName === "Speech baseline" ? "SB" : "CQ";
    const code = prefix + String(2300 + ((i * 37) % 97)).padStart(4, "0");
    const visit = "V" + (1 + (i % 4));

    const configVersion = dev.appVersion === "1.3.0" || i % 11 === 5 ? "2026-09-10.093000" : CURRENT_CONFIG;
    const status = sc.status || "valid";
    const qc = sc.qc || (status !== "valid" ? "unreviewed" : i < 6 ? "unreviewed" : rnd() < 0.8 ? "ok" : "unreviewed");

    const issues = [];
    if (sc.recovered) issues.push("recovered");
    if (sc.interruptions) issues.push("interrupted");
    if (tasks.some((t) => t.skipped)) issues.push("skipped");
    if (tasks.some((t) => t.takes > 1)) issues.push("retakes");
    if (sc.edited) issues.push("edited");
    if (configVersion !== CURRENT_CONFIG) issues.push("outdated");
    if (lagH > 72) issues.push("late");
    if (sc.duplicates) issues.push("duplicate");

    const attempts = [];
    if ((sc.attemptsExtra || []).includes("bad400")) {
      attempts.push({ at: new Date(received.getTime() - 40 * 60e3).toISOString(), code: 400, outcome: "Checksum mismatch: declared ≠ computed" });
    }
    if (i === 9) attempts.push({ at: new Date(received.getTime() - 3 * 3600e3).toISOString(), code: 0, outcome: "No request reached the server (device reported NetworkFailure at next check-in)", deviceReported: true });
    attempts.push({ at: received.toISOString(), code: status === "invalid" && sc.invalidReason === "unknown_device" ? 404 : 200, outcome: status === "invalid" && sc.invalidReason === "unknown_device" ? "Accepted into quarantine: installation not registered to any site" : "Accepted" });
    for (let k = 0; k < (sc.duplicates || 0); k++) {
      attempts.push({ at: new Date(received.getTime() + (k + 1) * 26 * 60e3).toISOString(), code: 409, outcome: "Duplicate sessionId: already received, answered as success" });
    }

    const ex = examiners[site];
    const comments = [];
    if (sc.comment) comments.push({ who: ex[0], at: new Date(received.getTime() + 20 * 3600e3).toISOString(), text: sc.comment });
    if (qc === "ok" && i % 3 === 0) comments.push({ who: "MS", at: new Date(received.getTime() + 30 * 3600e3).toISOString(), system: true, text: "marked as OK" });

    sessions.push({
      id: hex(32),
      site, deviceId: dev.id, appVersion: dev.appVersion,
      protocol: protocolName, project: proto.project, configVersion,
      startedAt: started.toISOString(), endedAt: ended.toISOString(), receivedAt: received.toISOString(),
      durationS: durS, bytes, zipSha256: hex(64),
      status, invalidReason: sc.invalidReason || null,
      qc, issues, tasks, audioClips, videoClips, hasAudio,
      recovered: !!sc.recovered, interruptions: sc.interruptions || 0, timelineUsed: sc.edited ? "edited" : "original",
      participant: {
        patient_code: code, visit_number: visit,
        sex: rnd() < 0.5 ? "female" : "male",
        year_of_birth: String(1942 + Math.floor(rnd() * 40)),
        education: pick(["primary education", "secondary education", "tertiary education"]),
        ...(site === "prague" ? { surname: pick(["Novák", "Svobodová", "Dvořák", "Černá"]) } : {}),
        current_date: ended.toISOString().slice(0, 10),
      },
      examinerInitials: ex[i % 2],
      attempts, comments,
      captureFormat: hasAudio ? { sampleRate: 48000, bits: 16, channels: 1 } : null,
    });
  }

  // derive device "last upload"
  devices.forEach((d) => {
    const s = sessions.filter((x) => x.deviceId === d.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    d.lastUpload = s ? s.receivedAt : null;
    d.uploads30 = sessions.filter((x) => x.deviceId === d.id).length;
  });

  const projects = [
    { id: "ts1", name: "Test Study 001", description: "Initial testing project", contact: "Alice Martin", start: "2026-03-01" },
    { id: "ts2", name: "Test Study 002", description: "Second testing project", contact: "Jana Dvořáková", start: "2026-05-15" },
    { id: "czech", name: "Czech Clinic Study", description: "Desktop-app sample project", contact: "Petr Novák", start: "2026-08-01" },
  ];

  // "View as" personas, written as the grant rows the backend stores
  // (accessScope.js): projects = user_projects (+ can_edit, + optional
  // user_project_sites whitelist), sites = user_sites.
  const personas = {
    master:   { name: "System Master", role: "Master", initials: "MS", master: true, about: "Sees and does everything, including quarantined uploads from unknown devices." },
    project:  { name: "Project Admin", role: "Admin", initials: "PA", projects: [{ project: "Test Study 001", canEdit: true }], sites: [],
                about: "user_projects: Test Study 001 (can_edit). Sees that project at all of its clinics, not the other projects at those clinics." },
    site:     { name: "Clinic Admin", role: "Admin", initials: "CA", projects: [], sites: ["prague"],
                about: "user_sites: Prague. Sees and works on every Prague session (review, comment, download, participant fields); the projects reached through the clinic stay read-only." },
    narrowed: { name: "Reviewer", role: "Admin", initials: "RV", projects: [{ project: "Test Study 002", canEdit: false, onlySites: ["paris"] }], sites: [],
                about: "user_projects: Test Study 002 (read-only), user_project_sites: Paris. Sees Test Study 002 at Paris only." },
  };
  Object.values(personas).forEach((p) => (people[p.initials] = p.name));

  window.UM_DATA = { NOW, CURRENT_CONFIG, CURRENT_APP, sites, projects, protocols, devices, sessions, people, personas };
})();
