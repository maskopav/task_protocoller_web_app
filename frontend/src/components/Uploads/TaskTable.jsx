import React, { useState } from "react";
import ClipPlayer from "./ClipPlayer";
import { prettyName } from "./format";
import useUploadLabels from "./useUploadLabels";
import "./Uploads.css";

const RESULT_CLS = { Done: "ok", Skipped: "warn", Missing: "bad" };

// Instances whose timeline lists a take rejected because the microphone vanished.
function micLostSet(timeline = []) {
  const s = new Set();
  for (const seg of timeline) {
    if ((seg.rejected || []).some((r) => r.reason === "DEVICE_LOST")) s.add(`${seg.taskIndex}:${seg.repetition}`);
  }
  return s;
}

const answerList = (answers) => Object.entries(answers || {});

/** Tasks of the session with inline clip players and expandable questionnaire answers. */
export default function TaskTable({ sessionId, tasks, timeline, tickets, canPlay }) {
  const { t } = useUploadLabels();
  const [open, setOpen] = useState(() => new Set()); // questionnaire rows
  const [videoOpen, setVideoOpen] = useState(() => new Set());
  const lost = micLostSet(timeline);
  const flip = (set, setter, k) => {
    const next = new Set(set);
    next.has(k) ? next.delete(k) : next.add(k);
    setter(next);
  };

  const taskName = (x) =>
    x.subtype ? prettyName(x.subtype) : x.type === "VIDEO" ? t("tasks.videoTask") : x.type === "QUESTIONNAIRE" ? t("tasks.questionnaire") : t("tasks.infoScreen");
  const fileName = (f) => f.replace(/^clips\//, "");

  return (
    <div className="um-table-wrap">
      <table className="um-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{t("tasks.task")}</th>
            <th className="c">{t("tasks.rep")}</th>
            <th className="c">{t("tasks.takes")}</th>
            <th>{t("tasks.result")}</th>
            <th>{t("tasks.clip")}</th>
            <th>{t("tasks.file")}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((x) => {
            const key = `${x.taskIndex}:${x.repetition}`;
            const answers = answerList(x.questionnaireAnswers);
            const done = x.result === "Done";
            return (
              <React.Fragment key={key}>
                <tr className={x.result === "Missing" ? "row-bad" : x.result === "Skipped" ? "row-warn" : ""}>
                  <td className="um-num">{x.taskIndex}</td>
                  <td>
                    <div className="stack">
                      <span>{taskName(x)}</span>
                      <span className="cell-sub">{x.type}</span>
                    </div>
                  </td>
                  <td className="c um-num">{x.repetition}</td>
                  <td className="c um-num">
                    {x.takes || "—"}
                    {x.takes > 1 && <> <span className="um-tag" title={t("tasks.lastKeptHint")}>{t("tasks.lastKept")}</span></>}
                    {lost.has(key) && <> <span className="um-tag bad" title={t("tasks.micLostHint")}>{t("tasks.micLost")}</span></>}
                  </td>
                  <td>
                    <span className={`um-pill ${RESULT_CLS[x.result] || "off"}`}>{t(`tasks.results.${x.result}`, { defaultValue: x.result })}</span>
                  </td>
                  <td>
                    {x.clipFile || x.videoFile ? (
                      <span className="um-player">
                        {x.clipFile && <ClipPlayer sessionId={sessionId} file={x.clipFile} kind="audio" tickets={tickets} disabled={!canPlay} />}
                        {x.videoFile && !videoOpen.has(key) && (
                          <button
                            type="button"
                            className="um-play video"
                            aria-label={t("tasks.playVideo")}
                            title={t("tasks.videoNoSound")}
                            disabled={!canPlay}
                            onClick={() => flip(videoOpen, setVideoOpen, key)}
                          >
                            🎥
                          </button>
                        )}
                      </span>
                    ) : answers.length && done ? (
                      <button type="button" className="um-linklike" aria-expanded={open.has(key)} onClick={() => flip(open, setOpen, key)}>
                        {open.has(key) ? t("tasks.hideAnswers", { count: answers.length }) : t("tasks.showAnswers", { count: answers.length })}
                      </button>
                    ) : (
                      <span className="um-muted">—</span>
                    )}
                  </td>
                  <td className="um-mono cell-sub">
                    {[x.clipFile, x.videoFile].filter(Boolean).map((f) => (
                      <span key={f} title={fileName(f)} style={{ display: "block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {fileName(f)}
                      </span>
                    ))}
                  </td>
                </tr>
                {x.videoFile && videoOpen.has(key) && canPlay && (
                  <tr className="um-sub-row">
                    <td />
                    <td colSpan={6}>
                      <ClipPlayer sessionId={sessionId} file={x.videoFile} kind="video" tickets={tickets} autoOpen />
                      <button type="button" className="um-linklike" onClick={() => flip(videoOpen, setVideoOpen, key)}>{t("tasks.closeVideo")}</button>
                    </td>
                  </tr>
                )}
                {answers.length > 0 && open.has(key) && (
                  <tr className="um-sub-row">
                    <td />
                    <td colSpan={6}>
                      <dl className="um-qa">
                        {answers.map(([q, a]) => (
                          <React.Fragment key={q}>
                            <dt>{q}</dt>
                            <dd>{[].concat(a).join(", ")}</dd>
                          </React.Fragment>
                        ))}
                      </dl>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
