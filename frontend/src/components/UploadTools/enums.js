// Enum metadata shared by the devices and downloads pages (cf. ui_design/assets/ui.js).
export const STATUS_CLS = { valid: "ok", validating: "info", invalid: "bad" };
export const QC_META = {
  unreviewed: { cls: "outline", icon: "○" },
  ok: { cls: "ok", icon: "✓" },
  review: { cls: "warn", icon: "!" },
  excluded: { cls: "off", icon: "⊘" },
};
export const ISSUE_CLS = {
  recovered: "bad", interrupted: "bad", skipped: "warn", retakes: "", edited: "info", outdated: "warn",
  late: "warn", duplicate: "", nonstdMic: "bad", nonstdCam: "bad", device: "warn",
};
