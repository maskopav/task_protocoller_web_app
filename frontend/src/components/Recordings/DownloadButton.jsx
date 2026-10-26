import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button.jsx";

/**
 * Bulk download of the ticked rows, or (nothing ticked) of the current filter.
 * The page header renders it as the page's one primary action.
 */
export default function DownloadButton({ list, variant = "primary" }) {
  const { t } = useTranslation("uploads");
  const n = list.selectedCount;
  let label = t("recordings.download");
  if (n > 0) label = t("recordings.downloadSelected", { count: n });
  else if (list.total > 0) label = t("recordings.downloadAll", { count: list.total });
  return (
    <Button
      variant={variant}
      icon="download"
      disabled={list.downloading || list.total === 0}
      onClick={list.download}
      data-testid="recordings-download"
    >
      {label}
    </Button>
  );
}
