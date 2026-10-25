// src/pages/SessionDetailPage.jsx — phase B upload management: one uploaded session
// (docs/upload_management/ui_design/session.html).
import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import StatusPill from "../components/Uploads/StatusPill";
import QcPill from "../components/Uploads/QcPill";
import FlagTags from "../components/Uploads/FlagTags";
import ParticipantPanel from "../components/Uploads/ParticipantPanel";
import ReviewPanel from "../components/Uploads/ReviewPanel";
import TaskTable from "../components/Uploads/TaskTable";
import SessionTimeline from "../components/Uploads/SessionTimeline";
import ServerChecks from "../components/Uploads/ServerChecks";
import UploadHistory from "../components/Uploads/UploadHistory";
import useDownloadTicket from "../components/Uploads/useDownloadTicket";
import useUploadLabels from "../components/Uploads/useUploadLabels";
import { fetchSession, fetchAttempts, downloadSessionZip } from "../api/uploads";
import { endOf, fmtBytes, fmtDate, fmtDT, fmtDur, fmtTime, lagHours, shortId } from "../components/Uploads/format";
import "./Pages.css";
import "../components/Uploads/Uploads.css";

const Meta = ({ label, children, sub }) => (
  <div className="um-meta-item">
    <span className="m-label">{label}</span>
    <span className="m-value">{children}</span>
    {sub}
  </div>
);

