import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, StatusDot, TextField } from "../ui";
import { setReview, postComment } from "../../api/uploads";
import { formatDateTime } from "../../utils/formatDate";
import "../Recording/Recording.css";

const QC_KEYS = ["unreviewed", "ok", "review", "excluded"];
const QC_TONE = { unreviewed: "accent", ok: "ok", review: "warn", excluded: "idle" };

function Comment({ c }) {
  return (
    <div className="recd-comment">
      <span className="recd-avatar" aria-hidden="true">{c.who}</span>
      <div>
        <div className="who">
          {c.name || c.who}
          <span className="when">{formatDateTime(c.at)}</span>
        </div>
        {c.system ? <div className="sys">{c.text}</div> : <div className="body">{c.text}</div>}
      </div>
    </div>
  );
}

/** Review status buttons + comment thread. Editing controls exist only with edit rights. */
export default function ReviewPanel({ sessionId, qc, comments, canEdit, onChange, onForbidden }) {
  const { t } = useTranslation("recording");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (e.status === 403) onForbidden?.();
      setError(e.status === 403 ? t("review.forbidden") : t("review.failed", { code: e.message }));
    } finally {
      setBusy(false);
    }
  };

  const choose = (key) => key !== qc && run(async () => {
    const res = await setReview(sessionId, key);
    onChange({ qc: res.qc, comments: res.comments });
  });

  const post = () => {
    const body = text.trim();
    if (!body) return;
    run(async () => {
      const c = await postComment(sessionId, body);
      setText("");
      onChange({ comments: [...comments, c] });
    });
  };

  return (
    <section className="recd-card" aria-label={t("review.title")}>
      <div className="recd-card-head"><h2>{t("review.title")}</h2></div>
      <div className="recd-choice" role="group" aria-label={t("review.title")}>
        {QC_KEYS.map((k) => (
          <button key={k} type="button" aria-pressed={qc === k} disabled={!canEdit || busy} onClick={() => choose(k)}>
            <StatusDot tone={QC_TONE[k]}>{t(`qc.${k}`)}</StatusDot>
          </button>
        ))}
      </div>
      <div className="recd-thread">
        {comments.length ? comments.map((c) => <Comment key={c.id} c={c} />) : <p className="recd-xs">{t("review.noComments")}</p>}
      </div>
      {canEdit && (
        <div className="recd-compose">
          <TextField
            label={t("review.addComment")}
            multiline
            rows={2}
            value={text}
            maxLength={2000}
            placeholder={t("review.placeholder")}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="recd-compose-actions">
            <Button size="sm" onClick={post} disabled={busy || !text.trim()}>{t("review.post")}</Button>
          </div>
        </div>
      )}
      {error && <div className="recd-error" role="alert">{error}</div>}
      {!canEdit && <p className="recd-note">{t("review.viewOnlyNote")}</p>}
    </section>
  );
}
