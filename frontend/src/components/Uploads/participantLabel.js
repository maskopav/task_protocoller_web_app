// F-112: readable label of a participant field key.
import { prettyName } from "../Recording/recordingFormat";

/**
 * Order: the record's own label, the standard-field catalogue label in the viewer's language,
 * then the key humanised with a trailing "_opt" (optional marker) removed.
 * @param {string} key
 * @param {Function} t  i18next t (any namespace; the common namespace is addressed explicitly)
 * @param {Record<string,string>} [labels]  labels sent with the record, if any
 */
export function participantFieldLabel(key, t, labels) {
  const own = labels?.[key];
  if (typeof own === "string" && own.trim()) return own;
  const base = key.replace(/_opt$/, "");
  for (const k of key === base ? [key] : [key, base]) {
    const label = t(`identifiers.catalogue.${k}.label`, { ns: "common", defaultValue: "" });
    if (label) return label;
  }
  return prettyName(base);
}
