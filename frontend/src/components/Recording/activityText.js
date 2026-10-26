/** One audit entry as a sentence. Values of participant edits never reach the client, only field names. */
export function activityText(t, a) {
  const name = a.user?.name || t("activity.someone");
  const d = a.detail || {};
  switch (a.action) {
    case "reveal":
    case "download":
    case "bundle":
      return t(`activity.actions.${a.action}`, { name });
    case "participant_edit":
      return d.fields?.length
        ? t("activity.actions.participant_edit_fields", { name, fields: d.fields.join(", ") })
        : t("activity.actions.participant_edit", { name });
    case "qc_change":
      return d.from && d.to
        ? t("activity.actions.qc_change_values", { name, from: t(`qc.${d.from}`, { defaultValue: d.from }), to: t(`qc.${d.to}`, { defaultValue: d.to }) })
        : t("activity.actions.qc_change", { name });
    default:
      return t("activity.actions.other", { name, action: a.action });
  }
}