function CopyButton({ value }) {
  const { t } = useTranslation("uploads");
  const [done, setDone] = useState(false);
  const copy = () => {
    const ok = () => { setDone(true); setTimeout(() => setDone(false), 1200); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(ok, ok);
    else ok();
  };
  return <button className="um-copy" type="button" onClick={copy}>{done ? t("session.copied") : t("session.copy")}</button>;
}

export default function SessionDetailPage() {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const ctx = params.get("ctx") || "";
  const navigate = useNavigate();
  const { t } = useTranslation(["uploads", "common"]);
  const L = useUploadLabels();

  const [s, setS] = useState(null);
  const [attempts, setAttempts] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | notFound | error
  const [dlError, setDlError] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setS(null);
    setAttempts(null);
    try {
      const data = await fetchSession(sessionId, ctx);
      setS(data);
      setState("ready");
      fetchAttempts(sessionId).then(setAttempts).catch(() => setAttempts([]));
    } catch (e) {
      setState(e.status === 404 || e.status === 403 ? "notFound" : "error");
    }
  }, [sessionId, ctx]);

  useEffect(() => {
    load();
  }, [load]);

  const tickets = useDownloadTicket(Boolean(s?.canEdit));

  const goto = (id) => id && navigate(`/recordings/${id}${ctx ? `?ctx=${encodeURIComponent(ctx)}` : ""}`);


  if (state === "loading") return <div className="dashboard-page um-page"><p>{t("loading", { ns: "common" })}…</p></div>;
  if (state === "notFound" || state === "error") {
    return (
      <div className="dashboard-page um-page">
        
        <div className="um-header">
          <h1 className="um-title">{state === "notFound" ? t("session.notFoundTitle") : t("session.errorTitle")}</h1>
          <p className="um-desc">{state === "notFound" ? t("session.notFoundBody") : t("session.errorBody")}</p>
          {state === "error" && <div><button className="um-btn um-btn-ghost" type="button" onClick={load}>{t("list.retry")}</button></div>}
        </div>
      </div>
    );
  }

  const p = s.participant;
  const edit = s.canEdit;
  const hw = s.hardware || {};
  const micUses = hw.micUses || [];
  const camUses = hw.cameraUses || [];
  const cam0 = camUses[0]?.captureFormat;
  const events = (kind) => (hw.events || []).filter((e) => e.device === kind);
  const configOld = s.checks?.find((c) => c.key === "config_version")?.result === "warn";
  const delayLong = lagHours(s) > 72;
  const doneCount = s.tasksDone;

  const onDownload = async () => {
    setDlError(false);
    try { await downloadSessionZip(s.id); } catch { setDlError(true); }
  };
  const patch = (changes) => setS((cur) => ({ ...cur, ...changes }));

  return (
    <div className="dashboard-page um-page">
      
      <div className="um-header">
        <div className="um-title-row">
          <h1 className="um-title">
            {p.patient_code || shortId(s.id)}
            {p.visit_number ? <span className="um-muted" style={{ fontWeight: 500 }}> · {p.visit_number}</span> : null}
          </h1>
          <StatusPill status={s.status} invalidReason={s.invalidReason} big />
          <QcPill qc={s.qc} big />
          <div className="um-actions">
            <button className="um-btn um-btn-ghost" type="button" disabled={!s.prevId} onClick={() => goto(s.prevId)}>◀ {t("session.prev")}</button>
            <button className="um-btn um-btn-ghost" type="button" disabled={!s.nextId} onClick={() => goto(s.nextId)}>{t("session.next")} ▶</button>
            {edit ? (
              <button className="um-btn um-btn-primary" type="button" disabled={s.status === "validating"} onClick={onDownload} title={t("session.downloadHint", { id: s.id })}>
                ⬇ {t("session.download")} · {fmtBytes(s.bytes)}
              </button>
            ) : (
              <span className="um-pill off lg" title={t("session.viewOnlyHint")}>👁 {t("session.viewOnly")}</span>
            )}
          </div>
        </div>
        <p className="um-desc">
          {s.protocol} · {s.project} · {t("session.recordedAt")}{" "}
          <Link to={`/clinics/${s.siteId}`}>{s.site}</Link> {t("session.on")} {fmtDate(endOf(s))}
        </p>
        {dlError && <div className="um-error" role="alert">{t("session.downloadFailed")}</div>}
        {s.issues.length > 0 && <div style={{ marginTop: "0.35rem" }}><FlagTags issues={s.issues} /></div>}
      </div>

      <div className="um-detail-grid">
        <div className="um-detail-main">
          <section className="um-panel">
            <h2 className="um-section-title">{t("session.title")}</h2>
            <div className="um-meta-grid">
              <Meta label={t("session.site")}>📍 {s.site}</Meta>
              <Meta label={t("session.device")} sub={<span className="cell-sub um-mono m-sub">{s.deviceId}</span>}>
                🖥 <Link to="/clinics/devices">{s.deviceLabel || shortId(s.deviceId)}</Link>
              </Meta>
              <Meta label={t("session.appVersion")}>{s.appVersion || "—"}</Meta>
              <Meta label={t("session.startedEnded")}>
                <span className="um-num">
                  {fmtTime(s.startedAt)} → {s.endedAt ? fmtTime(s.endedAt) : <span className="um-tag bad" title={t("session.notFinishedHint")}>{t("session.notFinished")}</span>}{" "}
                  <span className="um-muted" style={{ fontWeight: 400 }}>{fmtDate(s.startedAt)}</span>
                </span>
              </Meta>
              <Meta label={t("session.length")}><span className="um-num">{fmtDur(s.durationS)}</span></Meta>
              <Meta label={t("session.received")} sub={<span className="m-sub">{delayLong ? "⚠ " : ""}{t("session.afterEnd", { lag: L.lag(s) })}</span>}>
                <span className="um-num">{fmtDT(s.receivedAt)}</span>
              </Meta>
              <Meta label={t("session.tasks")}><span className="um-num">{t("session.tasksDone", { done: doneCount, total: s.tasksTotal })}</span></Meta>
              <Meta label={t("session.timelineUsed")}>{s.timelineUsed === "edited" ? t("session.timelineEdited") : t("session.timelineOriginal")}</Meta>
            </div>
            <div className="um-meta-grid divided">
              <Meta
                label={t("session.mic")}
                sub={<>
                  {s.issues.includes("nonstdMic") && <span className="m-sub bad">{t("session.settings")}: <span className="um-mono">{hw.configuredMicDeviceId}</span></span>}
                  {events("microphone").map((e, i) => <span key={i} className="m-sub bad">⚠ {e.detail || e.type}</span>)}
                </>}
              >
                {micUses.length ? micUses.map((m) => `🎙 ${m.deviceName}`).join(" → ") : "—"}
                {s.issues.includes("nonstdMic") && <span className="um-tag bad" title={L.issueHint("nonstdMic")}>{t("session.nonStandard")}</span>}
              </Meta>
              <Meta
                label={t("session.audio")}
                sub={micUses.length ? <span className="m-sub">{t("session.inputGain", { gain: micUses.map((m) => `${m.inputGainPercent} %`).join(" → ") })}</span> : null}
              >
                {s.captureFormat ? `${s.captureFormat.sampleRate / 1000} kHz · ${s.captureFormat.bits}-bit · ${s.captureFormat.channels === 1 ? "mono" : `${s.captureFormat.channels} ch`}` : t("session.noAudio")}
              </Meta>
              <Meta
                label={t("session.camera")}
                sub={<>
                  {s.issues.includes("nonstdCam") && <span className="m-sub bad">{t("session.settings")}: <span className="um-mono">{hw.configuredCameraDeviceId}</span></span>}
                  {events("camera").map((e, i) => <span key={i} className="m-sub">⚠ {e.detail || e.type}</span>)}
                </>}
              >
                {camUses.length ? camUses.map((c) => `📷 ${c.deviceName}`).join(" → ") : "—"}
                {s.issues.includes("nonstdCam") && <span className="um-tag bad" title={L.issueHint("nonstdCam")}>{t("session.nonStandard")}</span>}
              </Meta>
              <Meta label={t("session.video")}>{cam0 ? `${cam0.width}×${cam0.height} · ${cam0.fps} fps` : "—"}</Meta>
            </div>
            <div className="um-meta-grid divided">
              <Meta label={t("session.sessionId")}><span className="um-mono">{s.id.slice(0, 16)}…</span><CopyButton value={s.id} /></Meta>
              <Meta label={t("session.configVersion")}>
                <span className="um-mono">{s.configVersion || "—"}</span>
                {configOld && <span className="um-tag warn">{t("session.old")}</span>}
              </Meta>
              <Meta label={t("session.zipSha")}><span className="um-mono">{(s.zipSha256 || "").slice(0, 12)}…</span><CopyButton value={s.zipSha256 || ""} /></Meta>
            </div>
          </section>

          {s.hasAudio && <SessionTimeline timeline={s.timeline || []} tasks={s.tasks} sampleRate={s.sampleRate} durationS={s.durationS} timelineUsed={s.timelineUsed} />}

          <section className="um-panel">
            <div className="um-section-head">
              <h2 className="um-section-title">{t("tasks.title")}</h2>
              <span className="um-section-sub">{t("tasks.sub")}</span>
            </div>
            <TaskTable sessionId={s.id} tasks={s.tasks} timeline={s.timeline} tickets={tickets} canPlay={edit} />
            {!edit && <p className="um-note">{t("tasks.viewOnlyNote")}</p>}
          </section>

          <UploadHistory attempts={attempts} deviceLabel={s.deviceLabel} />
        </div>

        <aside className="um-detail-side">
          <ReviewPanel
            sessionId={s.id}
            qc={s.qc}
            comments={s.comments}
            canEdit={edit}
            onChange={patch}
            onForbidden={() => patch({ canEdit: false })}
          />
          <ServerChecks checks={s.checks} />
          <ParticipantPanel
            sessionId={s.id}
            participant={p}
            canEdit={edit}
            onUpdated={(res) => patch({ participant: res.participant, comments: res.comments ?? s.comments })}
          />
        </aside>
      </div>
    </div>
  );
}
