import { useTranslation } from "react-i18next";
import { relParts, lagParts } from "./format";

/**
 * Translated labels for the upload enums (status, review, flags, invalid reasons)
 * plus the translated "x ago" / "delay" phrases. Reusable by every upload page.
 */
export default function useUploadLabels() {
  const { t } = useTranslation("uploads");
  const unitText = (key, p) => (p ? t(`${key}.${p.unit}`, { count: p.n }) : "—");
  return {
    t,
    status: (k) => t(`status.${k}.label`, { defaultValue: k }),
    statusHint: (k) => t(`status.${k}.hint`, { defaultValue: "" }),
    qc: (k) => t(`qc.${k}`, { defaultValue: k }),
    issue: (k) => t(`issues.${k}.label`, { defaultValue: k }),
    issueHint: (k) => t(`issues.${k}.hint`, { defaultValue: "" }),
    invalidReason: (k) => (k ? t(`invalidReason.${k}`, { defaultValue: k }) : ""),
    rel: (iso) => unitText("rel", relParts(iso)),
    lag: (row) => unitText("lag", lagParts(row)),
  };
}
