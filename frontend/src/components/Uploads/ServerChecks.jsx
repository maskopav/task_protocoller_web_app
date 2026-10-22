import React from "react";
import useUploadLabels from "./useUploadLabels";
import "./Uploads.css";

const ICON = { ok: "✓", bad: "✕", warn: "!", skip: "…" };

/** The seven server checks (zip checksum, manifest, ids, ...) with the server's detail text. */
export default function ServerChecks({ checks = [] }) {
  const { t } = useUploadLabels();
  return (
    <details className="um-panel um-fold">
      <summary>
        <h2 className="um-section-title">{t("checks.title")}</h2>
      </summary>
      <ul className="um-checklist">
        {checks.map((c) => (
          <li key={c.key}>
            <span className={`ic ${c.result}`} aria-hidden="true">{ICON[c.result] || "…"}</span>
            <span>
              {t(`checks.keys.${c.key}`, { defaultValue: c.key })}
              <span className="why">{c.detail || t(`checks.desc.${c.key}`, { defaultValue: "" })}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
