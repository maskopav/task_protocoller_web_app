// Minimal pill/tag helpers for the devices and downloads pages.
import React from "react";
import { useTranslation } from "react-i18next";

import { ISSUE_CLS, QC_META, STATUS_CLS } from "../Uploads/format";

export function StatusPill({ status, invalidReason }) {
  const { t } = useTranslation("uploadTools");
  const title = status === "invalid" && invalidReason
    ? t(`invalidReason.${invalidReason}`, { defaultValue: invalidReason })
    : t(`status.${status}.hint`, { defaultValue: "" });
  return (
    <span className={`ut-pill ${STATUS_CLS[status] || "off"}`} title={title}>
      <span className="dot" />{t(`status.${status}.label`, { defaultValue: status })}
    </span>
  );
}

export function QcPill({ qc }) {
  const { t } = useTranslation("uploadTools");
  const m = QC_META[qc] || QC_META.unreviewed;
  return <span className={`ut-pill ${m.cls}`}>{m.icon} {t(`qc.${qc}`, { defaultValue: qc })}</span>;
}

export function IssueTags({ issues = [] }) {
  const { t } = useTranslation("uploadTools");
  return (
    <span className="ut-tags">
      {issues.map((k) => (
        <span key={k} className={`ut-tag ${ISSUE_CLS[k] || ""}`} title={t(`issues.${k}.hint`, { defaultValue: "" })}>
          {t(`issues.${k}.label`, { defaultValue: k })}
        </span>
      ))}
    </span>
  );
}
