import React from "react";
import useUploadLabels from "../useUploadLabels";
import "./UploadCards.css";

/** "N need attention" (warn) or "All clear" (ok). */
export default function AttentionPill({ count }) {
  const { t } = useUploadLabels();
  return count > 0
    ? <span className="um-pill warn">{t("cards.needAttention", { count })}</span>
    : <span className="um-pill ok">{t("cards.allClear")}</span>;
}
