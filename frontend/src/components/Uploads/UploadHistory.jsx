import React from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../ui";
import { formatDateTime } from "../../utils/formatDate";
import { fmtBytes } from "../Recording/recordingFormat";
import "../Recording/Recording.css";

const tone = (a) => (a.code === 200 || a.code === 201 ? "ok" : a.code === 409 ? "neutral" : a.code === 0 || a.deviceReported ? "warn" : "bad");

/** Every request the server received for this session id (newest first). */
export default function UploadHistory({ attempts, deviceLabel }) {
  const { t } = useTranslation("recording");
  return (
    <details className="recd-card recd-fold">
      <summary>
        <h2>{t("history.title")}</h2>
        <span className="recd-xs">{t("history.sub")}</span>
      </summary>
      {attempts == null ? (
        <p className="recd-note">…</p>
      ) : attempts.length === 0 ? (
        <p className="recd-note">{t("history.none")}</p>
      ) : (
        <ul className="recd-list recd-attempts">
          {attempts.map((a) => (
            <li key={a.id}>
              <span>
                <Badge tone={tone(a)}>{a.deviceReported ? t("history.deviceReport") : `HTTP ${a.code}`}</Badge>{" "}
                {t(`history.outcome.${a.outcome}`, { defaultValue: a.outcome })}
                {a.bytes != null && <span className="recd-muted"> · {fmtBytes(a.bytes)}</span>}
              </span>
              <span className="recd-xs">{formatDateTime(a.at)}{deviceLabel ? ` · ${deviceLabel}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
