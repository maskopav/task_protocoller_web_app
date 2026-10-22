import React from "react";
import { fmtBytes, fmtDT } from "./format";
import useUploadLabels from "./useUploadLabels";
import "./Uploads.css";

const cls = (a) => (a.code === 200 || a.code === 201 ? "" : a.code === 409 ? "info" : a.code === 0 || a.deviceReported ? "warn" : "bad");

/** Every request the server received for this session id (newest first). */
export default function UploadHistory({ attempts, deviceLabel }) {
  const { t } = useUploadLabels();
  return (
    <details className="um-panel um-fold">
      <summary>
        <h2 className="um-section-title">{t("history.title")}</h2>
        <span className="um-section-sub" style={{ marginLeft: "auto" }}>{t("history.sub")}</span>
      </summary>
      {attempts == null ? (
        <p className="um-section-sub">…</p>
      ) : attempts.length === 0 ? (
        <p className="um-section-sub">{t("history.none")}</p>
      ) : (
        <ul className="um-attempts">
          {attempts.map((a) => (
            <li key={a.id} className={cls(a)}>
              <div>
                <strong>{a.deviceReported ? t("history.deviceReport") : `HTTP ${a.code}`}</strong>
                {" · "}
                {t(`history.outcome.${a.outcome}`, { defaultValue: a.outcome })}
                {a.bytes != null && <span className="um-muted"> · {fmtBytes(a.bytes)}</span>}
                <div className="a-when um-num">{fmtDT(a.at)}{deviceLabel ? ` · ${deviceLabel}` : ""}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
