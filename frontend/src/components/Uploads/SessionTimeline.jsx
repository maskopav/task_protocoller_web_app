import React from "react";
import { useTranslation } from "react-i18next";
import { fmtClock, fmtDur, prettyName } from "../Recording/recordingFormat";
import "../Recording/Recording.css";

/**
 * Task segments along the master recording. `timeline` entries carry sample positions
 * (kept take + rejected takes); seconds = sample / sampleRate.
 */
export default function SessionTimeline({ timeline, tasks, sampleRate, durationS, timelineUsed }) {
  const { t } = useTranslation("recording");
  const sr = sampleRate || 48000;
  const byIdx = new Map(tasks.map((x) => [x.taskIndex, x]));
  const spans = [];
  for (const seg of timeline) {
    const task = byIdx.get(seg.taskIndex);
    const name = prettyName(task?.subtype || task?.type || "task");
    if (seg.kept?.startSample != null && seg.kept?.stopSample != null) {
      const cls = task?.type === "QUESTIONNAIRE" || task?.type === "INFO" ? "q" : task?.videoFile ? "v" : "";
      spans.push({ kind: "seg", cls, from: seg.kept.startSample / sr, to: seg.kept.stopSample / sr, name, task: seg.taskIndex });
    }
    for (const r of seg.rejected || []) {
      if (r.startSample != null && r.stopSample != null) {
        spans.push({ kind: "gap", from: r.startSample / sr, to: r.stopSample / sr, name, reason: r.reason, task: seg.taskIndex });
      }
    }
  }
  if (!spans.length) return null;
  const total = Math.max(durationS || 0, ...spans.map((s) => s.to)) || 1;
  const pct = (v) => `${((v / total) * 100).toFixed(2)}%`;
  const hasGap = spans.some((s) => s.kind === "gap");
  const duration = fmtDur(durationS);

  return (
    <section className="recd-card">
      <div className="recd-card-head">
        <h2>{t("timeline.title")}</h2>
        <span className="recd-hint">
          {t("timeline.sub", { duration, file: timelineUsed === "edited" ? "timeline_edited.json" : "timeline_original.json" })}
        </span>
      </div>
      <div className="recd-tl-track" role="img" aria-label={t("timeline.aria")}>
        {spans.map((s, i) => (
          <span
            key={i}
            className={s.kind === "gap" ? "recd-tl-gap" : `recd-tl-seg ${s.cls}`}
            style={{ left: pct(s.from), width: pct(s.to - s.from) }}
            title={s.kind === "gap" ? t("timeline.rejectedTake", { task: s.task, reason: s.reason || "?" }) : `${t("timeline.task", { task: s.task })}: ${s.name}`}
          >
            {s.kind === "seg" ? s.name : ""}
          </span>
        ))}
      </div>
      <div className="recd-tl-axis">
        {[0, 1, 2, 3, 4].map((q) => <span key={q}>{fmtClock((total * q) / 4)}</span>)}
      </div>
      <div className="recd-legend">
        <span><i style={{ background: "var(--accent)" }} />{t("timeline.legend.audio")}</span>
        <span><i style={{ background: "var(--ok)" }} />{t("timeline.legend.filmed")}</span>
        <span><i style={{ background: "var(--idle)" }} />{t("timeline.legend.questionnaire")}</span>
        {hasGap && <span><i style={{ background: "var(--bad)" }} />{t("timeline.legend.rejected")}</span>}
      </div>
    </section>
  );
}
