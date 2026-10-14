/* Shared helpers for the Upload Monitoring previews: formatting, status meta,
   the app top bar and the preview navigation bar. */
(function () {
  const D = window.UM_DATA;

  // ---------- access scope ("View as") ----------
  // Mirrors backend/src/utils/accessScope.js, applied per (site, project) pair:
  //   session visible = its site is in user_sites
  //                  OR its project is in user_projects AND its site is allowed
  //                     for that project (user_project_sites whitelist, else all
  //                     of the project's clinics)
  //   session editable (download, reveal, review, comment) = master, or its
  //                     site is in user_sites (clinic staff know their patients
  //                     and correct their own recordings), or can_edit on the
  //                     project grant that makes it visible. Project/protocol
  //                     editing stays project-grant only (canEditProject).
  const ALL = { sessions: D.sessions, devices: D.devices, sites: D.sites, projects: D.projects, protocols: D.protocols };
  const uniq = (a) => [...new Set(a)];
  const projectSiteIds = (name) => ALL.sites.filter((s) => s.projects.includes(name)).map((s) => s.id);
  function scopeFor(P) {
    if (P.master) return {
      P, siteIds: ALL.sites.map((s) => s.id), projectNames: ALL.projects.map((p) => p.name),
      canSee: () => true, canEdit: () => true, canEditProject: () => true, seesBacklog: () => true,
    };
    const allowed = (g) => g.onlySites || projectSiteIds(g.project);
    const viaGrant = (s) => P.projects.find((g) => g.project === s.project && allowed(g).includes(s.site));
    const canSee = (s) => s.invalidReason !== "unknown_device" && (P.sites.includes(s.site) || !!viaGrant(s));
    return {
      P,
      siteIds: uniq([...P.sites, ...P.projects.flatMap(allowed)]),
      projectNames: uniq([...P.projects.map((g) => g.project), ...ALL.sites.filter((s) => P.sites.includes(s.id)).flatMap((s) => s.projects)]),
      canSee,
      canEdit: (s) => canSee(s) && (P.sites.includes(s.site) || !!viaGrant(s)?.canEdit),
      canEditProject: (name) => P.projects.some((g) => g.project === name && g.canEdit),
      // Device check-in counts are per device, not per project, so only a
      // clinic grant (or master) may see them.
      seesBacklog: (d) => P.sites.includes(d.site),
    };
  }
  let personaKey = "master";
  try { personaKey = localStorage.getItem("um-persona") || "master"; } catch (e) {}
  if (!D.personas[personaKey]) personaKey = "master";
  const SC = scopeFor(D.personas[personaKey]);

  // Every page reads D.*, so swapping in the scoped lists scopes every page.
  D.ALL = ALL;
  D.sessions = ALL.sessions.filter(SC.canSee);
  D.projects = ALL.projects.filter((p) => SC.projectNames.includes(p.name));
  D.protocols = Object.fromEntries(Object.entries(ALL.protocols).filter(([, p]) => SC.projectNames.includes(p.project)));
  D.sites = ALL.sites.filter((s) => SC.siteIds.includes(s.id))
    .map((s) => ({ ...s, projects: s.projects.filter((p) => SC.projectNames.includes(p)) }));
  D.devices = ALL.devices.filter((d) => SC.siteIds.includes(d.site)).map((d) => {
    const mine = D.sessions.filter((x) => x.deviceId === d.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    const out = { ...d, lastUpload: mine[0] ? mine[0].receivedAt : null, uploads30: mine.length };
    return SC.seesBacklog(d) ? out : { ...out, localPending: 0, localFailed: 0, backlogHidden: true };
  });

  const STATUS = {
    valid:      { cls: "ok",   label: "Valid",       hint: "Checksum and manifest verified" },
    validating: { cls: "info", label: "Validating",  hint: "Received, checks running" },
    invalid:    { cls: "bad",  label: "Invalid",     hint: "Failed a server check" },
  };
  const INVALID_REASON = {
    checksum: "ZIP checksum mismatch",
    manifest: "Manifest hash mismatch",
    malformed: "Malformed archive",
    unknown_device: "Device not registered",
  };
  const QC = {
    unreviewed: { cls: "outline", label: "Unreviewed", icon: "○" },
    ok:         { cls: "ok",      label: "OK",         icon: "✓" },
    review:     { cls: "warn",    label: "Needs review", icon: "!" },
    excluded:   { cls: "off",     label: "Excluded",   icon: "⊘" },
  };
  const ISSUES = {
    recovered:   { cls: "bad",  label: "Recovered",       hint: "App crashed; session rebuilt and may be incomplete (examination.json → recovered)" },
    interrupted: { cls: "bad",  label: "Mic interrupted", hint: "Microphone lost mid-session (examination.json → interruptions[])" },
    skipped:     { cls: "warn", label: "Skipped tasks",   hint: "One or more tasks skipped by the examiner" },
    retakes:     { cls: "",     label: "Retakes",         hint: "A task was repeated; only the last take is exported" },
    edited:      { cls: "info", label: "Edited timeline", hint: "Segment boundaries adjusted in the waveform editor" },
    outdated:    { cls: "warn", label: "Old config",      hint: "Recorded with a config version older than the current one" },
    late:        { cls: "warn", label: "Late upload",     hint: "Uploaded more than 3 days after recording" },
    duplicate:   { cls: "",     label: "Re-sent",         hint: "Device re-sent an already received session (409)" },
  };

  const pad = (n) => String(n).padStart(2, "0");
  const fmtDate = (iso) => { const d = new Date(iso); return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}`; };
  const fmtTime = (iso) => { const d = new Date(iso); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  const fmtDT = (iso) => `${fmtDate(iso)} ${fmtTime(iso)}`;
  const fmtDur = (s) => { const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min ${pad(Math.round(s % 60))} s`; };
  const fmtDurShort = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)} h` : `${m} min`; };
  const fmtBytes = (b) => b > 1e9 ? (b / 1e9).toFixed(2) + " GB" : b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " kB";
  const rel = (iso) => {
    if (!iso) return "never";
    const h = (D.NOW - new Date(iso)) / 3600e3;
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
    if (h < 24) return `${Math.round(h)} h ago`;
    const d = Math.round(h / 24);
    return d === 1 ? "yesterday" : `${d} days ago`;
  };
  const lagText = (s) => { const h = (new Date(s.receivedAt) - new Date(s.endedAt)) / 3600e3; return h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`; };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const site = (id) => D.sites.find((s) => s.id === id);
  const device = (id) => D.devices.find((d) => d.id === id);
  const project = (key) => D.projects.find((p) => p.id === key || p.name === key);
  const notFound = (what) => `<div class="page-header"><h1 class="page-title">Not found</h1>
    <p class="page-desc">This ${what} does not exist or is outside your access. The server answers 404 either way, so it never confirms that the record exists.</p></div>`;
  const shortId = (id) => id.length > 12 ? id.slice(0, 8) + "…" : id;

  const statusPill = (s, big) => {
    const m = STATUS[s.status];
    const title = s.status === "invalid" ? INVALID_REASON[s.invalidReason] : m.hint;
    return `<span class="pill ${m.cls}${big ? " lg" : ""}" title="${esc(title)}"><span class="dot"></span>${m.label}</span>`;
  };
  const qcPill = (q, big) => { const m = QC[q]; return `<span class="pill ${m.cls}${big ? " lg" : ""}">${m.icon} ${m.label}</span>`; };
  const issueTags = (s) => `<span class="tags">${s.issues.map((k) => `<span class="tag ${ISSUES[k].cls}" title="${esc(ISSUES[k].hint)}">${ISSUES[k].label}</span>`).join("")}</span>`;
  const needsAttention = (s) => s.status === "invalid" || s.qc === "review" || s.issues.includes("recovered") || s.issues.includes("interrupted");

  const deviceHealth = (d) => {
    const h = (D.NOW - new Date(d.lastSeen)) / 3600e3;
    if (d.neverUploaded) return { cls: "off", label: "No uploads yet", rank: 2 };
    if (!d.lastUpload) return { cls: "off", label: "No uploads in your scope", rank: 2 };
    if (h > 24 * 7) return { cls: "bad", label: "Silent > 7 days", rank: 0 };
    if (d.localFailed > 0 || d.localPending > 0) return { cls: "warn", label: "Backlog", rank: 1 };
    return { cls: "ok", label: "Healthy", rank: 3 };
  };

  const PB = (what) => `<span class="pb" title="Needs the extended upload contract (phase B): ${esc(what)}">phase B</span>`;

  function topbar({ back = "dashboard.html", role = SC.P.role, user = SC.P.name } = {}) {
    return `<header class="topbar">
      ${back ? `<a class="btn-back" href="${back}">← Back</a>` : "<span></span>"}
      <div class="topbar-right">
        <span class="topbar-user">${esc(user)}</span><span class="role-badge">${role}</span>
        <span class="topbar-sep"></span>
        <button class="btn-logout" type="button">Log out</button>
        <span class="topbar-sep"></span>
        <label class="lang">🌍 <select id="lang" aria-label="Language"><option>English</option><option>Čeština</option><option>Deutsch</option></select></label>
      </div>
    </header>`;
  }

  const PAGES = [
    ["index.html", "Overview"],
    ["dashboard.html", "1 · Dashboard"],
    ["uploads.html", "2 · Uploads"],
    ["session.html", "3 · Session detail"],
    ["devices.html", "4 · Devices"],
    ["site.html", "5 · Site dashboard"],
    ["project.html", "6 · Project dashboard"],
  ];
  function previewBar(current) {
    const bar = document.createElement("nav");
    bar.className = "preview-bar";
    bar.setAttribute("aria-label", "Design preview pages");
    bar.innerHTML = `<span class="pv-label">Design preview</span>` +
      PAGES.map(([href, label]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ""}>${label}</a>`).join("") +
      `<label>View as <select id="persona">${Object.entries(D.personas).map(([k, p]) => `<option value="${k}"${k === personaKey ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>` +
      `<label><input type="checkbox" id="pbtoggle" checked> Show design notes &amp; phase-B markers</label>`;
    document.body.prepend(bar);
    bar.querySelector("#persona").addEventListener("change", (e) => {
      try { localStorage.setItem("um-persona", e.target.value); } catch (err) {}
      location.reload();
    });
    const cb = bar.querySelector("#pbtoggle");
    try { if (localStorage.getItem("um-hide-pb") === "1") { cb.checked = false; document.body.classList.add("hide-pb"); } } catch (e) {}
    cb.addEventListener("change", () => {
      document.body.classList.toggle("hide-pb", !cb.checked);
      try { localStorage.setItem("um-hide-pb", cb.checked ? "0" : "1"); } catch (e) {}
    });
  }

  function copyText(btn, text) {
    const done = () => { const o = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = o), 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done); else done();
  }

  window.UM = { D, SC, scopeFor, STATUS, INVALID_REASON, QC, ISSUES, fmtDate, fmtTime, fmtDT, fmtDur, fmtDurShort, fmtBytes, rel, lagText, esc,
    site, device, project, notFound, shortId, statusPill, qcPill, issueTags, needsAttention, deviceHealth, PB, topbar, previewBar, copyText };
})();
