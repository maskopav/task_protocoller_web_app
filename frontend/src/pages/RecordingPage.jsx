// src/pages/RecordingPage.jsx: one uploaded recording (spec §6.2).
import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge, Button, EmptyState, IconButton, Menu, PageHeader, useToast } from "../components/ui";
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
import SessionPanel from "../components/Recording/SessionPanel";
import ActivitySection from "../components/Recording/ActivitySection";
import { AssignComputerModal, QuarantineBanner } from "../components/Recording/AssignComputer";
import { fmtBytes, hasValue, shortId } from "../components/Recording/recordingFormat";
import { fetchSession, fetchAttempts, downloadSessionZip } from "../api/uploads";
import { useUser } from "../context/UserContext";
import { formatShortDate } from "../utils/formatDate";
import "../components/Recording/Recording.css";
import "./RecordingPage.css";

export default function RecordingPage() {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const ctx = params.get("ctx") || "";
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useTranslation("recording");
  const { user } = useUser() || {};
  const isMaster = user?.role_id === 1;

  const [s, setS] = useState(null);
  const [attempts, setAttempts] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | notFound | error
  const [activityKey, setActivityKey] = useState(0);
  const [assigning, setAssigning] = useState(false);

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
  const bumpActivity = () => setActivityKey((k) => k + 1);

  const goto = (id) => id && navigate(`/recordings/${id}${ctx ? `?ctx=${encodeURIComponent(ctx)}` : ""}`);
  const listPath = `/recordings${ctx ? `?${ctx}` : ""}`;

  if (state === "loading") {
    return <div className="recd-page" aria-busy="true" aria-label={t("page.loading")}><div className="recd-skeleton" /></div>;
  }
  if (state === "notFound" || state === "error") {
    const missing = state === "notFound";
    return (
      <div className="recd-page">
        <PageHeader breadcrumbs={[{ label: t("page.crumbRoot"), to: "/recordings" }]} title={t(missing ? "page.notFoundTitle" : "page.errorTitle")} />
        <EmptyState
          icon="alert"
          description={t(missing ? "page.notFoundBody" : "page.errorBody")}
          action={!missing && <Button onClick={load}>{t("page.retry")}</Button>}
        />
      </div>
    );
  }

  const p = s.participant;
  const edit = s.canEdit;
  const quarantined = s.siteId == null;
  const issues = s.issues || [];

  const onDownload = async () => {
    try {
      await downloadSessionZip(s.id);
      setTimeout(bumpActivity, 1500); // the server writes the audit entry as the stream starts
    } catch {
      toast.error(t("header.downloadFailed"));
    }
  };
  const patch = (changes) => {
    setS((cur) => ({ ...cur, ...changes }));
    bumpActivity();
  };

  const downloadItem = edit && { label: t("header.download"), icon: "download", onSelect: onDownload };
  const code = p.patient_code || shortId(s.id);
  const date = formatShortDate(s.endedAt || s.processedAt || s.receivedAt);
  const subParts = [
    hasValue(s.protocol) && s.protocol,
    hasValue(s.project) && s.project,
    hasValue(s.site) && <Link key="site" to={`/clinics/${s.siteId}`}>{s.site}</Link>,
    date && t("header.recordedOn", { date }),
  ].filter(Boolean);

  const nav = (
    <>
      <IconButton
        icon="left"
        label={t("header.prev")}
        data-testid="recording-prev"
        disabled={!s.prevId}
        onClick={() => goto(s.prevId)}
      />
      <IconButton
        icon="chevron"
        label={t("header.next")}
        data-testid="recording-next"
        disabled={!s.nextId}
        onClick={() => goto(s.nextId)}
      />
    </>
  );

  let primary = null;
  if (quarantined) {
    if (isMaster) primary = <Button variant="primary" icon="computer" onClick={() => setAssigning(true)} data-testid="recording-assign">{t("quarantine.assign")}</Button>;
  } else if (edit) {
    primary = (
      <Button variant="primary" icon="download" onClick={onDownload} disabled={s.status === "validating"} title={t("header.downloadHint", { size: fmtBytes(s.bytes), id: s.id })}>
        {t("header.download")}
      </Button>
    );
  } else {
    primary = <Badge title={t("header.viewOnlyHint")}>{t("header.viewOnly")}</Badge>;
  }

  const actions = (
    <>
      {nav}
      {primary}
      {quarantined && downloadItem && <Menu label={t("header.more")} items={[downloadItem]} />}
    </>
  );

  return (
    <div className="recd-page">
      <PageHeader
        breadcrumbs={[{ label: t("page.crumbRoot"), to: listPath }, { label: code }]}
        title={(
          <>
            {code}
            {hasValue(p.visit_number) && <span className="recd-muted"> · {t("header.visit", { visit: p.visit_number })}</span>}
          </>
        )}
        badges={(
          <>
            {quarantined
              ? <Badge tone="warn" icon="alert">{t("quarantine.badge")}</Badge>
              : <StatusPill status={s.status} invalidReason={s.invalidReason} big />}
            <QcPill qc={s.qc} big />
          </>
        )}
        sub={subParts.length ? subParts.map((x, i) => <React.Fragment key={i}>{i > 0 && " · "}{x}</React.Fragment>) : null}
        actions={actions}
      />

      {quarantined && <QuarantineBanner />}
      {issues.length > 0 && <div><FlagTags issues={issues} /></div>}

      <div className="recd-grid">
        <div className="recd-stack">
          <section className="recd-card recd-card-flush">
            <div className="recd-card-head">
              <h2>{t("tasks.title")}</h2>
              <span className="recd-hint">{t("tasks.sub")}</span>
            </div>
            <div className="recd-tasks-wrap">
              <TaskTable sessionId={s.id} tasks={s.tasks || []} timeline={s.timeline} tickets={tickets} canPlay={edit} questionTexts={s.questionTexts} />
            </div>
            {!edit && <p className="recd-note recd-pad">{t("tasks.viewOnlyNote")}</p>}
          </section>

          <SessionPanel s={s} />

          {s.hasAudio && <SessionTimeline timeline={s.timeline || []} tasks={s.tasks || []} sampleRate={s.sampleRate} durationS={s.durationS} timelineUsed={s.timelineUsed} />}

          <ActivitySection sessionId={s.id} refreshKey={activityKey} />
          <UploadHistory attempts={attempts} deviceLabel={s.deviceLabel} />
        </div>

        <aside className="recd-stack">
          <ReviewPanel
            sessionId={s.id}
            qc={s.qc}
            comments={s.comments}
            canEdit={edit}
            onChange={patch}
            onForbidden={() => patch({ canEdit: false })}
          />
          <ParticipantPanel
            sessionId={s.id}
            participant={p}
            canEdit={edit}
            onReveal={bumpActivity}
            onUpdated={(res) => patch({ participant: res.participant, comments: res.comments ?? s.comments })}
          />
          <ServerChecks checks={s.checks} />
        </aside>
      </div>

      {quarantined && isMaster && (
        <AssignComputerModal
          open={assigning}
          onClose={() => setAssigning(false)}
          installationId={s.deviceId}
          onAssigned={load}
        />
      )}
    </div>
  );
}
