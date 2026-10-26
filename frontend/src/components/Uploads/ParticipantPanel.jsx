import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui";
import { revealParticipant, updateParticipant } from "../../api/uploads";
import "../Recording/Recording.css";

const PUBLIC_FIELDS = ["patient_code", "visit_number"];
const MASK = "••••••";
const fieldLabel = (k) => k.replace(/_/g, " ");

/**
 * Participant fields of a session. The API sends every value except patient code and
 * visit as null (maskedKeys), and we never invent them: values appear only after the
 * explicit "Show values" (POST reveal, audited) or "Edit" (which reveals first).
 * `onReveal` fires after each audited reveal so the page can refresh its Activity.
 */
export default function ParticipantPanel({ sessionId, participant, canEdit, onUpdated, onReveal }) {
  const { t } = useTranslation("recording");
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
      onReveal?.();
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
    <section className="recd-card" aria-label={t("participant.title")}>
      <div className="recd-card-head">
        <h2>{t("participant.title")}</h2>
        {canEdit && (
          <div className="recd-card-actions">
            {editing ? (
              <>
                <Button size="sm" onClick={save} disabled={busy}>{t("participant.save")}</Button>
                <Button size="sm" variant="quiet" onClick={cancel} disabled={busy}>{t("participant.cancel")}</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="quiet" icon="eye" onClick={toggleReveal} disabled={busy || !masked.size}>
                  {revealed ? t("participant.hide") : t("participant.show")}
                </Button>
                <Button size="sm" variant="quiet" onClick={startEdit} disabled={busy}>{t("participant.edit")}</Button>
              </>
            )}
          </div>
        )}
      </div>

      <dl className="recd-fields">
        {keys.map((k) => {
          const value = shown(k);
          return (
            <div key={k}>
              <dt>{fieldLabel(k)}</dt>
              <dd>
                {editing ? (
                  <input
                    aria-label={fieldLabel(k)}
                    value={draft[k] ?? ""}
                    maxLength={255}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  />
                ) : value == null ? (
                  <span className="recd-masked" data-testid={`masked-${k}`} aria-label={t("participant.hiddenValue")}>{MASK}</span>
                ) : (
                  String(value)
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {error && <div className="recd-error" role="alert">{error}</div>}
      <p className="recd-note">{canEdit ? t("participant.noteEdit") : t("participant.note")}</p>
    </section>
  );
}
