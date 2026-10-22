import React, { useState } from "react";
import { revealParticipant, updateParticipant } from "../../api/uploads";
import useUploadLabels from "./useUploadLabels";
import "./Uploads.css";

const PUBLIC_FIELDS = ["patient_code", "visit_number"];
const MASK = "••••••";
const fieldLabel = (k) => k.replace(/_/g, " ");

/**
 * Participant fields of a session. The API sends every value except patient code and
 * visit as null (maskedKeys), and we never invent them: values appear only after the
 * explicit "Show values" (POST reveal, audited) or "Edit" (which reveals first).
 */
export default function ParticipantPanel({ sessionId, participant, canEdit, onUpdated }) {
  const { t } = useUploadLabels();
  const [revealed, setRevealed] = useState(null); // full fields once revealed
  const [draft, setDraft] = useState(null); // non-null while editing
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fields = participant.fields || {};
  const masked = new Set(participant.maskedKeys || []);
  const keys = Object.keys(fields);
  const editing = draft !== null;

  const errorText = (e) => {
    if (e.status === 403) return t("participant.errors.forbidden");
    const msg = t(`participant.errors.${e.message}`, { defaultValue: "" });
    return msg || t("participant.errors.generic", { code: e.message });
  };

  const fetchFull = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await revealParticipant(sessionId);
      return res.fields;
    } catch (e) {
      setError(errorText(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const toggleReveal = async () => {
    if (revealed) return setRevealed(null);
    const full = await fetchFull();
    if (full) setRevealed(full);
  };

  const startEdit = async () => {
    const full = revealed || (await fetchFull());
    if (!full) return;
    setRevealed(full);
    setDraft({ ...full });
  };

  const save = async () => {
    const changes = {};
    for (const k of Object.keys(draft)) {
      const next = String(draft[k] ?? "").trim();
      if (next !== String(revealed?.[k] ?? "")) changes[k] = next;
    }
    const blank = PUBLIC_FIELDS.find((k) => k in changes && !changes[k]);
    if (blank) {
      setError(t("participant.errors.required_field", { field: fieldLabel(blank) }));
      return;
    }
    if (!Object.keys(changes).length) {
      setDraft(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await updateParticipant(sessionId, changes);
      setDraft(null);
      setRevealed(null);
      onUpdated?.(res);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setDraft(null);
    setError("");
  };

  const shown = (k) => {
    const v = revealed ? revealed[k] : fields[k];
    return PUBLIC_FIELDS.includes(k) || !masked.has(k) || revealed ? v : null;
  };

  return (
    <section className="um-panel" aria-label={t("participant.title")}>
      <div className="um-section-head">
        <h2 className="um-section-title">{t("participant.title")}</h2>
        {canEdit && (
          <span style={{ display: "flex", gap: "0.4rem" }}>
            {editing ? (
              <>
                <button className="um-btn um-btn-primary um-btn-sm" type="button" onClick={save} disabled={busy}>
                  {t("participant.save")}
                </button>
                <button className="um-btn um-btn-ghost um-btn-sm" type="button" onClick={cancel} disabled={busy}>
                  {t("participant.cancel")}
                </button>
              </>
            ) : (
              <>
                <button className="um-btn um-btn-ghost um-btn-sm" type="button" onClick={toggleReveal} disabled={busy || !masked.size}>
                  {revealed ? `🙈 ${t("participant.hide")}` : `👁 ${t("participant.show")}`}
                </button>
                <button className="um-btn um-btn-ghost um-btn-sm" type="button" onClick={startEdit} disabled={busy}>
                  ✎ {t("participant.edit")}
                </button>
              </>
            )}
          </span>
        )}
      </div>

      <div className="um-meta-grid two">
        {keys.map((k) => {
          const value = shown(k);
          return (
            <div className="um-meta-item" key={k}>
              <span className="m-label">{fieldLabel(k)}</span>
              <span className="m-value">
                {editing ? (
                  <input
                    className="um-input"
                    aria-label={fieldLabel(k)}
                    value={draft[k] ?? ""}
                    maxLength={255}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  />
                ) : value == null ? (
                  <span className="um-masked" data-testid={`masked-${k}`} aria-label={t("participant.hiddenValue")}>
                    {MASK}
                  </span>
                ) : (
                  <span>{String(value) || "—"}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {error && <div className="um-error" role="alert">{error}</div>}
      <p className="um-pii-note">{canEdit ? t("participant.noteEdit") : t("participant.note")}</p>
    </section>
  );
}
