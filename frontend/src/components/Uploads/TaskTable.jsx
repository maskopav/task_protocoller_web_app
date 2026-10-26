import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Modal, StatusDot } from "../ui";
import ClipPlayer from "./ClipPlayer";
import { answerRows, prettyName } from "../Recording/recordingFormat";
import "../Recording/Recording.css";

const RESULT_TONE = { Done: "ok", Skipped: "warn", Missing: "bad" };

// Instances whose timeline lists a take rejected because the microphone vanished.
function micLostSet(timeline = []) {
  const s = new Set();
  for (const seg of timeline || []) {
    if ((seg.rejected || []).some((r) => r.reason === "DEVICE_LOST")) s.add(`${seg.taskIndex}:${seg.repetition}`);
  }
  return s;
}

/** Questionnaire answers with question and answer text; internal keys only where the text is missing (F-040). */
export function AnswersModal({ open, onClose, title, answers, questionTexts }) {
  const { t } = useTranslation("recording");
  const rows = answerRows(answers, questionTexts);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={t("answers.sub")}
      footer={<Button onClick={onClose}>{t("answers.close")}</Button>}
    >
      <dl className="recd-qa" data-testid="answers-list">
        {rows.map((r) => (
          <React.Fragment key={r.key}>
            <dt className={r.resolved ? undefined : "recd-rawkey"}>{r.question}</dt>
            <dd>{r.answer}</dd>
          </React.Fragment>
        ))}
      </dl>
    </Modal>
  );
}

/** Tasks of the session with inline clip players and questionnaire answers. */
export default function TaskTable({ sessionId, tasks, timeline, tickets, canPlay, questionTexts }) {
  const { t } = useTranslation("recording");
  const [videoOpen, setVideoOpen] = useState(() => new Set());
  const [answersOf, setAnswersOf] = useState(null); // the questionnaire task being shown
  const lost = micLostSet(timeline);
  const flip = (k) => setVideoOpen((cur) => {
    const next = new Set(cur);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const taskName = (x) =>
    x.subtype ? prettyName(x.subtype) : x.type === "VIDEO" ? t("tasks.videoTask") : x.type === "QUESTIONNAIRE" ? t("tasks.questionnaire") : t("tasks.infoScreen");

  return (
    <div className="ui-tbl-wrap recd-tasks">
      <table className="ui-tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>{t("tasks.task")}</th>
            <th>{t("tasks.takes")}</th>
            <th>{t("tasks.result")}</th>
            <th>{t("tasks.clip")}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((x) => {
            const key = `${x.taskIndex}:${x.repetition}`;
            const answerCount = Object.keys(x.questionnaireAnswers || {}).length;
            const done = x.result === "Done";
            const media = x.clipFile || x.videoFile;
            return (
              <React.Fragment key={key}>
                <tr data-testid="task-row">
                  <td className="recd-muted">{x.taskIndex}</td>
                  <td>
                    <div className="ui-tbl-primary">{taskName(x)}</div>
                    {x.repetition > 1 && <div className="ui-tbl-sub">{t("tasks.repetition", { n: x.repetition })}</div>}
                  </td>
                  <td>
                    {x.takes || ""}
                    {x.takes > 1 && <> <Badge title={t("tasks.lastKeptHint")}>{t("tasks.lastKept")}</Badge></>}
                  </td>
                  <td>
                    <StatusDot tone={RESULT_TONE[x.result] || "idle"}>{t(`tasks.results.${x.result}`, { defaultValue: x.result })}</StatusDot>
                    {lost.has(key) && <> <Badge tone="warn" title={t("tasks.micLostHint")}>{t("tasks.micLost")}</Badge></>}
                  </td>
                  <td>
                    {media && canPlay ? (
                      <span className="recd-clips">
                        {x.clipFile && <ClipPlayer sessionId={sessionId} file={x.clipFile} kind="audio" tickets={tickets} />}
                        {x.videoFile && !videoOpen.has(key) && (
                          <Button size="sm" icon="video" aria-label={t("tasks.playVideo")} title={t("tasks.videoNoSound")} onClick={() => flip(key)} />
                        )}
                      </span>
                    ) : answerCount > 0 && done ? (
                      <button type="button" className="recd-link" onClick={() => setAnswersOf(x)}>
                        {t("tasks.showAnswers", { count: answerCount })}
                      </button>
                    ) : null}
                  </td>
                </tr>
                {x.videoFile && videoOpen.has(key) && canPlay && (
                  <tr className="recd-sub-row">
                    <td />
                    <td colSpan={4}>
                      <ClipPlayer sessionId={sessionId} file={x.videoFile} kind="video" tickets={tickets} autoOpen />{" "}
                      <button type="button" className="recd-link" onClick={() => flip(key)}>{t("tasks.closeVideo")}</button>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      {answersOf && (
        <AnswersModal
          open
          onClose={() => setAnswersOf(null)}
          title={taskName(answersOf)}
          answers={answersOf.questionnaireAnswers}
          questionTexts={questionTexts}
        />
      )}
    </div>
  );
}
