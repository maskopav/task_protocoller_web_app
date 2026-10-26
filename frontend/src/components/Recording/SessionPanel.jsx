import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge, CopyField, KeyValue } from "../ui";
import { formatDateTime } from "../../utils/formatDate";
import DeviceEvents from "./DeviceEvents";
import { audioFormatParts, fmtDur, gainText, hasValue, lagParts, shortId, videoFormatText } from "./recordingFormat";
import "./Recording.css";

const LATE_HOURS = 72;

/**
 * The Session card: technical facts about the recording. Anything the app did not report is
 * left out instead of printed as "undefined" or a dash (F-035).
 */
export default function SessionPanel({ s }) {
  const { t } = useTranslation("recording");
  const hw = s.hardware || {};
  const micUses = hw.micUses || [];
  const camUses = hw.cameraUses || [];
  const events = (kind) => (hw.events || []).filter((e) => e.device === kind);
  const issues = s.issues || [];
  const configOld = s.checks?.find((c) => c.key === "config_version")?.result === "warn";

  const micNames = micUses.map((m) => m?.deviceName).filter(hasValue).join(" → ");
  const camNames = camUses.map((c) => c?.deviceName).filter(hasValue).join(" → ");
  const gain = gainText(micUses);
  const nonstdMic = issues.includes("nonstdMic");
  const nonstdCam = issues.includes("nonstdCam");
  const micEvents = events("microphone");
  const camEvents = events("camera");

  const lag = lagParts(s);
  const lagText = lag ? t(`session.lag.${lag.unit}`, { count: lag.n }) : "";
  const late = lag && lag.unit === "days" && lag.n * 24 > LATE_HOURS;

  const withExtras = (main, extras) => (main || extras
    ? <>{main}{extras}</>
    : null);

  const mic = withExtras(micNames, (
    <>
      {nonstdMic && <> <Badge tone="bad">{t("session.nonStandard")}</Badge></>}
      {nonstdMic && hasValue(hw.configuredMicDeviceId) && (
        <span className="recd-sub">{t("session.settings")}: <span className="recd-mono">{hw.configuredMicDeviceId}</span></span>
      )}
      {gain && <span className="recd-sub">{t("session.inputGain", { gain })}</span>}
      <DeviceEvents events={micEvents} kind="microphone" />
    </>
  ));
  const cam = withExtras(camNames, (
    <>
      {nonstdCam && <> <Badge tone="bad">{t("session.nonStandard")}</Badge></>}
      {nonstdCam && hasValue(hw.configuredCameraDeviceId) && (
        <span className="recd-sub">{t("session.settings")}: <span className="recd-mono">{hw.configuredCameraDeviceId}</span></span>
      )}
      <DeviceEvents events={camEvents} kind="camera" />
    </>
  ));

  const audioText = audioFormatParts(
    s.captureFormat,
    t("session.mono"),
    (count) => t("session.channels", { count }),
  ) || (s.hasAudio === false ? t("session.noAudio") : "");

  const recorded = hasValue(s.startedAt) ? (
    <>
      {formatDateTime(s.startedAt)}
      {!s.endedAt && <> <Badge tone="bad" title={t("session.notFinishedHint")}>{t("session.notFinished")}</Badge></>}
    </>
  ) : null;

  const computer = hasValue(s.deviceLabel) || hasValue(s.deviceId) ? (
    <>
      <Link to="/clinics/devices">{s.deviceLabel || shortId(s.deviceId)}</Link>
      {hasValue(s.deviceLabel) && hasValue(s.deviceId) && <span className="recd-sub recd-mono" title={s.deviceId}>{shortId(s.deviceId)}</span>}
    </>
  ) : null;

  const received = hasValue(s.receivedAt) ? (
    <>
      {formatDateTime(s.receivedAt)}
      {lagText && <span className="recd-sub">{late && <Badge tone="warn">!</Badge>} {t("session.afterEnd", { lag: lagText })}</span>}
    </>
  ) : null;

  const items = [
    { label: t("session.computer"), value: computer },
    { label: t("session.appVersion"), value: hasValue(s.appVersion) ? s.appVersion : null },
    { label: t("session.recorded"), value: recorded },
    { label: t("session.length"), value: fmtDur(s.durationS) || null },
    { label: t("session.received"), value: received },
    { label: t("session.tasks"), value: hasValue(s.tasksTotal) ? t("session.tasksDone", { done: s.tasksDone ?? 0, total: s.tasksTotal }) : null },
    { label: t("session.timelineUsed"), value: s.timelineUsed ? (s.timelineUsed === "edited" ? t("session.timelineEdited") : t("session.timelineOriginal")) : null },
    { label: t("session.mic"), value: mic },
    { label: t("session.audio"), value: audioText || null },
    { label: t("session.camera"), value: cam },
    { label: t("session.video"), value: videoFormatText(camUses[0]?.captureFormat) || null },
  ];

  const ids = [
    { label: t("session.sessionId"), value: <CopyField value={s.id} /> },
    hasValue(s.configVersion) && {
      label: t("session.configVersion"),
      value: <span className="recd-inline"><span className="recd-mono">{s.configVersion}</span>{configOld && <Badge tone="warn">{t("session.old")}</Badge>}</span>,
    },
    hasValue(s.zipSha256) && { label: t("session.zipSha"), value: <CopyField value={s.zipSha256} /> },
  ].filter(Boolean);

  return (
    <section className="recd-card" aria-label={t("session.title")}>
      <div className="recd-card-head"><h2>{t("session.title")}</h2></div>
      <KeyValue items={items} cols={4} />
      <hr className="recd-divider" />
      <KeyValue items={ids} cols={2} />
    </section>
  );
}
