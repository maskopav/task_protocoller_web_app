import React, { useState } from "react";
import { setReview, postComment } from "../../api/uploads";
import { QC_KEYS, QC_META, fmtDT } from "./format";
import useUploadLabels from "./useUploadLabels";
import "./Uploads.css";

function Comment({ c }) {
  return (
    <div className="um-comment">
      <span className="um-avatar">{c.who}</span>
      <div>
        <div className="who">
          {c.name || c.who}
          <span className="when">{fmtDT(c.at)}</span>
        </div>
        {c.system ? <div className="sys">{c.text}</div> : <div className="body">{c.text}</div>}
      </div>
    </div>
  );
}

/** Review status buttons + comment thread. Editing controls are disabled without edit rights. */
export default function ReviewPanel({ sessionId, qc, comments, canEdit, onChange, onForbidden }) {
  const L = useUploadLabels();
  const { t } = L;
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
    <section className="um-panel">
      <h2 className="um-section-title">{t("review.title")}</h2>
      <div className="um-qc-options" role="group" aria-label={t("review.title")}>
        {QC_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="um-qc-opt"
            aria-pressed={qc === k}
            disabled={!canEdit || busy}
            onClick={() => choose(k)}
          >
            <span className={`um-pill ${QC_META[k].cls}`}>{QC_META[k].icon}</span>
            {L.qc(k)}
          </button>
        ))}
      </div>
      <div className="um-thread">
        {comments.length ? comments.map((c) => <Comment key={c.id} c={c} />) : <p className="um-section-sub">{t("review.noComments")}</p>}
      </div>
      {canEdit && (
        <>
          <label htmlFor="um-newc" className="um-section-sub">{t("review.addComment")}</label>
          <textarea
            id="um-newc"
            className="um-input"
            value={text}
            maxLength={2000}
            placeholder={t("review.placeholder")}
            onChange={(e) => setText(e.target.value)}
          />
          <div>
            <button className="um-btn um-btn-primary um-btn-sm" type="button" onClick={post} disabled={busy || !text.trim()}>
              {t("review.post")}
            </button>
          </div>
        </>
      )}
      {error && <div className="um-error" role="alert">{error}</div>}
      {!canEdit && <p className="um-note">{t("review.viewOnlyNote")}</p>}
    </section>
  );
}
